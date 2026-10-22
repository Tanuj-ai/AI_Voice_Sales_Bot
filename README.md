# AI_Voice_Sales_Bot

A Next.js voice sales app built with Tailwind CSS, Supabase, Gemini, the browser
Web Speech API, and Gemini text-to-speech.

## Call flow and saved call review

The call screen requires recording consent before starting. Aria announces the
recording at the beginning. Web Audio mixes the customer's microphone and
Aria's Gemini audio into one WebM recording. On End Call, the app uploads
the recording to the private `recordings` bucket, saves the transcript, and
asks Gemini for the summary, requirements, objections, next steps, and sales
status. The response is checked against the expected JSON shape and six
statuses, retried once if invalid, and falls back to **Follow-up Required**.

The `/history` page lists saved calls. Select a call to see its summary, status,
audio player, transcript, requirements, objections, and next steps. Private
recording links expire after 10 minutes; reload the detail page to get a fresh
link.

The product knowledge base is in `lib/product-knowledge.ts`. It excludes
sample prices marked as placeholders and security claims not provided by the
plan. The call summary is based only on the transcript.

## Set up Supabase and environment values

1. Create a Supabase project.
2. In its SQL Editor, run `supabase/migrations/20261022_create_calls.sql` to
   create the calls table and private recording bucket.
3. Copy the environment template and fill in the required credentials:

   ```powershell
   Copy-Item .env.example .env.local
   ```

   `GEMINI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are
   required for a complete call. Model and voice settings have defaults in the
   template.
4. Keep `.env.local` private and restart the server after editing it. Provider
   credentials are read only by server routes; do not add `NEXT_PUBLIC_` to
   these values.

Get a Gemini API key in [Google AI Studio](https://aistudio.google.com/app/apikey).
The Gemini free tier has usage limits, and Google may use content submitted on
the free tier to improve its products. Use demo data rather than sensitive
customer calls with this configuration.

Live speech recognition uses the browser's online recognition service, so the
call needs an internet connection even though speech-to-text runs in the
browser. Use Chrome on desktop or Android for the best compatibility.

The service-role key is used only by server routes for the private bucket and
calls table. The migration enables row-level security and adds no public
policies for calls or recordings.

## Run locally

Requirements: Node.js 20.9 or newer.

```powershell
npm.cmd install
npm.cmd run dev
```

Open the local address printed by Next.js (normally
[http://localhost:3000](http://localhost:3000)). To check the production build,
run `npm.cmd run build`, then `npm.cmd run start`.

## Test the summary and history

Use Chrome on desktop or Android with the Supabase migration applied and all
three required provider values filled in above.

1. Make a call with consent, allow microphone access, speak at least a few
   turns, then end the call. Wait for the saving message to finish.
2. In Supabase Table Editor, confirm the row contains the consent timestamp,
   transcript, duration, recording path, summary, three summary lists, status,
   and status reason. Confirm the `.webm` object exists in the private
   `recordings` bucket.
3. Open `/history`. Confirm the new call is listed with its date, duration,
   summary, and status. Open it and check the private audio player, transcript,
   requirements, objections, and next steps.
4. Try calls where the customer agrees to start the trial (**Converted**), asks
   for a demo (**Demo Requested**), requests time or a callback (**Follow-up
   Required**), is curious without committing (**Interested**), declines
   (**Not Interested**), or stays silent (**No Response**).
5. To check the fallback while keeping chat working, temporarily set
   `GEMINI_SUMMARY_MODEL` to a nonexistent model name, restart the server,
   and end a call. Its saved status should be **Follow-up Required**. Restore
   the configured summary model afterward.

Vercel Functions accept request bodies up to 4.5 MB. To stay below that limit,
the app sends at most 2 MB of WebM audio plus the transcript in one request. If
a call's recording is too large, the transcript and summary are still saved and
the page explains that the audio was skipped. The mixed recording uses a voice
optimized bitrate to keep typical short sales calls small. If another upload,
summary, or history request fails, the page shows an error message.

## Deploy to Vercel

1. Apply `supabase/migrations/20261022_create_calls.sql` in the Supabase
   project's SQL Editor. Confirm the `calls` table exists and the `recordings`
   bucket is private.
2. Push this project to a Git repository. Create an empty repository on GitHub,
   then run these commands from the project folder in PowerShell (replace the
   repository URL with your own):

   ```powershell
   git init
   git add .
   git commit -m "Initial AI_Voice_Sales_Bot"
   git branch -M main
   git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
   git push -u origin main
   ```

   `.env.local` is excluded by `.gitignore`; never commit provider credentials.
3. In Vercel, choose **Add New → Project**, import the GitHub repository, and
   keep the project root as `./`. Vercel detects Next.js; use the default
   install and build settings (`npm install` and `npm run build`).
4. In the project's **Settings → Environment Variables**, add the values below
   for **Production** and **Preview**. The chat, summary, TTS model, and voice
   settings are optional because the app has defaults; setting them explicitly
   keeps the deployment configuration visible. Do not prefix server credentials with
   `NEXT_PUBLIC_`.

   | Variable | Required | Value |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | Yes | Google AI Studio API key |
   | `GEMINI_CHAT_MODEL` | No | `gemini-3.8-flash` |
   | `GEMINI_SUMMARY_MODEL` | No | `gemini-3.8-flash` |
   | `GEMINI_TTS_MODEL` | No | `gemini-3.8-flash-lite-tts` |
   | `GEMINI_TTS_VOICE` | No | `Kore` |
   | `SUPABASE_URL` | Yes | Supabase project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key; keep private |

   Select both Production and Preview when adding each value. The Development
   environment is optional because local development reads `.env.local`.
5. Select **Deploy**. Wait for the build to finish, then open the generated
   `https://` URL. Browser microphone access requires HTTPS; use Chrome on
   desktop or Android and allow the microphone when prompted.
6. Run the live checks in Section 14 of the build plan: consent, a short call,
   interim transcript, both voices in the recording, saved summary/status, and
   playback from `/history`. Also deny microphone access once to confirm the
   visible recovery instructions.
7. If you change any Vercel environment variable later, redeploy the project;
   existing deployments do not receive updated values automatically.

See Vercel's [Next.js deployment guide](https://vercel.com/docs/frameworks/nextjs)
and [environment variable guide](https://vercel.com/docs/environment-variables/managing-environment-variables)
for the dashboard screens and environment scopes.

## Environment values

| Variable | Used for |
| --- | --- |
| `GEMINI_API_KEY` | Server-side Gemini API access |
| `GEMINI_CHAT_MODEL` | Model used for call replies |
| `GEMINI_SUMMARY_MODEL` | Model used for call summaries and sales status |
| `GEMINI_TTS_MODEL` | Gemini text-to-speech model |
| `GEMINI_TTS_VOICE` | Gemini prebuilt voice name |
| `SUPABASE_URL` | Server-side Supabase connection |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access; keep private |
