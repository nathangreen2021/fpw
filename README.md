# FPW — Fitplus Well

HYROX-style coaching app for Fitplus Well: Monday–Friday programming, Strava-style PBs and leaderboards, voice-note feedback summarised for the coach, Apple Pay memberships (weekly / monthly / annual) and a coach CRM with missed-workout alerts.

## Features

**Athlete app (`/`)**
- **Today** home: greeting, race-day countdown, Mon–Fri week strip (done / missed / today), hero card for the session with duration, blocks and PB efforts, and a weekly recap (sessions ring, minutes, average RPE, PBs, week streak)
- **Focus Mode**: run the session one block at a time, full-screen with big type and a running clock, logging PB efforts as you go
- **Finish flow**: tap-to-rate RPE, time and notes, then straight into a voice note for the coach
- Light and dark mode (follows the phone, or set it in Profile)
- **Voice notes**: record in the browser, live speech-to-text while you talk (editable), audio + transcript sent to the coach
- **PBs**: 14 HYROX benchmark efforts (1 km run, SkiErg, sled push/pull, wall balls, half/full sim, squat/deadlift 1RM…), log from inside a workout or the PB tab, "New PB" detection, progress sparklines
- **Leaderboards** per effort (all-time / last 30 days), like Strava segments
- **Memberships**: weekly, monthly, annual via Stripe Checkout — Apple Pay, Google Pay and cards

**Coach HQ (`/admin`, password protected)**
- Dashboard: active members, MRR, weekly compliance, open alerts, squad mood
- **Athlete feedback feed**: every voice note summarised → mood (great → concern), headline, flags (injury, illness, fatigue, life stress, PB) and a suggested coach action; play the audio, read the transcript
- **Alerts**: athlete misses 2 programmed workouts in a row (configurable), voice note mentions pain/injury/illness, payment failed. Missed-workout alerts auto-resolve when the athlete completes a session. Optional Slack/Discord/Zapier webhook ping
- **Members (CRM)**: plan, status, renewal, last session, 14-day compliance, missed streak, mood, lifetime value, private coach notes, manual plan/status overrides, CSV export
- **Programming**: week grid, create/edit workouts with ordered blocks, tag blocks as PB efforts, draft/publish, start from the HYROX template, copy a week forward
- **Payments**: full payment history and total collected

A full HYROX week is pre-loaded (Compromised Running · Threshold + Sled Work · Aerobic Base · Strength Endurance · Half HYROX Simulation) for last, this and next week.

## Run locally

Requires Node 18+.

```bash
npm install
cp .env.example .env     # optional for local — sensible defaults are built in
npm start
```

- Athlete app: http://localhost:3000 — demo login `sarah@demo.app` / `demo1234` (also `josh@`, `mia@`)
- Coach HQ: http://localhost:3000/admin — dev password `coach123` (set `ADMIN_PASSWORD` for real use)

Without Stripe keys the app runs in **demo mode**: the payment step shows a simulated Apple Pay sheet so you can test the full flow. `npm run reset` wipes `data/` so it reseeds on next start.

## Payments & Apple Pay (Stripe)

1. Create a Stripe account → copy the secret key into `STRIPE_SECRET_KEY` (use `sk_test_…` first).
2. Stripe Dashboard → Settings → Payment methods → turn on **Apple Pay** (and Google Pay). Apple Pay then appears automatically on Stripe's hosted Checkout for Safari / iPhone users — no Apple developer account or domain file needed.
3. Webhook: Developers → Webhooks → add endpoint `https://YOUR-DOMAIN/api/stripe/webhook` with events
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`. Put the signing secret in `STRIPE_WEBHOOK_SECRET`.
   Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. Enable the **Customer portal** (Settings → Billing → Customer portal) so members can change card or cancel from "Manage billing".

Prices are set in cents via `PRICE_WEEKLY`, `PRICE_MONTHLY`, `PRICE_ANNUAL` (`CURRENCY` defaults to AUD). Every payment, renewal and failure is written to the CRM.

## Voice notes

- **Transcription**: done live in the browser (Chrome, Edge, Safari) for free. Set `OPENAI_API_KEY` to transcribe server-side with Whisper when the browser can't (e.g. Firefox).
- **Summaries**: set `ANTHROPIC_API_KEY` to have Claude summarise each note for the coach. Without it, a built-in keyword analyser scores mood and flags injury/illness/fatigue.
- The microphone only works over **HTTPS** (or `localhost`) — every host below provides HTTPS.

## Deploying from GitHub

GitHub Pages only serves static files, so it can't run the server, payments or alerts. Push the repo to GitHub, then connect it to a Node host:

- **Render** (easiest): New → Blueprint → select the repo. `render.yaml` sets up the service and a persistent disk. Fill in `ADMIN_PASSWORD`, `PUBLIC_URL`, Stripe keys in the dashboard.
- **Railway / Fly.io**: use the included `Dockerfile`; mount a volume at `/data`.

The database is a JSON file in `DATA_DIR` (plus audio files) — it **must** live on a persistent disk or it resets on every deploy. That's fine for a single gym; move to Postgres when you're past a few hundred members.

Set `TZ` to your gym's timezone so "today" and missed-workout checks are correct, and `SEED_DEMO=false` before launching for real.

## Project layout

```
server.js            Express API + routes
lib/db.js            JSON datastore
lib/auth.js          sessions, admin password, membership gating
lib/billing.js       Stripe Checkout, webhooks, plans
lib/alerts.js        missed-workout detection + coach alerts/webhook
lib/summarize.js     voice-note transcription + summaries
lib/seed.js          HYROX week template + demo data
lib/events.js        PB / leaderboard efforts
public/              athlete app (index.html, app.js), Coach HQ (admin.html, admin.js), shared styles
```

## Security notes

- Admin login requires `ADMIN_PASSWORD` in production; logins are rate-limited; sessions are httpOnly cookies with hashed tokens.
- Voice-note audio is only served to a logged-in admin.
- Never commit `.env` (already in `.gitignore`).
