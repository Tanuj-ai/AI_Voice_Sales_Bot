"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

type TranscriptEntry = { role: "customer" | "bot"; text: string; ts: string };
type CallDetailData = {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  language: "en-IN" | "hi-IN";
  transcript: TranscriptEntry[];
  summary: string | null;
  customer_requirements: string[];
  objections: string[];
  next_steps: string[];
  status: string | null;
  status_reason: string | null;
  recording_path: string | null;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(date);
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      {items.length > 0 ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-600">
          {items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">None recorded.</p>
      )}
    </section>
  );
}

export function CallDetail({ callId }: { callId: string }) {
  const [call, setCall] = useState<CallDetailData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioUrlExpiresIn, setAudioUrlExpiresIn] = useState(600);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    void fetch(`/api/calls/${callId}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          call?: CallDetailData;
          audioUrl?: string | null;
          audioUrlExpiresIn?: number;
          error?: string;
        };
        if (!response.ok || !body.call) throw new Error(body.error ?? "Call details could not be loaded.");
        if (mounted) {
          setCall(body.call);
          setAudioUrl(body.audioUrl ?? null);
          setAudioUrlExpiresIn(body.audioUrlExpiresIn ?? 600);
        }
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "Call details could not be loaded.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [callId, reloadKey]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto flex max-w-5xl flex-col gap-7">
        <AppHeader
          title="Call review"
          subtitle="Summary, recording, and conversation transcript."
          actionHref="/history"
          actionLabel="Back to history"
        />

        {loading && (
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-6 text-sm text-slate-600 shadow-sm">
            <span className="size-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" aria-hidden="true" />
            Loading call details…
          </div>
        )}

        {!loading && error && (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Could not load this call</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((current) => current + 1)}
              className="mt-5 min-h-11 rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800"
            >
              Try again
            </button>
          </section>
        )}

        {call && !loading && !error && (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-sm text-slate-500">{formatDate(call.started_at)}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold tracking-tight text-slate-950">{call.status ?? "Summary pending"}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    {formatDuration(call.duration_seconds)} <span aria-hidden="true">·</span> {call.language === "hi-IN" ? "Hindi" : "English (India)"}
                  </span>
                </div>
                <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-700">
                  {call.summary ?? "Summary is not available for this call."}
                </p>
                {call.status_reason && (
                  <p className="mt-4 border-t border-slate-100 pt-4 text-sm leading-6 text-slate-500">
                    <span className="font-semibold text-slate-700">Outcome note: </span>{call.status_reason}
                  </p>
                )}
              </div>

              <section className="flex min-w-0 flex-col justify-center rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-slate-900">Recording</h2>
                  {audioUrl && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">Saved privately</span>}
                </div>
                {audioUrl ? (
                  <>
                    <audio className="mt-4 w-full" controls preload="metadata" src={audioUrl}>
                      Your browser does not support audio playback.
                    </audio>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      Playback link expires in {Math.floor(audioUrlExpiresIn / 60)} minutes. Refresh this page for a new link.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-sm leading-6 text-slate-500">No recording was saved for this call.</p>
                )}
              </section>
            </section>

            <section className="grid gap-4 md:grid-cols-3" aria-label="Call notes">
              <ListSection title="Customer requirements" items={call.customer_requirements ?? []} />
              <ListSection title="Objections" items={call.objections ?? []} />
              <ListSection title="Next steps" items={call.next_steps ?? []} />
            </section>

            <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Transcript</h2>
                  <p className="mt-1 text-xs text-slate-500">Customer and Aria, in call order.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                  {call.transcript?.length ?? 0} {call.transcript?.length === 1 ? "message" : "messages"}
                </span>
              </div>
              {call.transcript?.length ? (
                <div className="mt-5 space-y-4">
                  {call.transcript.map((entry, index) => (
                    <div key={`${entry.ts}-${index}`} className={`flex min-w-0 ${entry.role === "customer" ? "justify-end" : "justify-start"}`}>
                      <div className={`min-w-0 max-w-[94%] rounded-2xl px-4 py-3 sm:max-w-[78%] ${entry.role === "customer" ? "rounded-br-md bg-indigo-700 text-white" : "rounded-bl-md border border-slate-200 bg-slate-50 text-slate-800"}`}>
                        <div className="mb-1 flex items-center justify-between gap-6">
                          <span className={`text-xs font-semibold ${entry.role === "customer" ? "text-indigo-100" : "text-indigo-700"}`}>
                            {entry.role === "customer" ? "Customer" : "Aria"}
                          </span>
                          <time className={`text-[11px] ${entry.role === "customer" ? "text-indigo-200" : "text-slate-400"}`}>
                            {formatTime(entry.ts)}
                          </time>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No transcript was saved for this call.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
