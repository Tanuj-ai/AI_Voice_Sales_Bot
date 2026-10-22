import { NextResponse } from "next/server";
import { supabaseAdminFetch, supabaseError } from "@/lib/supabase-admin";

type Language = "en-IN" | "hi-IN";

export async function GET() {
  try {
    const response = await supabaseAdminFetch(
      "/rest/v1/calls?select=id,started_at,ended_at,duration_seconds,language,summary,status,status_reason,recording_path&order=started_at.desc&limit=100",
    );
    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: 502 });
    }
    return NextResponse.json({ calls: await response.json() });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load call history." },
      { status: 503 },
    );
  }
}

function isLanguage(value: unknown): value is Language {
  return value === "en-IN" || value === "hi-IN";
}

export async function POST(request: Request) {
  let body: { language?: unknown; consentGiven?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    body = parsed as typeof body;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!isLanguage(body.language)) {
    return NextResponse.json({ error: "Language must be en-IN or hi-IN." }, { status: 400 });
  }
  if (body.consentGiven !== true) {
    return NextResponse.json({ error: "Recording consent is required to start a call." }, { status: 400 });
  }

  const consentTimestamp = new Date().toISOString();
  try {
    const response = await supabaseAdminFetch("/rest/v1/calls?select=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        language: body.language,
        consent_given: true,
        consent_timestamp: consentTimestamp,
      }),
    });
    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: 502 });
    }

    const rows = (await response.json()) as Array<{ id?: string }>;
    if (!rows[0]?.id) {
      return NextResponse.json({ error: "Supabase did not return a call ID." }, { status: 502 });
    }
    return NextResponse.json({ callId: rows[0].id, consentTimestamp });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not create a call record." },
      { status: 503 },
    );
  }
}
