# Snapcycle Python Backend

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

# Simulator: localhost is fine. Physical device: bind all interfaces.
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Mobile app

In the repo root `.env`:

```
EXPO_PUBLIC_API_URL=http://localhost:8000
```

On a physical device, use your machine's LAN IP instead of `localhost`.

## Hauler bids (Twilio SMS)

The junk-hauler card runs a real multi-hauler **bidding** flow — no Yelp, no agent
sign-in:

1. The Browserbase agent discovers ≥ `HAULERS_MIN` (default 3) local haulers with
   phone numbers (cached in Redis).
2. The backend texts them all a templated quote request in parallel via Twilio.
3. Each hauler's reply hits the inbound webhook (`POST /api/haulers/sms-webhook`),
   gets parsed into a price, and streams into the app's HaulerRow list as the app
   polls `GET /api/haulers/bids/{id}`.

Without Twilio configured, haulers are still discovered but shown as **"call only"**
(tap-to-call) — the flow degrades cleanly.

### 1. Twilio credentials

Buy an **SMS-capable** number in the [Twilio Console](https://console.twilio.com)
(Phone Numbers → Buy a number → capability: SMS), then add to `backend/app/.env`:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_FROM_NUMBER=+1XXXXXXXXXX          # the number you bought, E.164
TWILIO_VALIDATE_SIGNATURE=false          # set true in production (verifies X-Twilio-Signature)
HAULERS_MIN=3
```

### 2. Expose the inbound webhook with ngrok

Twilio must reach your backend over the public internet to deliver hauler replies.
In a separate terminal (with the backend running on :8000):

```bash
ngrok http 8000
```

Copy the HTTPS forwarding URL it prints (e.g. `https://ab12cd34.ngrok.io`).

### 3. Point your Twilio number at the webhook

Twilio Console → **Phone Numbers → Manage → Active numbers → [your number] →
Messaging → "A message comes in"**:

- Webhook: `https://<your-ngrok-id>.ngrok.io/api/haulers/sms-webhook`
- Method: **HTTP POST**

Save. Restart `uvicorn` after editing `.env`, then reload the app and pick the
junk-hauler card to start a bid.

### Caveats

- **Landlines can't receive SMS.** Many haulers list landlines; those sends fail and
  show as "call only". Expected and handled.
- **Trial Twilio accounts** can only text *verified* numbers and prepend a trial
  banner — fine for testing with your own phone, but you need a paid number to text
  real haulers.
- ngrok's free URL changes on every restart — re-paste it into the Twilio number
  config each time (or use a reserved domain / deploy the backend for a stable URL).
