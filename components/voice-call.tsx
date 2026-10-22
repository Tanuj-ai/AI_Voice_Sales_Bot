"use client";

import { useEffect, useRef, useState } from "react";

type CallStatus =
  | "Idle"
  | "Connecting"
  | "Listening"
  | "Bot Speaking"
  | "Processing"
  | "Ended";
type Language = "en-IN" | "hi-IN";
type Message = {
  id: number;
  role: "customer" | "bot";
  text: string;
  createdAt: number;
};
type RecognitionResult = { isFinal: boolean; 0?: { transcript?: string } };
type RecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
};
type RecognitionErrorEvent = { error: string };
type SpeechRecognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionConstructor = new () => SpeechRecognizer;
type SpeechWindow = Window & {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
};

const maxRecordingBytes = 2 * 1024 * 1024;
const maxCallSaveBodyBytes = 4 * 1024 * 1024;

const statusColors: Record<CallStatus, string> = {
  Idle: "bg-slate-400",
  Connecting: "bg-amber-500",
  Listening: "bg-emerald-500",
  "Bot Speaking": "bg-indigo-600",
  Processing: "bg-amber-500",
  Ended: "bg-slate-400",
};

function getRecognitionConstructor() {
  const browserWindow = window as SpeechWindow;
  return browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
}

function browserCompatibilityError() {
  if (!getRecognitionConstructor()) {
    return "Unsupported browser: live speech recognition needs Chrome on desktop or Android.";
  }
  if (!window.isSecureContext && !["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
    return "Microphone access needs HTTPS. Open this site using its secure https:// address.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "This browser cannot access a microphone. Use Chrome over HTTPS or localhost.";
  }
  if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== "function") {
    return "Unsupported browser: audio recording needs a current version of Chrome.";
  }
  if (typeof window.AudioContext !== "function") {
    return "Unsupported browser: audio recording needs a current version of Chrome.";
  }

  const supportsWebm =
    window.MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ||
    window.MediaRecorder.isTypeSupported("audio/webm");
  return supportsWebm ? "" : "This browser cannot record the required WebM audio. Use Chrome on desktop or Android.";
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function VoiceCall() {
  const [status, setStatus] = useState<CallStatus>("Idle");
  const [language, setLanguage] = useState<Language>("en-IN");
  const [consentGiven, setConsentGiven] = useState(false);
  const [callReady, setCallReady] = useState(false);
  const [savingRecording, setSavingRecording] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [interimText, setInterimText] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [browserError, setBrowserError] = useState("");
  const [browserChecked, setBrowserChecked] = useState(false);

  const messagesRef = useRef<Message[]>([]);
  const statusRef = useRef<CallStatus>("Idle");
  const recognitionRef = useRef<SpeechRecognizer | null>(null);
  const recognitionActiveRef = useRef(false);
  const shouldListenRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingDoneRef = useRef<Promise<Blob> | null>(null);
  const recordingStartedRef = useRef(false);
  const callIdRef = useRef<string | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const callActiveRef = useRef(false);
  const callSessionRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const elapsedSecondsRef = useRef(0);
  const silenceTimerRef = useRef<number | null>(null);
  const restartTimerRef = useRef<number | null>(null);
  const silencePromptCountRef = useRef(0);
  const messageIdRef = useRef(0);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBrowserError(browserCompatibilityError());
    setBrowserChecked(true);
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      elapsedSecondsRef.current = elapsed;
      setElapsedSeconds(elapsed);
    }, 500);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, interimText]);

  useEffect(() => {
    return () => {
      callActiveRef.current = false;
      shouldListenRef.current = false;
      if (silenceTimerRef.current !== null) window.clearTimeout(silenceTimerRef.current);
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      try {
        recognitionRef.current?.abort();
        audioSourceRef.current?.stop();
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch {}
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      void audioContextRef.current?.close();
    };
  }, []);

  function setCallStatus(next: CallStatus) {
    statusRef.current = next;
    setStatus(next);
  }

  function setConversation(next: Message[]) {
    messagesRef.current = next;
    setMessages(next);
  }

  function appendMessage(role: Message["role"], text: string) {
    setConversation([
      ...messagesRef.current,
      { id: ++messageIdRef.current, role, text, createdAt: Date.now() },
    ]);
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  function clearRestartTimer() {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }

  function clearResources() {
    clearSilenceTimer();
    clearRestartTimer();
    shouldListenRef.current = false;
    try {
      recognitionRef.current?.abort();
    } catch {}
    recognitionRef.current = null;
    recognitionActiveRef.current = false;
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    try {
      audioSourceRef.current?.stop();
    } catch {}
    audioSourceRef.current = null;
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    } catch {}
    recorderRef.current = null;
    recordingDestinationRef.current = null;
    recordingDoneRef.current = null;
    recordingStartedRef.current = false;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }

  async function finishCall() {
    if (!callActiveRef.current) return;
    const endTime = Date.now();
    const callStartedAt = startedAtRef.current;
    callActiveRef.current = false;
    callSessionRef.current += 1;
    shouldListenRef.current = false;
    clearSilenceTimer();
    clearRestartTimer();
    try {
      recognitionRef.current?.abort();
      audioSourceRef.current?.stop();
    } catch {}
    const duration = callStartedAt === null
      ? elapsedSecondsRef.current
      : Math.floor((endTime - callStartedAt) / 1000);
    elapsedSecondsRef.current = duration;
    setElapsedSeconds(duration);
    startedAtRef.current = null;
    setStartedAt(null);
    setInterimText("");
    setCallReady(false);
    setSavingRecording(true);
    setCallStatus("Processing");

    try {
      const recorder = recorderRef.current;
      let recording: Blob | null = null;
      if (recorder && recordingStartedRef.current) {
        if (recorder.state !== "inactive") recorder.stop();
        recording = await recordingDoneRef.current;
      }
      clearResources();

      const callId = callIdRef.current;
      if (callId) {
        const formData = new FormData();
        const transcript = JSON.stringify(
          messagesRef.current.map((message) => ({
            role: message.role,
            text: message.text,
            ts: new Date(message.createdAt).toISOString(),
          })),
        );
        const transcriptBytes = new Blob([transcript]).size;
        const recordingFits =
          Boolean(recording?.size) &&
          recording!.size <= maxRecordingBytes &&
          recording!.size + transcriptBytes + 64 * 1024 <= maxCallSaveBodyBytes;
        let recordingSizeNotice = "";
        if (recording?.size && recordingFits) {
          formData.append("recording", recording, `${callId}.webm`);
        } else if (recording?.size) {
          recordingSizeNotice =
            "The transcript and summary were saved, but the recording exceeded Vercel's safe upload size and was not saved.";
        }
        formData.append("transcript", transcript);
        formData.append("durationSeconds", String(duration));

        const response = await fetch(`/api/calls/${callId}/end`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) throw new Error(await readApiError(response));
        const result = (await response.json()) as { recordingError?: string | null };
        if (result.recordingError) {
          setError(`The transcript and summary were saved, but the recording upload failed: ${result.recordingError}`);
        } else if (recordingSizeNotice) {
          setError(recordingSizeNotice);
        }
      }
    } catch (caught) {
      setError(`Call ended, but its recording or summary could not be saved: ${errorMessage(caught)}`);
    } finally {
      clearResources();
      callIdRef.current = null;
      setConsentGiven(false);
      setSavingRecording(false);
      setCallStatus("Ended");
    }
  }

  function failCall(message: string, sessionId: number) {
    if (callSessionRef.current !== sessionId) return;
    setError(message);
    void finishCall();
  }

  async function readApiError(response: Response) {
    try {
      const body = (await response.json()) as { error?: string };
      return body.error ?? `Request failed (${response.status}).`;
    } catch {
      return `Request failed (${response.status}).`;
    }
  }

  function scheduleSilenceTimer(sessionId: number) {
    clearSilenceTimer();
    if (!shouldListenRef.current || !callActiveRef.current) return;
    silenceTimerRef.current = window.setTimeout(() => {
      void handleSilence(sessionId);
    }, 8000);
  }

  function startRecognition(sessionId: number) {
    if (
      sessionId !== callSessionRef.current ||
      !callActiveRef.current ||
      !shouldListenRef.current ||
      recognitionActiveRef.current ||
      !recognitionRef.current
    ) {
      return;
    }

    try {
      recognitionRef.current.start();
      recognitionActiveRef.current = true;
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "InvalidStateError") {
        recognitionActiveRef.current = true;
        return;
      }
      failCall("Could not start speech recognition. Check microphone access and try again.", sessionId);
    }
  }

  function beginListening(sessionId: number, keepSilenceCount = false) {
    if (sessionId !== callSessionRef.current || !callActiveRef.current) return;
    if (!keepSilenceCount) silencePromptCountRef.current = 0;
    setInterimText("");
    shouldListenRef.current = true;
    setCallStatus("Listening");
    scheduleSilenceTimer(sessionId);
    startRecognition(sessionId);
  }

  async function playBotAudio(text: string, sessionId: number, endAfterSpeech: boolean, keepSilenceCount = false) {
    if (sessionId !== callSessionRef.current || !callActiveRef.current) return;
    shouldListenRef.current = false;
    clearSilenceTimer();
    setCallStatus("Processing");

    const audioResponse = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!audioResponse.ok) throw new Error(await readApiError(audioResponse));

    const context = audioContextRef.current;
    if (!context) throw new Error("Audio playback is unavailable. Please start the call again.");
    await context.resume();
    const audioData = await audioResponse.arrayBuffer();
    const audioBuffer = await context.decodeAudioData(audioData);
    if (sessionId !== callSessionRef.current || !callActiveRef.current) return;

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);
    if (recordingDestinationRef.current) source.connect(recordingDestinationRef.current);
    audioSourceRef.current = source;
    setCallStatus("Bot Speaking");

    await new Promise<void>((resolve, reject) => {
      source.onended = () => {
        if (audioSourceRef.current === source) audioSourceRef.current = null;
        resolve();
      };
      try {
        source.start();
      } catch (caught) {
        reject(caught);
      }
    });

    if (sessionId !== callSessionRef.current || !callActiveRef.current) return;
    if (endAfterSpeech) void finishCall();
    else beginListening(sessionId, keepSilenceCount);
  }

  async function speakBotMessage(text: string, sessionId: number, endAfterSpeech = false, keepSilenceCount = false) {
    if (sessionId !== callSessionRef.current || !callActiveRef.current) return;
    appendMessage("bot", text);
    try {
      await playBotAudio(text, sessionId, endAfterSpeech, keepSilenceCount);
    } catch (caught) {
      failCall(`Bot voice could not be played: ${errorMessage(caught)}`, sessionId);
    }
  }

  async function handleSilence(sessionId: number) {
    if (
      sessionId !== callSessionRef.current ||
      !callActiveRef.current ||
      !shouldListenRef.current ||
      statusRef.current !== "Listening"
    ) {
      return;
    }

    shouldListenRef.current = false;
    clearSilenceTimer();
    try {
      recognitionRef.current?.stop();
    } catch {}

    if (silencePromptCountRef.current === 0) {
      silencePromptCountRef.current = 1;
      await speakBotMessage("Hello, are you still there?", sessionId, false, true);
      return;
    }

    silencePromptCountRef.current = 2;
    await speakBotMessage("I haven't heard back, so I'll let you go. Goodbye!", sessionId, true);
  }

  async function handleCustomerTurn(text: string, sessionId: number) {
    appendMessage("customer", text);
    setInterimText("");
    const chatHistory = messagesRef.current.map((message) => ({
      role: message.role === "customer" ? "user" : "assistant",
      content: message.text,
    }));

    try {
      setCallStatus("Processing");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: chatHistory, language }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as { reply?: string; endCall?: boolean };
      const reply = result.reply?.trim();
      if (!reply) throw new Error("The assistant returned an empty reply. Please try again.");
      await speakBotMessage(reply, sessionId, Boolean(result.endCall));
    } catch (caught) {
      failCall(`The conversation could not continue: ${errorMessage(caught)}`, sessionId);
    }
  }

  function configureRecognition(sessionId: number, selectedLanguage: Language) {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) throw new Error("Speech recognition is not available in this browser. Use Chrome on desktop or Android.");

    const recognition = new Recognition();
    recognition.lang = selectedLanguage;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (sessionId !== callSessionRef.current || !shouldListenRef.current) return;
      const finalParts: string[] = [];
      const interimParts: string[] = [];
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) continue;
        if (result.isFinal) finalParts.push(transcript);
        else interimParts.push(transcript);
      }

      const liveText = interimParts.join(" ").trim();
      setInterimText(liveText);
      if (liveText) scheduleSilenceTimer(sessionId);

      const finalText = finalParts.join(" ").replace(/\s+/g, " ").trim();
      if (!finalText) return;
      silencePromptCountRef.current = 0;
      shouldListenRef.current = false;
      clearSilenceTimer();
      setCallStatus("Processing");
      try {
        recognition.stop();
      } catch {}
      void handleCustomerTurn(finalText, sessionId);
    };
    recognition.onerror = (event) => {
      if (sessionId !== callSessionRef.current || !callActiveRef.current) return;
      if (event.error === "no-speech" || event.error === "aborted") return;
      const message =
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access was denied. In Chrome, open the site controls beside the address, allow Microphone, reload, check recording consent, and try again."
          : event.error === "audio-capture"
            ? "No microphone was found. Connect a microphone and try again."
            : event.error === "network"
              ? "Chrome could not connect to its speech recognition service. Check your internet connection, then start a new call. Speech recognition needs to be online."
              : `Speech recognition failed (${event.error}). Check your connection and microphone, then try again.`;
      failCall(message, sessionId);
    };
    recognition.onend = () => {
      recognitionActiveRef.current = false;
      if (sessionId !== callSessionRef.current || !shouldListenRef.current || !callActiveRef.current) return;
      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => startRecognition(sessionId), 200);
    };
    recognitionRef.current = recognition;
  }

  async function startCall() {
    if (callActiveRef.current || !browserChecked || browserError || !consentGiven) return;
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("Speech recognition is not available in this browser. Use Chrome on desktop or Android.");
      return;
    }
    if (!window.MediaRecorder) {
      setError("Audio recording is not available in this browser. Use Chrome on desktop or Android.");
      return;
    }
    const recordingMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : null;
    if (!recordingMimeType) {
      setError("This browser cannot record audio in the required WebM format. Use Chrome on desktop or Android.");
      return;
    }

    const sessionId = ++callSessionRef.current;
    setError("");
    setCallReady(false);
    setConversation([]);
    setInterimText("");
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    startedAtRef.current = null;
    setStartedAt(null);
    silencePromptCountRef.current = 0;
    callActiveRef.current = true;
    setCallStatus("Connecting");

    try {
      const context = new AudioContext();
      audioContextRef.current = context;
      const recordingDestination = context.createMediaStreamDestination();
      recordingDestinationRef.current = recordingDestination;
      void context.resume().catch(() => undefined);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone access requires HTTPS or localhost. Open this site in Chrome and allow the microphone.");
      }
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (sessionId !== callSessionRef.current) {
        micStream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = micStream;
      const micSource = context.createMediaStreamSource(micStream);
      micSource.connect(recordingDestination);
      micSourceRef.current = micSource;

      const recorder = new MediaRecorder(recordingDestination.stream, {
        mimeType: recordingMimeType,
        audioBitsPerSecond: 48_000,
      });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      let resolveRecording!: (blob: Blob) => void;
      let rejectRecording!: (reason?: unknown) => void;
      const recordingDone = new Promise<Blob>((resolve, reject) => {
        resolveRecording = resolve;
        rejectRecording = reject;
      });
      recorder.onstop = () => {
        resolveRecording(new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.onerror = () => {
        const recordingError = new Error("The browser stopped recording unexpectedly.");
        rejectRecording(recordingError);
        if (callActiveRef.current) failCall(`Audio recording failed: ${recordingError.message}`, sessionId);
      };
      recorderRef.current = recorder;
      recordingDoneRef.current = recordingDone;

      const callResponse = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language, consentGiven }),
      });
      if (!callResponse.ok) throw new Error(await readApiError(callResponse));
      const createdCall = (await callResponse.json()) as { callId?: string };
      if (!createdCall.callId) throw new Error("The call record could not be created.");
      callIdRef.current = createdCall.callId;
      setCallReady(true);
      recorder.start();
      recordingStartedRef.current = true;
      const now = Date.now();
      startedAtRef.current = now;
      setStartedAt(now);
      configureRecognition(sessionId, language);

      setCallStatus("Processing");
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: true, messages: [], language }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const result = (await response.json()) as { reply?: string; endCall?: boolean };
      const greeting = result.reply?.trim();
      if (!greeting) throw new Error("The assistant returned an empty greeting.");
      await speakBotMessage(greeting, sessionId, Boolean(result.endCall));
    } catch (caught) {
      const errorName = caught instanceof Error ? caught.name : "";
      const message =
        errorName === "NotAllowedError" || errorName === "SecurityError"
          ? "Microphone access was denied. In Chrome, open the site controls beside the address, allow Microphone, reload, check recording consent, and try again."
          : errorName === "NotFoundError"
            ? "No microphone was found. Connect a microphone and try again."
            : errorName === "NotReadableError"
              ? "The microphone is busy or unavailable. Close other apps using it and try again."
              : errorMessage(caught);
      failCall(message, sessionId);
    }
  }

  const isActive = status !== "Idle" && status !== "Ended";

  return (
    <section className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside aria-label="Call controls" className="flex min-w-0 flex-col gap-5 rounded-3xl border border-white/80 bg-white/90 p-4 shadow-[0_18px_50px_-36px_rgba(30,41,59,0.4)] ring-1 ring-slate-200/70 sm:p-6 lg:sticky lg:top-6 lg:self-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Call controls</p>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span role="status" aria-live="polite" className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200/70">
              <span className={`h-2.5 w-2.5 rounded-full ${statusColors[status]} ${status === "Listening" ? "animate-pulse" : ""}`} />
              {status}
            </span>
            <span className="font-mono text-sm tabular-nums text-slate-600">{formatDuration(elapsedSeconds)}</span>
          </div>
        </div>

        <label className="flex flex-col gap-2 text-sm font-medium text-slate-700">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
            disabled={isActive}
            className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
          >
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">Hindi</option>
          </select>
        </label>
        <p className="-mt-3 text-xs leading-5 text-slate-500">
          Live transcription uses Chrome&apos;s online speech service, so stay connected during calls.
        </p>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <button
            type="button"
            onClick={() => void startCall()}
            disabled={isActive || !browserChecked || Boolean(browserError) || !consentGiven}
            className="min-h-12 rounded-xl bg-indigo-700 px-4 py-3 font-semibold text-white shadow-sm shadow-indigo-900/15 transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          >
            {status === "Ended" ? "Start Another Call" : "Start Call"}
          </button>
          <button
            type="button"
            onClick={() => void finishCall()}
            disabled={!isActive || !callReady}
            className="min-h-12 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            End Call
          </button>
        </div>

        {browserError && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
            {browserError}
          </p>
        )}

        <label className="flex cursor-pointer gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/80 p-4 text-sm leading-5 text-slate-700 transition hover:border-indigo-200">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(event) => setConsentGiven(event.target.checked)}
            disabled={isActive}
            className="mt-1 h-4 w-4 shrink-0 accent-indigo-700"
          />
          <span>
            <span className="block font-semibold text-slate-900">I agree to have this call recorded.</span>
            <span className="mt-1 block">The mixed audio is stored in a private Supabase bucket for call review.</span>
          </span>
        </label>
        <p className="text-xs leading-5 text-slate-500">
          {savingRecording
            ? "Saving the recording, transcript, and call summary…"
            : "Aria will say that the call is being recorded before the conversation begins. Consent is required to start."}
        </p>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm leading-5 text-rose-800">
            {error}
          </p>
        )}
      </aside>

      <div className="flex min-h-[420px] min-w-0 flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/90 shadow-[0_18px_50px_-36px_rgba(30,41,59,0.4)] ring-1 ring-slate-200/70 sm:min-h-[520px] lg:min-h-[560px]">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200/80 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-800">Conversation</p>
            <p className="mt-1 text-sm text-slate-500">Talk naturally; Aria replies after each turn.</p>
          </div>
          <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 sm:inline-flex sm:items-center sm:gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {language === "hi-IN" ? "Hindi" : "English"}
          </span>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/65 p-4 sm:p-7" aria-live="polite" aria-relevant="additions text">
          {messages.length === 0 && !interimText && (
            <div className="flex min-h-[310px] items-center justify-center text-center sm:min-h-[410px]">
              <div className="max-w-sm">
                <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-800 shadow-inner" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" className="size-6">
                    <rect x="9" y="3" width="6" height="12" rx="3" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3m-4 0h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </div>
                <p className="mt-4 font-semibold text-slate-900">Your conversation will appear here</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Allow microphone access, then start a call to speak with Aria.
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "customer" ? "justify-end" : "justify-start"}`}>
              <div className={`min-w-0 max-w-[88%] rounded-2xl px-4 py-3 sm:max-w-[75%] ${message.role === "customer" ? "rounded-br-md bg-indigo-700 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-800"}`}>
                <p className={`mb-1 text-xs font-semibold ${message.role === "customer" ? "text-indigo-100" : "text-indigo-700"}`}>
                  {message.role === "customer" ? "You" : "Aria"}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.text}</p>
                <time className={`mt-2 block text-right text-[11px] ${message.role === "customer" ? "text-indigo-200" : "text-slate-400"}`}>
                  {new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(message.createdAt)}
                </time>
              </div>
            </div>
          ))}

          {interimText && (
            <div className="flex justify-end">
              <div className="min-w-0 max-w-[88%] rounded-2xl rounded-br-md border border-dashed border-indigo-300 bg-indigo-50 px-4 py-3 text-indigo-900 sm:max-w-[75%]">
                <p className="mb-1 text-xs font-semibold text-indigo-500">You · listening</p>
                <p className="break-words text-sm italic leading-6">{interimText}</p>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>
    </section>
  );
}
