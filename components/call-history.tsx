"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

type CallListItem = {
  id: string;
  started_at: string;
  duration_seconds: number | null;
  language: "en-IN" | "hi-IN";
  summary: string | null;
  status: string | null;
  recording_path: string | null;
};

function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Duration unavailable";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s`;
}

function statusStyle(status: string | null) {
  switch (status) {
    case "Converted":
      return "bg-emerald-100 text-emerald-800";
    case "Demo Requested":
    case "Interested":
      return "bg-indigo-100 text-indigo-800";
    case "Follow-up Required":
      return "bg-amber-100 text-amber-900";
    case "Not Interested":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function CallHistory() {
  const [calls, setCalls] = useState<CallListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError("");
    void fetch("/api/calls", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { calls?: CallListItem[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Call history could not be loaded.");
        if (mounted) setCalls(body.calls ?? []);
      })
      .catch((caught: unknown) => {
        if (mounted) setError(caught instanceof Error ? caught.message : "Call history could not be loaded.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [reloadKey]);

  return (
    <main className="min-h-screen px-4 py-6 sm:px-8 sm:py-9">
      <div className="mx-auto flex max-w-5xl flex-col gap-7">
        <AppHeader
          title="Call history"
          subtitle="Review recordings, customer needs, and follow-up actions."
          actionHref="/"
          actionLabel="Start a call"
        />

        {loading && (
          <div role="status" className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-6 text-sm text-slate-600 shadow-sm">
            <span className="size-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-700" aria-hidden="true" />
            Loading your calls…
          </div>
        )}

        {!loading && error && (
          <section role="alert" className="rounded-2xl border border-rose-200 bg-white p-6 shadow-sm sm:p-8">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-rose-700">Could not load calls</p>
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

        {!loading && !error && calls.length === 0 && (
          <section className="rounded-3xl border border-slate-200/80 bg-white px-6 py-12 text-center shadow-sm sm:py-16">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-700" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" className="size-6">
                <path d="M5 6.5h14v13H5zM8 3.5v6m8-6v6M5 11h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">No calls yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              Completed calls will appear here with their summaries, recordings, and next steps.
            </p>
            <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-800">
              Start your first call
            </Link>
          </section>
        )}

        {!loading && !error && calls.length > 0 && (
          <section aria-label="Past calls" className="space-y-4">
            <div className="flex items-center justify-between gap-3 px-1">
              <h2 className="text-sm font-semibold text-slate-700">Recent calls</h2>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                {calls.length} {calls.length === 1 ? "call" : "calls"}
              </span>
            </div>
            <div className="grid gap-3">
              {calls.map((call) => (
                <Link
                  key={call.id}
                  href={`/history/${call.id}`}
                  className="group min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-slate-900/5 focus-visible:outline-indigo-600 sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{formatStartedAt(call.started_at)}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        {formatDuration(call.duration_seconds)} <span aria-hidden="true">·</span> {call.language === "hi-IN" ? "Hindi" : "English (India)"}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(call.status)}`}>
                      {call.status ?? "Summary pending"}
                    </span>
                  </div>
                  <p className="mt-4 line-clamp-2 break-words text-sm leading-6 text-slate-600">
                    {call.summary ?? "Summary is not available for this call."}
                  </p>
                  <span className="mt-4 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-indigo-700">
                    View call details <span aria-hidden="true" className="transition group-hover:translate-x-0.5">→</span>
                    {call.recording_path && <span className="font-normal text-slate-400">· recording saved</span>}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
