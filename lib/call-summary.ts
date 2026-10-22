export const callStatuses = [
  "Converted",
  "Interested",
  "Follow-up Required",
  "Not Interested",
  "Demo Requested",
  "No Response",
] as const;

export type CallStatus = (typeof callStatuses)[number];
export type TranscriptEntry = { role: "customer" | "bot"; text: string; ts: string };
export type CallSummary = {
  summary: string;
  customer_requirements: string[];
  objections: string[];
  next_steps: string[];
  status: CallStatus;
  status_reason: string;
};

const summaryPrompt = `You are a sales call analyst. Read the transcript and return ONLY valid JSON (no markdown, no extra text) in exactly this shape:

{
  "summary": "2-3 sentence overview of the call",
  "customer_requirements": ["..."],
  "objections": ["..."],
  "next_steps": ["..."],
  "status": "Converted | Interested | Follow-up Required | Not Interested | Demo Requested | No Response",
  "status_reason": "one sentence explaining the status"
}

If a list has nothing, return an empty array. Use ONLY information in the transcript. Do not guess.

STATUS RULES
- Converted: the customer clearly agrees to buy, sign up, or start the trial now.
- Demo Requested: the customer explicitly asks for a demo or walkthrough.
- Follow-up Required: the customer wants time, more information, a callback, or needs another person to decide.
- Interested: the customer is positive and curious but made no commitment or next step.
- Not Interested: the customer clearly declines.
- No Response: the customer was silent, or the call ended with no meaningful reply (fewer than 2 customer turns).
- If more than one fits, use this priority: Converted, Demo Requested, Follow-up Required, Interested, Not Interested, No Response.`;

const fallbackSummary: CallSummary = {
  summary: "The automated call summary could not be generated. A follow-up is required.",
  customer_requirements: [],
  objections: [],
  next_steps: [],
  status: "Follow-up Required",
  status_reason: "The summary could not be generated or validated, so follow-up is required.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 50 &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 500)
  );
}

function parseSummary(value: string): CallSummary | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)) return null;
    const expectedKeys = [
      "summary",
      "customer_requirements",
      "objections",
      "next_steps",
      "status",
      "status_reason",
    ];
    if (Object.keys(parsed).length !== expectedKeys.length || expectedKeys.some((key) => !(key in parsed))) {
      return null;
    }
    if (
      typeof parsed.summary !== "string" ||
      parsed.summary.trim().length === 0 ||
      parsed.summary.length > 2000 ||
      !stringList(parsed.customer_requirements) ||
      !stringList(parsed.objections) ||
      !stringList(parsed.next_steps) ||
      typeof parsed.status !== "string" ||
      !callStatuses.includes(parsed.status as CallStatus) ||
      typeof parsed.status_reason !== "string" ||
      parsed.status_reason.trim().length === 0 ||
      parsed.status_reason.length > 500
    ) {
      return null;
    }

    return {
      summary: parsed.summary.trim(),
      customer_requirements: parsed.customer_requirements.map((item) => item.trim()),
      objections: parsed.objections.map((item) => item.trim()),
      next_steps: parsed.next_steps.map((item) => item.trim()),
      status: parsed.status as CallStatus,
      status_reason: parsed.status_reason.trim(),
    };
  } catch {
    return null;
  }
}

export async function summarizeTranscript(transcript: TranscriptEntry[]): Promise<CallSummary> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackSummary;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const model = process.env.GEMINI_SUMMARY_MODEL || "gemini-3.8-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: summaryPrompt }] },
            contents: [
              { role: "user", parts: [{ text: `Transcript:\n${JSON.stringify(transcript, null, 2)}` }] },
            ],
            generationConfig: {
              maxOutputTokens: 1200,
              responseMimeType: "application/json",
              thinkingConfig: { thinkingLevel: "low" },
            },
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(30_000),
        },
      );
      const result = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      if (!response.ok) continue;

      const text = (result.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text)
        .filter((text): text is string => typeof text === "string")
        .join("")
        .trim();
      const summary = parseSummary(text);
      if (summary) return summary;
    } catch {
      // Retry once for provider and parsing failures.
    }
  }

  return fallbackSummary;
}
