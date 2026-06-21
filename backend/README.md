# RRR Python Backend

FastAPI backend: Gemini AI, Browserbase deep search, Redis caching.

## Setup

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp app/.env.example app/.env   # fill in API keys
```

## Run

```bash
docker run -d --name recycle-redis -p 6379:6379 redis/redis-stack-server:latest
uvicorn app.main:app --reload --port 8000
```

## Mobile app

In the repo root `.env`:

```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

On a physical device, use your machine's LAN IP instead of `localhost`.
