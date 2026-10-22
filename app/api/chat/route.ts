import { NextResponse } from "next/server";
import { productFactsForBot } from "@/lib/product-knowledge";

type Language = "en-IN" | "hi-IN";
type Message = { role: "user" | "assistant"; content: string };

const openingPrompt =
  "Begin the call now by clearly saying that the call is being recorded. Then greet the customer as Aria, say you are an AI assistant from FlowDesk, and ask if they can talk for two minutes.";

function systemPrompt(language: Language) {
  return `You are "Aria", a friendly sales representative for FlowDesk, an AI helpdesk software for small businesses. You are on a live voice call.

GOALS
1. Greet the customer and confirm they can talk for 2 minutes.
2. Ask about their business and how they handle customer messages today.
3. Explain FlowDesk in terms of THEIR problem, not a feature list.
4. Handle objections politely and honestly.
5. Close: offer the free trial, or book a demo, or agree a follow-up time.

VOICE RULES
- Speak in 1 to 2 short sentences. Never more than 3.
- Ask only ONE question at a time.
- No bullet points, markdown, emojis, or lists. This is spoken.
- Reply in the same language the customer uses (English or Hindi). The selected call language is ${language === "hi-IN" ? "Hindi" : "English (India)"}.
- Sound warm and natural. Use the customer's name once you know it.

HONESTY RULES
- Only use facts from the PRODUCT FACTS below. If you do not know something, say you will have the team follow up. Never invent prices, features, or discounts.
- Never pressure or mislead the customer.
- If the customer says stop, not interested, or asks to end the call, thank them politely and end.

ENDING
When the conversation is finished, say a short goodbye and append the token [END_CALL] at the very end of your message.

RECORDING
The caller gave consent before the call. This call is being recorded and stored in a private Supabase bucket for call review. At the beginning, clearly say aloud that the call is being recorded. Never claim that it is not recorded.

PRODUCT FACTS
${productFactsForBot}`;
}

function validLanguage(value: unknown): value is Language {
  return value === "en-IN" || value === "hi-IN";
}

function validMessages(value: unknown): value is Message[] {
  return (
    Array.isArray(value) &&
    value.length <= 40 &&
    value.every(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0 &&
        message.content.length <= 2000,
    )
  );
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Add GEMINI_API_KEY to .env.local and restart the server." }, { status: 503 });
  }

  let body: { start?: unknown; language?: unknown; messages?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const language = body.language ?? "en-IN";
  if (!validLanguage(language)) {
    return NextResponse.json({ error: "Language must be en-IN or hi-IN." }, { status: 400 });
  }

  const isStart = body.start === true;
  const messages = isStart ? [{ role: "user" as const, content: openingPrompt }] : body.messages;
  if (!validMessages(messages) || (!isStart && messages.length === 0)) {
    return NextResponse.json({ error: "Conversation history is missing or invalid." }, { status: 400 });
  }

  try {
    const model = process.env.GEMINI_CHAT_MODEL || "gemini-3.8-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt(language) }] },
          contents: messages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: {
            maxOutputTokens: 500,
            thinkingConfig: { thinkingLevel: "low" },
          },
        }),
        cache: "no-store",
      },
    );

    const result = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      return NextResponse.json(
        { error: result.error?.message ?? "Gemini could not generate a reply." },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    const rawText = (result.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text)
      .filter((text): text is string => typeof text === "string")
      .join("")
      .trim();
    const endCall = rawText.includes("[END_CALL]");
    const reply = rawText.replace(/\s*\[END_CALL\]\s*/g, " ").trim();
    if (!reply) {
      return NextResponse.json({ error: "Gemini returned an empty reply." }, { status: 502 });
    }

    return NextResponse.json({ reply, endCall });
  } catch {
    return NextResponse.json({ error: "Could not reach Gemini. Check the server connection and try again." }, { status: 502 });
  }
}
