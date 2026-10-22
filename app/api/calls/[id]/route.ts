import { NextResponse } from "next/server";
import { supabaseAdminFetch, supabaseBucketName, supabaseError, supabaseProjectUrl } from "@/lib/supabase-admin";
import type { CallStatus, TranscriptEntry } from "@/lib/call-summary";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const signedUrlLifetimeSeconds = 600;

type RouteContext = { params: Promise<{ id: string }> };
type CallRecord = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  language: "en-IN" | "hi-IN";
  consent_given: boolean;
  consent_timestamp: string | null;
  transcript: TranscriptEntry[];
  recording_path: string | null;
  summary: string | null;
  customer_requirements: string[];
  objections: string[];
  next_steps: string[];
  status: CallStatus | null;
  status_reason: string | null;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Call ID is invalid." }, { status: 400 });
  }

  try {
    const callResponse = await supabaseAdminFetch(
      `/rest/v1/calls?id=eq.${id}&select=id,started_at,ended_at,duration_seconds,language,consent_given,consent_timestamp,transcript,recording_path,summary,customer_requirements,objections,next_steps,status,status_reason`,
    );
    if (!callResponse.ok) {
      return NextResponse.json({ error: await supabaseError(callResponse) }, { status: 502 });
    }
    const calls = (await callResponse.json()) as CallRecord[];
    const call = calls[0];
    if (!call) return NextResponse.json({ error: "Call was not found." }, { status: 404 });

    let audioUrl: string | null = null;
    if (call.recording_path) {
      if (call.recording_path !== `${id}.webm`) {
        return NextResponse.json({ error: "Recording path is invalid." }, { status: 500 });
      }
      const signingResponse = await supabaseAdminFetch(
        `/storage/v1/object/sign/${supabaseBucketName()}/${call.recording_path}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresIn: signedUrlLifetimeSeconds }),
        },
      );
      if (!signingResponse.ok) {
        return NextResponse.json({ error: await supabaseError(signingResponse) }, { status: 502 });
      }
      const signed = (await signingResponse.json()) as { signedURL?: string };
      if (!signed.signedURL?.startsWith("/object/sign/recordings/")) {
        return NextResponse.json({ error: "Supabase did not return a valid signed URL." }, { status: 502 });
      }
      audioUrl = `${supabaseProjectUrl()}/storage/v1${signed.signedURL}`;
    }

    return NextResponse.json({ call, audioUrl, audioUrlExpiresIn: signedUrlLifetimeSeconds });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not load call details." },
      { status: 503 },
    );
  }
}
