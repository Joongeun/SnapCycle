# RRR — Reduce, Reuse, Rehome

A mobile app that helps you decide what to do with your stuff. Photograph a large
item, let AI identify it, answer a few questions, and get a recommendation to
**donate**, **sell**, or **discard** it — then find and schedule real local
services to make it happen. A leaderboard tracks how many items you've kept out
of the landfill.

Built with Expo / React Native, Supabase, and a Python / FastAPI backend powered
by Google Gemini, Browserbase, and Redis.

---

## Architecture

```
┌────────────────────┐        ┌────────────────────────────┐
│  Expo mobile app   │        │  Python FastAPI backend    │
│  (src/)            │        │  (backend/)                │
│                    │        │                            │
│  • Supabase auth   │──JWT──▶│  • verifies Supabase JWT   │
│  • decision logic  │        │  • Gemini vision (item ID) │
│  • Supabase DB +   │        │  • Browserbase deep search │
│    Storage         │        │  • Gemini service discovery│
│                    │        │  • Redis cache + vector idx│
└────────────────────┘        └────────────────────────────┘
          │                              │
          ▼                              ▼
   Supabase (Postgres + Storage)   Gemini API · Browserbase · Redis
```

- **Item identification** is sent to the backend (`/api/identify`), which uses
  **Gemini vision** to return a structured item name, category, and description.
- **The donate / sell / discard decision** is computed on-device from the user's
  answers (`src/utils/decision-logic.ts`) — no API call needed.
- **Service discovery & scheduling** go through the backend (`/api/services`,
  `/api/schedule`), which uses **Browserbase** for live web search and **Gemini**
  to synthesize local options. Results are cached in **Redis**.
- **Data** (profiles, items, leaderboard) lives in Supabase with Row Level
  Security so the public anon key can only ever touch the signed-in user's rows.
- The mobile app never holds the Gemini or Browserbase keys — those live only on
  the backend.

---

## Prerequisites

- **Node.js 20+** (mobile app)
- **Python 3.11+** (backend)
- **Docker** (to run Redis Stack locally) — or a Redis Cloud database
- A **Supabase** project
- A **Google Gemini** API key — <https://aistudio.google.com/apikey>
- A **Browserbase** API key + project ID — <https://browserbase.com> (only needed
  for the service-discovery step)
- The mobile app runs in **Expo Go** for quick testing. Skia confetti is a no-op
  in Expo Go; for the full effect use a development build
  (`npx expo run:ios` / `run:android`).

---

## 1. Supabase setup

1. Create a project at <https://supabase.com>.
2. **Authentication → Providers → Email**: enable email/password.
3. Open the **SQL editor** and run [`supabase/schema.sql`](./supabase/schema.sql).
   This creates the `profiles` and `items` tables, the `leaderboard` view, the
   `item-photos` storage bucket, stats triggers, and **Row Level Security
   policies on everything**.
4. From **Project Settings → API**, copy the **Project URL** and the
   **anon/publishable key**.
5. *(Optional)* For an easy test login, **Authentication → Users → Add user** —
   set an email/password and check **Auto Confirm User**.

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

# Dev-only: prefill the login form so you don't retype an account each reload
# EXPO_PUBLIC_DEV_EMAIL=admin@rrr.test
# EXPO_PUBLIC_DEV_PASSWORD=your-dev-password
```

Run it:

```bash
npx expo start --clear
```

Scan the QR code with **Expo Go**. Your phone and computer must be on the same
Wi-Fi.

> `.env` is gitignored. `EXPO_PUBLIC_*` values are embedded in the app bundle —
> fine for the Supabase anon key (protected by RLS). The Gemini and Browserbase
> keys are **never** in the app; they live only on the backend.
>
> On a physical device, set `EXPO_PUBLIC_API_URL` to your machine's **LAN IP**
> (e.g. `http://192.168.x.x:8000`), not `localhost` — on the phone `localhost`
> means the phone itself.

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

# Only needed for the service-discovery step
BROWSERBASE_API_KEY=your-browserbase-key
BROWSERBASE_PROJECT_ID=your-browserbase-project-id

REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379/0

# Optional Supabase JWT verification (leave AUTH_REQUIRED=false for dev)
SUPABASE_URL=
SUPABASE_ANON_KEY=
AUTH_REQUIRED=false
```

Start **Redis Stack** (provides the search module the vector index needs):

```bash
docker run -d --name recycle-redis -p 6379:6379 redis/redis-stack-server:latest
# after a reboot, just: docker start recycle-redis
```

> Redis is a **cache only** — geoip lookups, disposal rules, and item-query
> embeddings, all with TTLs. No app data lives there. If you skip it, the backend
> still boots and degrades gracefully (caching disabled). To skip cleanly, set
> `REDIS_ENABLED=false`.

Run the backend (bind all interfaces so a physical device can reach it):

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The backend exposes:

| Endpoint              | Purpose                                                   |
| --------------------- | --------------------------------------------------------- |
| `GET  /health`        | Public health check                                       |
| `POST /api/identify`  | Gemini vision item identification (structured JSON)       |
| `POST /api/services`  | Browserbase deep search + Gemini donate/sell/discard svcs |
| `POST /api/schedule`  | Gemini scheduling-confirmation draft                      |
| `GET  /api/location/*`| IP-based location detection + municipal recycling rules   |
| `POST /api/recycle`   | Recycling instructions from text and/or an image          |

`/api/*` routes verify a Supabase JWT when `AUTH_REQUIRED=true`; in dev
(`AUTH_REQUIRED=false`) they allow anonymous access and still attach the user id
when a token is present.

**Verify:** open `http://localhost:8000/health` → `{"ok":true,"status":"ok"}`.
From your phone's browser, `http://<your-LAN-IP>:8000/health` should return the
same. If it times out on the phone, allow Python through the Windows Firewall.

---

## Project layout

```
src/
  app/                  Expo Router screens
    (auth)/             login, signup
    (tabs)/             home, history, leaderboard, profile
    flow/               identify → questions → result → services → confirm
    camera.tsx          full-screen capture
    item/[id].tsx       item detail
  components/           UI primitives, flow, item, leaderboard, effects
  services/             supabase, auth, api, items, storage
  contexts/             auth-context, item-context
  hooks/                use-auth, use-items, use-profile, use-leaderboard, ...
  constants/theme.ts    warm flat design system (light-mode only)
  utils/                image, decision-logic, rate-limit, haptics, format

backend/
  app/
    main.py             FastAPI app + router wiring
    config.py           settings (reads app/.env and backend/.env)
    api/                rrr, location, recycle routers
    services/           gemini, browserbase, cache (Redis), geoip, identify, ...
    agent/              recycling-instruction orchestrator + prompts
    data/               bundled municipal rule sets
  requirements.txt

supabase/schema.sql     DB schema + RLS policies
```

## Security model

- The **Gemini and Browserbase keys are backend-only** and never reach the app.
- When `AUTH_REQUIRED=true`, the backend verifies the Supabase JWT before doing
  any work.
- All Supabase tables have **Row Level Security**; the public anon key can only
  read/write the signed-in user's own rows. The leaderboard view exposes only
  aggregate counts and a non-PII display handle (no emails).
- `.env` files are gitignored in both the app (`.env`) and the backend
  (`backend/app/.env`).
