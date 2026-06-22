# Snapcycle

A mobile app that helps you responsibly get rid of large, awkward, or non-traditional
items (e.g., furniture, mattresses, household hazardous waste, etc.). Photograph an item, let AI identify it, and the app figures out the **simplest
correct path**: throw it in the right home bin, or — if it needs special handling —
research **real local disposal pathways** (donation, city bulky pickup, junk haulers,
mattress/e-waste/HHW collectives, reuse events) grounded in **live web search**. It can
fill in a hauler's booking form for you while you watch, or **text every local junk
hauler at once** and stream their price quotes back in real time. A profile tracks how
many items you've donated, sold, and kept out of the landfill.

Built with **Expo / React Native** + **Supabase**, and a **Python / FastAPI** backend
that orchestrates a multi-agent pipeline over **Google Gemini**, **Browserbase**,
**Redis** (cache + vector RAG), and **Twilio** (hauler SMS bids) — with full tracing via
**Arize Phoenix** and silent-failure capture via **Sentry**.

---

## How it works (end-to-end flow)

```
                     ┌──────────────────────── Expo app (src/) ────────────────────────┐
  Onboarding  ──────▶│ permissions → address/zip → "build my local guide"              │
  (once per loc.)    └──────────────────────────────┬──────────────────────────────────┘
                                                     │ POST /api/research
                                                     ▼
                              Browserbase search × N + Gemini  ──▶  persistent location
                              (curbside, bulky, HHW/e-waste,          RAG in Redis
                               donation, mattress, reuse…)            (location_rag:{zip})

  Scan item ─▶ /api/identify (Gemini vision) ─▶ Confirm (+ optional "it's broken" note)
        │
        ▼
  /api/triage ──┬─ disposableAtHome → "put it in the {trash|recycling}"  (home-disposal)
   (RAG-grounded)│
                └─ needs special pathway
                        │
                        ▼
  /api/disposal-options ── Browserbase (category-aware search) + RAG + Gemini ──▶ ranked
                          DisposalCards (donation / city_bulky_pickup / junk_haulers /
                          recycling_collective / hhw / ewaste), Redis-cached
                        │
                        ▼  user taps a card
  /api/card-detail ── two cooperating Redis agents:
        Agent 1 research_card_detail (next steps + eligibility constraints, RAG + fetch)
        Agent 2 decide_action       (summary + recommendation, routes the UI mode)
                        │
        ┌───────────────┼───────────────────┬───────────────────────────────┐
        ▼               ▼                   ▼                               ▼
   mode "summary"   mode "form"        mode "phone"               junk-haulers path
   (read + link)    Agent S fills the   show number to call        ┌─────────────────────┐
                    booking form in a                              │ /api/haulers/bids   │
                    live Browserbase                               │ Browserbase finds   │
                    browser (review +                              │ local haulers w/    │
                    submit yourself)                               │ phones → Twilio      │
                                                                   │ texts them ALL →     │
                                                                   │ replies stream back  │
                                                                   │ as price quotes      │
                                                                   └─────────────────────┘
                        │
                        ▼
   /api/chat ── ask follow-up questions, grounded in the location RAG + on-screen cards
                        │
                        ▼
   confirm-disposal ──▶ recorded to Supabase (history + profile stats)
```

The **donate / sell / discard** framing, profile stats, and history all live in Supabase;
everything AI- or web-grounded runs on the backend so the Gemini / Browserbase / Twilio
keys never ship in the app.

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────────────┐
│  Expo mobile app (src/) │         │  Python FastAPI backend (backend/)         │
│                         │         │                                            │
│  • Supabase auth        │──JWT───▶│  deps/auth        verify Supabase JWT      │
│  • Expo Router flow      │         │  rrr_identify      Gemini vision           │
│  • disposal-context      │         │  rrr_location_research  Browserbase+Gemini │
│  • onboarding-context    │         │  rrr_triage        home-bin vs special     │
│  • WebView live views    │         │  rrr_disposal      cards (Browserbase+RAG) │
│  • bid quote polling     │         │  rrr_card_agent    2 Redis agents          │
│                         │         │  rrr_chat          RAG-grounded chat        │
│                         │         │  agent_s           Agent S form-fill        │
│                         │         │  rrr_haulers       Browserbase hauler disc. │
│                         │         │  twilio_bids/_sms  SMS bid blast + webhook  │
└─────────────────────────┘         └───────────────┬────────────────────────────┘
          │                                          │
          ▼                       ┌──────────┬───────┼──────────┬──────────────┐
   Supabase (Postgres+Storage)    ▼          ▼       ▼          ▼              ▼
                              Gemini API  Browserbase  Redis Stack       Twilio (SMS)
                              (vision +   (web search  (cache-aside +    blast haulers,
                               text +      + fetch +    vector RAG +     collect quote
                               embeddings) live sess.)  location RAG)    replies via webhook

  Observability:  Arize Phoenix (OpenInference tracing of every agent/LLM stage)
                  Sentry (captures silent failures hidden behind graceful fallbacks)
```

- **Gemini** does vision identification, all text synthesis, and 3072-dim embeddings.
- **Browserbase** powers live web search + page fetch (so disposal options and haulers are
  *real*, not hallucinated) and full cloud browser **sessions** that Agent S drives via
  Playwright over CDP, streamed to the phone in a WebView.
- **Redis Stack** is three things: a cache-aside layer (TTL'd), a **vector index** for
  semantic item-query matching, and the **persistent location RAG** (no TTL) built once
  during onboarding and shared by triage, cards, card-detail, and chat. It's also the
  source of truth for live bid sessions (so the SMS webhook and the polling GET agree).
- **Twilio** runs the junk-hauler **bids**: after Browserbase discovers local haulers with
  phone numbers, the backend texts them all a templated quote request in parallel; each
  reply hits an inbound webhook, gets parsed for a price, and streams into the UI.
- **Agent S** (`agent_s.py`) fills a pickup/booking form in a live Browserbase browser. It
  is intentionally conservative — it **never submits**; the user reviews and submits in the
  live view.
- **Graceful degradation everywhere**: no Twilio number, Browserbase fetch misses, Gemini
  JSON-parse failures, Redis/geoip errors all fall back cleanly — and each is reported to
  **Sentry** via `capture_silent_failure()` so smooth UX never hides a real failure. See
  [`sentry.md`](./sentry.md).

---

## Backend endpoints

| Endpoint | Agent / service | Purpose |
| --- | --- | --- |
| `GET  /health` | — | Public health check |
| `POST /api/research` | `rrr_location_research` | One-time onboarding research → persistent location RAG in Redis |
| `POST /api/identify` | `rrr_identify` | Gemini vision item identification (structured JSON) |
| `POST /api/triage` | `rrr_triage` | First pass: home trash/recycling vs. a special pathway (RAG-grounded) |
| `POST /api/disposal-options` | `rrr_disposal` | Browserbase + RAG + Gemini → ranked `DisposalCard`s (Redis-cached) |
| `POST /api/card-detail` | `rrr_card_agent` | Two Redis agents: research the pathway, then recommend an action/mode |
| `POST /api/chat` | `rrr_chat` | Follow-up Q&A grounded in the location RAG + on-screen cards |
| `POST /api/agent/form` | `agent_s` | Start Agent S filling a booking form in a live Browserbase session |
| `GET  /api/agent/form/{id}` | `agent_s` | Poll Agent S form-fill session status |
| `POST /api/haulers` | `rrr_haulers` | Browserbase + Gemini hauler discovery (real businesses w/ phones) |
| `POST /api/haulers/bids` | `twilio_bids` | Discover haulers + text them all a quote request (returns a bid session) |
| `GET  /api/haulers/bids/{id}` | `twilio_bids` | Poll the bid session — quotes stream in as haulers reply |
| `POST /api/haulers/sms-webhook` | `twilio_bids` | Twilio inbound webhook — a hauler's reply becomes a quote |
| `POST /api/schedule` | `rrr_schedule` | Gemini scheduling-confirmation copy |
| `POST /api/services` | `rrr_service_discovery` | Browserbase + Gemini donate/sell/discard service discovery |
| `GET/POST /api/location/*` | `geoip` / `location` | IP location detect + municipal rule sets |
| `POST /api/recycle`, `/api/recycle/upload` | `agent/orchestrator` | Legacy recycling-instruction pipeline (text/image) |
| `GET  /debug/sentry-test` | — | Emits a test Sentry event (remove/protect in prod) |

`/api/*` routes verify a Supabase JWT when `AUTH_REQUIRED=true`; in dev
(`AUTH_REQUIRED=false`) they allow anonymous access and attach the user id when a token
is present. The Twilio webhook is unauthenticated (called by Twilio) and optionally
verifies the `X-Twilio-Signature` header.

---

## Prerequisites

- **Node.js 20+** (mobile app) and **Python 3.11+** (backend)
- **Docker** for **Redis Stack** (the Search module powers the vector index + RAG)
- A **Supabase** project
- A **Google Gemini** API key — <https://aistudio.google.com/apikey>
- A **Browserbase** API key **+ matching project ID** — <https://browserbase.com>
  (the project ID must belong to the same account/project that issued the key)
- *(optional)* a **Twilio** account (SMS hauler bids), a **Sentry** DSN, and an **Arize
  Phoenix** endpoint + key
- The app runs in **Expo Go** for quick testing; live Browserbase views render in a
  `react-native-webview`.

## 1. Supabase setup

1. Create a project at <https://supabase.com>.
2. **Authentication → Providers → Email**: enable email/password.
3. **SQL editor** → run [`supabase/schema.sql`](./supabase/schema.sql) (creates `profiles`
   and `items`, the leaderboard view, the `item-photos` bucket, stats triggers, and **RLS
   on everything**).
4. **Project Settings → API** → copy the **Project URL** and **anon/publishable key**.
5. *(optional)* add a test user with **Auto Confirm User** for an easy dev login.

## 2. Mobile app

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
EXPO_PUBLIC_API_URL=http://localhost:8000

# Optional
EXPO_PUBLIC_SENTRY_DSN=                 # same DSN works for app + backend
# Dev-only: prefill the login form so you don't retype an account each reload
# EXPO_PUBLIC_DEV_EMAIL=admin@rrr.test
# EXPO_PUBLIC_DEV_PASSWORD=your-dev-password
```

```bash
npx expo start --clear
```

Scan the QR with **Expo Go** (phone + computer on the same Wi-Fi).

> `.env` is gitignored. `EXPO_PUBLIC_*` values are embedded in the app bundle — fine for
> the Supabase anon key (protected by RLS). Gemini / Browserbase / Twilio keys are **never**
> in the app; they live only on the backend. On a physical device set `EXPO_PUBLIC_API_URL`
> to your machine's **LAN IP** (e.g. `http://192.168.x.x:8000`), not `localhost`.

## 3. Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
cp app/.env.example app/.env
```

Fill in `backend/app/.env` (only the keys matter; the rest have sane defaults):

```
GOOGLE_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-2.5-flash

BROWSERBASE_API_KEY=your-browserbase-key
BROWSERBASE_PROJECT_ID=your-browserbase-project-id   # must match the key's account

REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0

# Twilio — optional; enables the hauler SMS "bids" flow. Without it, the app still
# discovers haulers and shows tap-to-call numbers (no auto-texting).
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=                   # E.164 SMS-capable number, e.g. +14155551234
TWILIO_VALIDATE_SIGNATURE=false       # verify X-Twilio-Signature on the inbound webhook

# Optional Supabase JWT verification (leave false for dev)
SUPABASE_URL=
SUPABASE_ANON_KEY=
AUTH_REQUIRED=false

# Observability (optional)
SENTRY_DSN=                           # captures silent failures; blank = disabled
PHOENIX_COLLECTOR_ENDPOINT=           # Arize Phoenix tracing; blank = disabled
PHOENIX_API_KEY=
```

Agent S form automation needs Playwright's Chromium once:

```bash
playwright install chromium
```

Start **Redis Stack** (provides the Search module the vector index + RAG need):

```bash
docker run -d --name recycle-redis -p 6379:6379 redis/redis-stack-server:latest
# after a reboot: docker start recycle-redis
```

> Redis holds **cache + vector index + the persistent location RAG + live bid sessions**.
> The RAG (built once per zip during onboarding) has no TTL so it survives restarts;
> everything else is TTL'd. Skip cleanly with `REDIS_ENABLED=false` — the backend still
> boots and degrades.

Run the backend (bind all interfaces so a physical device can reach it):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

> **Twilio webhook:** for haulers to reply, Twilio must reach `POST /api/haulers/sms-webhook`.
> In local dev, expose the backend with a tunnel (e.g. `ngrok http 8000`) and set that URL
> as the **Messaging webhook** on your Twilio number.

**Verify:** `http://localhost:8000/health` → `{"ok":true,"status":"ok"}`. From the phone's
browser, `http://<your-LAN-IP>:8000/health` should match (allow Python through the
firewall if it times out).

---

## Project layout

```
src/
  app/                       Expo Router screens
    (auth)/                  login, signup
    (tabs)/                  index (home), history, profile
    onboarding.tsx           permissions → address → build local RAG
    camera.tsx               full-screen capture
    flow/                    processing → confirm → triage →
                             home-disposal | (location) → results → action →
                             agent-form | confirm-disposal · chat
    item/[id].tsx            item detail
  components/                ui, flow, disposal, chat, camera, item, leaderboard, effects
  contexts/                  auth-context, onboarding-context, disposal-context
  hooks/                     use-auth, use-profile, use-items, use-camera,
                             use-theme, use-follow-through
  services/                  supabase, auth, api, onboarding, items, storage
  constants/theme.ts         warm flat design system (light-mode only)
  types/, utils/

backend/
  app/
    main.py                  FastAPI app, Sentry init, Phoenix tracing, router wiring
    config.py                settings (reads app/.env and backend/.env)
    observability.py         Phoenix spans + Sentry capture_silent_failure()
    api/                     rrr (agentic), location, recycle routers
    deps/auth.py             Supabase JWT verification
    schemas/rrr.py           request/response models
    services/
      rrr_identify.py        Gemini vision identification
      rrr_location_research.py  onboarding research → persistent location RAG
      rrr_triage.py          home-bin vs special-pathway triage
      rrr_disposal.py        ranked DisposalCards (Browserbase + RAG + Gemini)
      rrr_card_agent.py      two cooperating Redis agents (detail + recommendation)
      rrr_chat.py            RAG-grounded follow-up chat
      agent_s.py             Agent S form-fill over a live Browserbase session
      rrr_haulers.py         Browserbase + Gemini hauler discovery (real phones)
      twilio_bids.py         multi-hauler SMS bid orchestration + inbound reply handling
      twilio_sms.py          thin Twilio SMS wrapper (graceful when unconfigured)
      rrr_schedule.py        scheduling-confirmation copy
      browserbase.py         search / fetch / live sessions
      gemini.py, embeddings.py, vision.py
      cache.py, item_index.py (Redis cache + vector index), geoip.py
      agent/, rules_cache.py, ... (legacy recycle orchestrator)
    data/                    bundled municipal rule sets (berkeley, stanford, ucla, ann_arbor)
  evals/                     Phoenix eval harness + sentry_probe.py
  requirements.txt

supabase/schema.sql          DB schema + RLS policies
sentry.md                    observability writeup: what Sentry catches that the app hides
```

---

## Security & resilience

- **Gemini / Browserbase / Twilio keys are backend-only** and never reach the app.
- When `AUTH_REQUIRED=true`, the backend verifies the Supabase JWT before doing any work.
  The Twilio inbound webhook is called by Twilio (no app JWT) and can verify the
  `X-Twilio-Signature` header (`TWILIO_VALIDATE_SIGNATURE=true`).
- All Supabase tables have **Row Level Security**; the anon key can only touch the
  signed-in user's rows. The leaderboard view exposes aggregate counts + a non-PII handle.
- **Agent S never auto-submits** — it pre-fills the form in a live browser the user
  watches; the user reviews and submits. Hauler bids are sent to businesses' public quote
  lines, not personal numbers.
- Every external dependency **degrades gracefully** and reports the masked failure to
  Sentry (see [`sentry.md`](./sentry.md)). Phoenix traces every agent and LLM call.
- `.env` files are gitignored in both the app (`.env`) and backend (`backend/app/.env`).
```
