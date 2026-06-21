# Observability — what Sentry caught that the app hid

The RRR backend is built to **degrade gracefully**: when Yelp has no key, a
Browserbase page won't load, Gemini returns junk JSON, Redis is down, or the
GeoIP provider flakes, the user still gets a clean response (an empty list, a
fallback string, a re-classified item). That's good UX — and it's also how real
failures stay invisible for weeks.

Sentry closes that gap. Every place the app swallows an error behind a fallback
now also calls `capture_silent_failure(...)`, so the failure is **reported while
the app keeps degrading exactly as before**. UX stays smooth; we get full
visibility into the failures users never see.

> **Behavior is unchanged.** Each instrumented handler still returns its original
> fallback. Sentry capture is additive — no status codes, payloads, or control
> flow were altered.

---

## How it's wired

**1. Init before the app (`app/main.py`)** — runs before `app = FastAPI()` so the
capture calls in the service layer always have a live client:

```python
if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,  # 1.0
        send_default_pii=False,
    )
```

No-ops cleanly when `SENTRY_DSN` is blank, so the app still boots without a DSN.

**2. One helper (`app/observability.py :: capture_silent_failure`)** — tags every
event so the hidden failures are filterable from genuine 5xx errors:

```python
def capture_silent_failure(exc, *, where, **context):
    with sentry_sdk.new_scope() as scope:
        scope.set_tag("silent_failure", "true")
        scope.set_tag("failure.where", where)
        scope.set_context("silent_failure", {"where": where, **context})
        sentry_sdk.capture_exception(exc)
```

In Sentry, filter on `silent_failure:true` to see only failures the user never saw.

**3. Env (`app/.env` / `.env.example`)**

```
SENTRY_DSN=                       # paste project DSN to enable; blank = disabled
SENTRY_ENVIRONMENT=local
SENTRY_TRACES_SAMPLE_RATE=1.0
```

---

## Instrumented silent-failure sites

Every spot where an error is caught and converted into a graceful fallback:

| `failure.where` | File | Fallback the user gets | What was masked |
|---|---|---|---|
| `yelp.find_haulers` (missing key / bad status / request error) | `services/rrr_haulers.py` | `haulers: []` | Yelp Fusion unconfigured or failing |
| `gemini.parse_services_json` | `services/rrr_service_discovery.py` | `services: []` | Gemini returned unparseable JSON |
| `gemini.parse_disposal_cards_json` | `services/rrr_disposal.py` | `cards: []` | Gemini returned unparseable JSON |
| `gemini.parse_identify_json` | `services/rrr_identify.py` | generic `"unknown item"` | Structured-output JSON parse failed |
| `gemini.parse_schedule_json` | `services/rrr_schedule.py` | canned confirmation copy | Gemini returned unparseable JSON |
| `browserbase.fetch_page` | `rrr_disposal.py`, `rrr_service_discovery.py`, `browserbase_research.py` | page skipped, fewer sources | Live web grounding lost a source |
| `browserbase.research_recycling_rule` | `instruction_agent.py`, `rules_cache.py` | LLM-only rule / cached ref | Whole web-research step failed |
| `geoip.lookup_ip` (unresolved / request error) | `services/geoip.py` | "no location" → dynamic fallback | GeoIP provider rate-limited or down |
| `redis.init` | `services/cache.py` | caching disabled silently | Redis unreachable at startup |
| `redis.get_string/get_json/set_string/set_json/delete` | `services/cache.py` | cache-aside acts as a permanent miss | Redis read/write errors |
| `redis.vector_search` / `redis.vector_index.create` / `redis.vector_index.write` | `services/item_index.py` | re-classify via Gemini (extra cost) | Vector RAG cache silently bypassed |
| `supabase.verify_token` | `deps/auth.py` | treated as anonymous | Supabase JWT check errored |

---

## Proof: events that ACTUALLY fired during this run

Driven by `evals/sentry_probe.py`, which initializes the **real Sentry SDK** with a
`before_send` recorder and then deliberately triggers each path. `before_send`
returns the fully-built, serialized event (exactly what would be transmitted to a
DSN) — proving each capture fires and giving the exact issue title, tags, and
context. **11 distinct events fired:**

| # | `failure.where` | Sentry issue title (what you'd see) |
|---|---|---|
| 1 | `yelp.find_haulers` | `RuntimeError: YELP_API_KEY not set — hauler list silently returned empty` |
| 2 | `gemini.parse_services_json` | `JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 18` |
| 3 | `gemini.parse_disposal_cards_json` | `JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 15` |
| 4 | `gemini.parse_identify_json` | `JSONDecodeError: Expecting ',' delimiter: line 1 column 22` |
| 5 | `gemini.parse_schedule_json` | `JSONDecodeError: Expecting property name enclosed in double quotes: line 1 column 3` |
| 6 | `redis.get_json` | `ConnectionError: Error 22 connecting to localhost:6399. The remote computer refused the network connection.` |
| 7 | `redis.set_json` | `ConnectionError: Error 22 connecting to localhost:6399. ...` |
| 8 | `redis.init` | `ConnectionError: Error 22 connecting to localhost:6399. ...` |
| 9 | `browserbase.fetch_page` | `ConnectionError: Browserbase fetch failed for https://unreachable.invalid/x` |
| 10 | `geoip.lookup_ip` (unresolved) | `RuntimeError: ip-api returned status='fail' for IP` |
| 11 | `geoip.lookup_ip` (request error) | `ConnectError: All connection attempts failed` |

Every event carries `silent_failure=true`, `failure.where=<site>`, and a
`silent_failure` context block (e.g. `{"reason":"missing_api_key","location":"Berkeley, CA"}`).
Full payloads: `backend/evals/run_artifacts/sentry_events.json`.

### The two flagship cases (graceful UX + full visibility)

- **Yelp key absent.** Live call `POST /api/haulers` `{"location":"Berkeley, CA"}`
  returned `{"haulers":[]}` in **0.24 s** — the user just sees "no haulers nearby."
  Behind it, event #1 fired: `RuntimeError: YELP_API_KEY not set …` tagged
  `reason=missing_api_key`. The product is degraded; the operator knows exactly why.
- **Gemini structured-output drift.** When Gemini emits non-JSON, the four parser
  sites return an empty/fallback result so the UI never shows a raw blob (events
  #2–#5). Each event ships a `raw_snippet` of the offending model output, so you
  can debug the prompt without reproducing it.

---

## Pipeline exercise (context for the run)

Real requests against the running backend, Berkeley (`location_id=berkeley`):

| Request | Result | Latency |
|---|---|---|
| `POST /api/recycle/` `greasy pizza box` | `compost` / accepted → green compost cart | 9.6 s (cold) |
| `POST /api/recycle/` `greasy pizza box` (repeat) | same category | 9.9 s |
| `POST /api/recycle/` `dead lithium AA batteries` | `special` / fire-hazard handling | 3.9 s |
| `POST /api/recycle/` `oily cardboard pizza container` | `compost` (fuzzy phrasing) | 9.7 s |
| `POST /api/haulers` `Berkeley, CA` | `{"haulers":[]}` (graceful, Yelp unset) | 0.24 s |

Raw JSON: `backend/evals/run_artifacts/`.

---

## Verification method & honest caveats

- **No live Sentry project DSN was provided for this run.** Events were verified
  through the SDK's real `before_send` pipeline (built + serialized, transmission
  suppressed). To send to a live project, paste a DSN into `SENTRY_DSN` in
  `backend/app/.env` and restart — `app/main.py` was confirmed to activate the
  client (`is_active() == True`, `traces_sample_rate=1.0`) when a DSN is set. No
  other change is needed; the same `capture_silent_failure` calls then transmit.
- **One silent path Sentry does *not* catch (by design).** The Redis vector-RAG
  cache miss (`item_index.search_item` returning `None`) is the *normal* miss path —
  it raises no exception, so there's nothing to capture. During this run the vector
  search returned 0 docs for every query despite 10 docs indexed (a Redis Search /
  index-config issue), so `item_vector_hit` was always `false` and every item was
  re-classified by Gemini. This is a real, cost-incurring degradation that exception
  monitoring is blind to — it surfaces only as an INFO log ("Item vector cache
  miss"). Catching it needs a metric/log-based alert, not `capture_exception`. Noted
  here rather than papered over.

---

## Reproduce

```bash
cd backend
# 1. Backend already needs Redis Stack up (docker container `recycle-redis`) + uvicorn:
#    .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 2. Exercise the live pipeline + graceful Yelp degradation:
curl -s -X POST localhost:8000/api/recycle/ -H 'Content-Type: application/json' \
  -d '{"item":"greasy pizza box","location_id":"berkeley"}'
curl -s -X POST localhost:8000/api/haulers -H 'Content-Type: application/json' \
  -d '{"location":"Berkeley, CA","itemName":"old couch"}'   # -> {"haulers":[]}

# 3. Fire + record every silent-failure Sentry event:
PYTHONPATH=. .venv/Scripts/python evals/sentry_probe.py
#    -> backend/evals/run_artifacts/sentry_events.json  (11 events)

# 4. To send to a real project: set SENTRY_DSN in app/.env, restart uvicorn,
#    re-run step 2, then filter Sentry on `silent_failure:true`.
```
