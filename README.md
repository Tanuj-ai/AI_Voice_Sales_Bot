# AI_Voice_Sales_Bot

An AI voice sales assistant for FlowDesk. It can hold a short spoken sales conversation, record it with the caller's consent, and save a useful call summary for later review.

[View the project on GitHub](https://github.com/Tanuj-ai/AI_Voice_Sales_Bot)

## What I built

I built a full-stack voice sales demo that brings together a live call screen and a saved-call history:

- The caller chooses English or Hindi, gives recording consent, and talks with Aria.
- The browser shows live speech-to-text, including words while the caller is still speaking.
- Gemini writes Aria's replies using the FlowDesk facts in `lib/product-knowledge.ts`. The bot is instructed not to guess prices, plans, or security details.
- Gemini text-to-speech gives Aria a voice. Web Audio mixes that audio with the caller's microphone so both sides are in the saved recording.
- When the call ends, the app saves the recording, transcript, consent details, and an AI-generated summary to Supabase.
- Call history shows the outcome, customer requirements, objections, next steps, transcript, and a recording player.

The summary status is checked against these six values: **Converted**, **Interested**, **Follow-up Required**, **Not Interested**, **Demo Requested**, and **No Response**. If Gemini returns an invalid summary, the app retries once and then saves a safe **Follow-up Required** result.

## How a call works

1. Check the recording-consent box and choose a language.
2. Start the call and allow microphone access. Aria announces the recording before the conversation begins.
3. Speak naturally. The live transcript appears in the conversation, and Aria replies aloud.
4. Select **End Call**. The app uploads the audio and transcript, then creates the summary.
5. Open **Call history** to review the saved call.

## Technology

| Part | Technology | What it does |
| --- | --- | --- |
| Web app | Next.js and React | Pages and server-side API routes |
| Styling | Tailwind CSS | Responsive call, history, and detail screens |
| Speech recognition | Browser Web Speech API | Turns the caller's speech into live text |
| AI conversation and summary | Gemini API | Creates replies and analyzes completed calls |
| Bot voice | Gemini text-to-speech | Reads Aria's replies aloud |
| Database and audio storage | Supabase | Stores call details and private recordings |
| Audio recording | Web Audio API and MediaRecorder | Mixes the caller and bot voice into one recording |

## Run it on your computer

### 1. Install Node.js

Install Node.js 20.9 or newer. Then open a terminal in this project folder.

### 2. Set up Supabase

Create a Supabase project. In its **SQL Editor**, open and run:

`supabase/migrations/20261022_create_calls.sql`

This creates the `calls` table and the private `recordings` storage bucket.

### 3. Add your keys

In the project terminal, make your local environment file:

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local` in a text editor and fill in these three required values:

| Variable | Where to get it |
| --- | --- |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `SUPABASE_URL` | Supabase project **Settings → API** |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project **Settings → API**; keep this private |

The model and voice settings already have defaults in `.env.example`. You can leave them as they are. Never add `NEXT_PUBLIC_` to these credentials, share `.env.local`, or commit it to GitHub.

The Gemini free tier has usage limits. Google may use content submitted on the free tier to improve its products, so use demo conversations rather than sensitive customer calls.

### 4. Start the app

Run these commands in the project terminal:

```powershell
npm.cmd install
npm.cmd run dev
```

Open [http://localhost:3000](http://localhost:3000). If you change `.env.local` while the app is running, stop the server with **Ctrl+C** and run `npm.cmd run dev` again.

## Try a test call

Use Chrome on a computer or Android device, and make sure you are online. The browser's speech-recognition service needs an internet connection.

1. Open the app, check the consent box, and start a short call.
2. Allow microphone access and speak a few turns.
3. End the call and wait for the saving message to finish.
4. Open **Call history** and select the new call. Check the summary, transcript, notes, and recording.
5. In Supabase, check that the call row was saved and the `.webm` file is in the private `recordings` bucket.

The app limits recordings to a safe upload size. If a recording is too large, it still saves the transcript and summary and tells you that the audio was skipped.

## Deploy to Vercel

1. Make sure the Supabase migration above has been applied.
2. In Vercel, create a project by importing [this GitHub repository](https://github.com/Tanuj-ai/AI_Voice_Sales_Bot).
3. In **Settings → Environment Variables**, add the three required values from the table above. Add the optional model and voice values below only if you want to change the defaults.
4. Deploy the project. Use the generated HTTPS address and Chrome so microphone access can work.
5. Make a short test call and check that its summary and recording appear in call history.

Vercel reads environment variables when it deploys. If you change one later, redeploy the project.

## Environment settings

| Variable | Required | Default |
| --- | --- | --- |
| `GEMINI_API_KEY` | Yes | — |
| `SUPABASE_URL` | Yes | — |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — |
| `GEMINI_CHAT_MODEL` | No | `gemini-3.8-flash` |
| `GEMINI_SUMMARY_MODEL` | No | `gemini-3.8-flash` |
| `GEMINI_TTS_MODEL` | No | `gemini-3.8-flash-lite-tts` |
| `GEMINI_TTS_VOICE` | No | `Kore` |

## Project files

- `app/` — app pages and server API routes for chat, speech, and calls.
- `components/` — call controls, conversation, call history, and call review screens.
- `lib/product-knowledge.ts` — the product facts Aria is allowed to use.
- `lib/call-summary.ts` — summary prompt, validation, and safe fallback.
- `supabase/migrations/` — database table and private recording bucket setup.

## Notes and limitations

- This is a demo and does not include user sign-in. Keep it private and use demo data; add authentication before using it with real customer calls.
- Live transcription uses the browser's online speech-recognition service. It may not work in every browser or when the device is offline.
- The Supabase service-role key stays on the server. Call recordings are stored in a private bucket, and playback links expire after 10 minutes.
- To check a production build locally, run `npm.cmd run build`, then `npm.cmd run start`.
