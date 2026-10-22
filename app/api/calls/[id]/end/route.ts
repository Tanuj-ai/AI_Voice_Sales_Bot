import { NextResponse } from "next/server";
import { supabaseAdminFetch, supabaseBucketName, supabaseError } from "@/lib/supabase-admin";
import { summarizeTranscript, type TranscriptEntry } from "@/lib/call-summary";

const maxRequestBytes = 4 * 1024 * 1024;
const maxRecordingBytes = 2 * 1024 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

function parseTranscript(value: FormDataEntryValue | null): TranscriptEntry[] | null {
  if (typeof value !== "string" || value.length > 500_000) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 500) return null;
    if (
      parsed.some(
        (message) =>
          !message ||
          (message.role !== "customer" && message.role !== "bot") ||
          typeof message.text !== "string" ||
          message.text.trim().length === 0 ||
          message.text.length > 5000 ||
          typeof message.ts !== "string" ||
          Number.isNaN(Date.parse(message.ts)),
      )
    ) {
      return null;
    }
    return parsed as TranscriptEntry[];
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  if (!uuidPattern.test(id)) {
    return NextResponse.json({ error: "Call ID is invalid." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxRequestBytes) {
    return NextResponse.json(
      { error: "Call data exceeds the safe upload size. End the call sooner so its recording can be saved." },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Request body must be multipart form data." }, { status: 400 });
  }

  const transcript = parseTranscript(formData.get("transcript"));
  const durationSeconds = Number(formData.get("durationSeconds"));
  if (!transcript) {
    return NextResponse.json({ error: "Transcript is missing or invalid." }, { status: 400 });
  }
  if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 86_400) {
    return NextResponse.json({ error: "Call duration is invalid." }, { status: 400 });
  }

  const recordingEntry = formData.get("recording");
  const recording = recordingEntry && typeof recordingEntry !== "string" ? recordingEntry : null;
  if (recording && recording.size > maxRecordingBytes) {
    return NextResponse.json(
      { error: "The recording is larger than the safe 2 MB upload size." },
      { status: 413 },
    );
  }
  if (recording && !recording.type.toLowerCase().startsWith("audio/webm")) {
    return NextResponse.json({ error: "Recording must use the audio/webm format." }, { status: 400 });
  }

  try {
    const callResponse = await supabaseAdminFetch(
      `/rest/v1/calls?id=eq.${id}&select=id,consent_given,ended_at`,
    );
    if (!callResponse.ok) {
      return NextResponse.json({ error: await supabaseError(callResponse) }, { status: 502 });
    }
    const calls = (await callResponse.json()) as Array<{
      id: string;
      consent_given: boolean;
      ended_at: string | null;
    }>;
    const call = calls[0];
    if (!call || !call.consent_given) {
      return NextResponse.json({ error: "A consented call record was not found." }, { status: 404 });
    }
    if (call.ended_at) {
      return NextResponse.json({ savedRecording: Boolean(recording), alreadyEnded: true });
    }

    let recordingPath: string | null = null;
    let recordingError: string | null = null;
    if (recording?.size) {
      const path = `${id}.webm`;
      const uploadResponse = await supabaseAdminFetch(
        `/storage/v1/object/${supabaseBucketName()}/${path}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "audio/webm",
            "x-upsert": "true",
          },
          body: await recording.arrayBuffer(),
        },
      );
      if (!uploadResponse.ok) {
        recordingError = await supabaseError(uploadResponse);
      } else {
        recordingPath = path;
      }
    }

    const summary = await summarizeTranscript(transcript);

    const updateResponse = await supabaseAdminFetch(
      `/rest/v1/calls?id=eq.${id}&consent_given=eq.true&ended_at=is.null`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
          transcript,
          recording_path: recordingPath,
          summary: summary.summary,
          customer_requirements: summary.customer_requirements,
          objections: summary.objections,
          next_steps: summary.next_steps,
          status: summary.status,
          status_reason: summary.status_reason,
        }),
      },
    );
    if (!updateResponse.ok) {
      return NextResponse.json({ error: await supabaseError(updateResponse) }, { status: 502 });
    }
    const updatedCalls = (await updateResponse.json()) as Array<{ id: string }>;
    if (updatedCalls.length === 0) {
      return NextResponse.json({ error: "Call was already ended or could not be updated." }, { status: 409 });
    }
    return NextResponse.json({
      savedRecording: Boolean(recordingPath),
      recordingPath,
      recordingError,
      status: summary.status,
    });
  } catch (caught) {
    return NextResponse.json(
      { error: caught instanceof Error ? caught.message : "Could not save the call." },
      { status: 503 },
    );
  }
}
