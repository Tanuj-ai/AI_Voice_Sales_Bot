import { NextResponse } from "next/server";

type Language = "en-IN" | "hi-IN";

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Add GEMINI_API_KEY to .env.local and restart the server." }, { status: 503 });
  }

  let body: { text?: unknown; language?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0 || body.text.length > 1500) {
    return NextResponse.json({ error: "Text must contain 1 to 1500 characters." }, { status: 400 });
  }
  const language = body.language ?? "en-IN";
  if (language !== "en-IN" && language !== "hi-IN") {
    return NextResponse.json({ error: "Language must be en-IN or hi-IN." }, { status: 400 });
  }

  const model = process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts";
  const voice = process.env.GEMINI_TTS_VOICE || "Kore";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: body.text.trim(),
                  speech_metadata: {
                    style: language === "hi-IN" ? "Warm, clear, natural Hindi speech." : "Warm, clear, natural Indian English speech.",
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { voice } },
          },
        }),
        cache: "no-store",
      },
    );

    const result = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
        };
      }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: `Gemini could not create speech (${response.status}): ${result.error?.message ?? "Unknown provider error."}` },
        { status: response.status >= 500 ? 502 : response.status },
      );
    }

    const audioData = result.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
    if (!audioData?.data) {
      return NextResponse.json({ error: "Gemini returned no speech audio." }, { status: 502 });
    }

    return new Response(new Uint8Array(Buffer.from(audioData.data, "base64")), {
      headers: {
        "Content-Type": audioData.mimeType ?? "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not reach Gemini TTS. Check the server connection and try again." }, { status: 502 });
  }
}
