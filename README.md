# RRR — Reduce, Reuse, Rehome

A mobile app that helps you decide what to do with your stuff. Photograph a large
item, let AI identify it, answer a few questions, and get a recommendation to
**donate**, **sell**, or **discard** it — then find and schedule real local
services to make it happen. A leaderboard tracks how many items you've kept out
of the landfill.

Built with Expo / React Native, Supabase, Google Cloud Vision, and the Claude API.

---

## Architecture

```
┌────────────────────┐        ┌──────────────────────┐
│  Expo mobile app   │        │  Express backend     │
│  (src/)            │        │  (backend/)          │
│                    │        │                      │
│  • Supabase auth   │──JWT──▶│  • verifies JWT      │
│  • Google Vision   │        │  • rate-limits       │
│    (item ID)       │        │  • Claude web_search │
│  • Supabase DB +   │        │    + web_fetch loop  │
│    Storage         │        │  • Claude scheduling │
└────────────────────┘        └──────────────────────┘
          │                              │
          ▼                              ▼
   Supabase (Postgres + Storage)   Anthropic API
```

- **Item identification** runs against Google Cloud Vision directly from the app.
- **Service discovery & scheduling** go through the Express backend so the
  Anthropic key never ships in the app, and every call is behind Supabase auth +
  per-user rate limiting.
- **Data** (profiles, items, leaderboard) lives in Supabase with Row Level
  Security so the public anon key can only ever touch the signed-in user's rows.

---

## Prerequisites

- Node.js 20+
- A Supabase project
- A Google Cloud project with the **Cloud Vision API** enabled + an API key
- An Anthropic API key
- For the camera/Skia features you need a **development build** (Expo Go won't
  work): `npx expo run:ios` or `npx expo run:android`.

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

## 2. Mobile app

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=your-google-vision-key
EXPO_PUBLIC_API_URL=http://localhost:3001
```

Run it (development build recommended):

```bash
npx expo run:ios      # or run:android
```

> `.env` is gitignored. `EXPO_PUBLIC_*` values are embedded in the app bundle —
> fine for the Supabase anon key (protected by RLS), but **restrict the Google
> Vision key** to the Vision API in the Google Cloud console.

## 3. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `backend/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-or-publishable-key
ALLOWED_ORIGINS=
PORT=3001
```

Run it:

```bash
npm run dev
```

The backend exposes:

| Endpoint            | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `GET  /health`      | Public health check                                  |
| `POST /api/services`| Claude agentic web search for donate/sell/discard    |
| `POST /api/schedule`| Claude structured-output scheduling draft            |

Both `/api/*` routes require a valid Supabase JWT and are rate-limited per user.

> When testing on a physical device, set `EXPO_PUBLIC_API_URL` to your machine's
> LAN IP (e.g. `http://192.168.x.x:3001`), not `localhost`.

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
  services/             supabase, auth, api, items, storage, vision
  contexts/             auth-context, item-context
  hooks/                use-auth, use-items, use-profile, use-leaderboard, ...
  constants/theme.ts    warm flat design system (light-mode only)
  utils/                image, decision-logic, rate-limit, haptics, format
backend/                Express proxy for Claude
supabase/schema.sql     DB schema + RLS policies
```

## Security model

- The Anthropic key is **backend-only** and never reaches the app.
- The backend verifies the Supabase JWT and rate-limits each user before calling
  Claude.
- A client-side soft rate limit also caps Google Vision calls per device.
- All Supabase tables have Row Level Security; the leaderboard view exposes only
  aggregate counts and a non-PII display handle (no emails).
- `.env` files are gitignored in both the app and the backend.
