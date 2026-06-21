# RRR Backend — Arize Phoenix Observability + Evals

Hackathon track submission. This documents how the RRR recycling backend is traced with
**Arize Phoenix (open source)**, how its final disposal instructions are scored with
**LLM-as-a-judge evals**, and how the eval explanations drove concrete prompt fixes.

> **Status of numbers:** the pipeline, spans, evaluators, and the before/after harness are
> all implemented and committed. Cells marked `‹fill›` are filled by running the
> [How to reproduce](#how-to-reproduce) steps — they come from a live run against the
> Phoenix Cloud space, not from this document.

---

## 1. Setup

| Item | Value |
|------|-------|
| Phoenix instance | Phoenix Cloud (hosted), per-space collector |
| `PHOENIX_COLLECTOR_ENDPOINT` | `https://app.phoenix.arize.com/s/gucciyd248` |
| `PHOENIX_API_KEY` | `••••••••` (redacted — stored only in `backend/app/.env`, which is git-ignored) |
| `PHOENIX_PROJECT` | `rrr-backend` |
| `PHOENIX_ENABLED` | `true` |
| `PROMPT_VARIANT` | `baseline` \| `v2` (A/B switch for the eval loop) |
| Judge model | `gemini-2.5-flash` (matches the app stack) |

Env lives in **`backend/app/.env`** (pydantic-settings reads `app/.env` then `backend/.env`).
`backend/app/.env.example` documents every key. `.env` is ignored via `backend/.gitignore`.

**Packages installed** (in `backend/requirements.txt`):

```
arize-phoenix-otel        # phoenix.otel.register() — tracer + OTLP exporter to Phoenix Cloud
arize-phoenix-client      # phoenix.client.Client — pull spans, log annotations (no server needed)
arize-phoenix-evals       # ClassificationEvaluator / create_classifier / LLM (Gemini judge)
pandas
```

Install: `pip install -r backend/requirements.txt`

**Environment constraints discovered on this machine (Python 3.14 + google-genai 2.9.0):**

- `openinference-instrumentation-google-genai` (only 3.14-compatible build, 1.1.0) targets
  `google.genai._interactions`, which doesn't exist in google-genai 2.9.0 — it **cannot attach**,
  and under `auto_instrument=True` its failure aborts `register()`. So Gemini calls are captured by
  **manual OpenInference LLM spans** (`app/observability.py::llm_span`, applied in `gemini.py` +
  `vision.py`) instead — same result: every Gemini call is an `LLM` span with model, prompt,
  completion, and token counts.
- `openinference-instrumentation-httpx` / `-redis` require Python `<3.14` → not installed. Those
  stages are still visible via the manual stage spans (`resolve_location`, `gather_references`).
- The full `arize-phoenix` server package needs to compile `sqlean` (MSVC) on 3.14, so we use the
  pure-Python `arize-phoenix-client` against Phoenix Cloud instead.
- On Python ≤3.13 you can uncomment the auto-instrumentation lines in `requirements.txt` for richer
  per-call child spans; nothing else changes.

---

## 2. Architecture traced

One `POST /api/recycle/` request = **one trace** rooted at the `recycle.pipeline` CHAIN span,
with a child span per orchestrator stage. Auto-instrumentation nests the real Gemini / HTTP /
Redis calls underneath the right stage; manual spans (`app/observability.py::chain_span`) make
each stage visible even where there's no library call to hook.

| Span (name) | Kind | Code | Agent/service it represents | Auto-captured children |
|-------------|------|------|------------------------------|------------------------|
| `recycle.pipeline` | CHAIN | `orchestrator.get_recycling_instructions` | whole request | all below |
| `identify_item` | TOOL | `vision.identify_item_from_bytes` | Gemini vision OR text passthrough | `gemini.vision.identify` (LLM span) |
| `resolve_location` | TOOL | `geoip.resolve_location` | IP → campus/jurisdiction | GeoIP HTTP, Redis (manual stage) |
| `resolve_item_id` | RETRIEVER | `item_index.search_item` → `item_classifier.classify_item` | vector search, else Gemini classify | `gemini.generate_json` (LLM span) |
| `gather_references` | RETRIEVER | `instruction_agent.gather_references` | Redis cache + local JSON + Browserbase | Browserbase HTTP, Redis (manual stage) |
| `synthesize_instructions` | CHAIN | `instruction_agent.synthesize_instructions` | the LLM synthesis agent | `gemini.generate` (LLM span) |

Every Gemini call is its own `LLM` child span (`gemini.generate`, `gemini.generate_json`,
`gemini.vision.identify`) carrying `llm.model_name`, the prompt, the completion, and
`llm.token_count.*` from Gemini's `usage_metadata`.

Registration happens once at import in `app/main.py` (`setup_tracing()`), before any
instrumented library is used: `phoenix.otel.register(project_name="rrr-backend",
auto_instrument=True)` sets the tracer provider + OTLP exporter to Phoenix Cloud.

Each span records `input.value` / `output.value` (OpenInference semantic conventions), so the
root span carries the final `{item, location, category, instructions, steps}` that the evals grade.

---

## 3. Eval design

Three **LLM-as-a-judge ClassificationEvaluators** (`evals/run_evals.py`), built with
`phoenix.evals.create_classifier` + `LLM(provider="google", model="gemini-2.5-flash")`,
explanations **ON** (default). The script pulls the root `recycle.pipeline` spans via
`Client().spans.get_spans_dataframe(..., root_spans_only=True)`, runs `evaluate_dataframe`, and
logs labels+explanations back with `Client().spans.log_span_annotations_dataframe` (annotator
kind `LLM`) so they appear next to the traces in the UI.

| Evaluator | Criterion | Rails (pass / fail) | What the judge sees |
|-----------|-----------|---------------------|---------------------|
| **completeness** | Full, actionable disposal steps for the item? | `complete` / `incomplete` | item, location, instructions, steps |
| **locality** | Services/rules specific to the detected location, not generic? | `local` / `non_local` | location, item, instructions, steps |
| **correctness** | Aligned with the bundled municipal rules for that location? | `correct` / `incorrect` | item, location, **bundled rules ground-truth**, category, instructions, steps |

The correctness judge is grounded against the actual rules in `app/data/<location>.json`
(loaded per-run by `location_id`), so it checks the answer against this jurisdiction's truth,
not the judge's own prior. Prompt templates are in `evals/run_evals.py`
(`COMPLETENESS_TEMPLATE`, `LOCALITY_TEMPLATE`, `CORRECTNESS_TEMPLATE`).

---

## 4. Baseline results (`PROMPT_VARIANT=baseline`)

Run over the 8 traces from `evals/generate_traces.py` (4 locations × varied items, text path).

| Evaluator | Pass | Fail | Pass rate |
|-----------|------|------|-----------|
| completeness | 3 | 5 | **38%** |
| locality | 7 | 1 | **88%** |
| correctness | 8 | 0 | **100%** |

Completeness is the clear weak spot: the model gives a destination but skips item-prep specifics
and drops reference caveats. Correctness is already solid because `gather_references` feeds the
bundled municipal rule straight into the synthesis prompt.

---

## 5. Failure patterns found

From the baseline judge explanations (`evals/results/baseline_*.csv`), the failures cluster into two patterns:

**1. Completeness — missing item-prep specifics (5/5 completeness fails).** The model names where the
item goes but the prep step is vague or missing the reference's caveat:

> *"…lacks specific [prep]. 'Prepare your old laptop for drop-off' is actionable but lacks specific [detail]."*
> — old laptop @ Stanford
>
> *"The provided steps do not include the caveat regarding broken glass or the alternative disposal
> instructions for it, which was present in the original instructions."* — glass wine bottle @ Stanford
>
> *"…missing crucial preparation instructions for plastic bags…"* — plastic grocery bag @ UCLA

**2. Locality — generic nationwide advice for items with no local rule (1/1 locality fail).** When the
references lack a city-specific rule, the model falls back to standard US advice:

> *"The advice regarding plastic grocery bags (not accepted in curbside bins, take to store drop-off)
> is standard across most single-stream recycling programs in the United States, not specific to
> Los Angeles…"* — plastic grocery bag @ UCLA

Correctness had zero failures, so no fix was needed there — the focus is completeness (prep + caveats)
and the locality fallback.

---

## 6. Fixes applied

The baseline synthesis prompt (`app/agent/prompts.py`) names the location once and never forces
the answer to be location-specific or fully actionable — the structural cause of the
`locality` and `completeness` misses. The fix is a **`v2` prompt variant**, gated by
`PROMPT_VARIANT` so the same deployment produces a clean before/after.

| File | Change | Why (criterion → motivating explanation) |
|------|--------|------------------------------------------|
| `app/agent/prompts.py` | `AGENT_SYSTEM_V2` + `_build_v2()`: forbid generic nationwide advice; require an explicit "no local rule → safest local fallback, don't invent" path | **locality** — *"…standard across most single-stream recycling programs in the United States, not specific to Los Angeles"* |
| `app/agent/prompts.py` | `v2` STEPS template mandates a **prep step + exact local destination step + caveat step** (≥2 concrete steps) | **completeness** — *"missing crucial preparation instructions"* / *"do not include the caveat regarding broken glass"* |
| `app/agent/prompts.py` | `AGENT_SYSTEM_V2`: references for THIS jurisdiction are authoritative and override general knowledge | **correctness** — held at 100%, guards against regressions |
| `app/agent/orchestrator.py` | root span now emits `location_id` so the correctness judge loads the exact municipal ruleset | enables grounded correctness scoring |

`research_prompts.py` / `disposal_prompts.py` are the Browserbase research stage; if the clusters
show the *research* (not synthesis) is the weak link, tighten those the same way (name the city,
forbid invented programs) and note it here.

To activate the fix: set `PROMPT_VARIANT=v2` in `backend/app/.env` and restart.

---

## 7. After results (`PROMPT_VARIANT=v2`)

Same inputs, same evaluators, `PROMPT_VARIANT=v2`, `--tag v2`.

| Evaluator | Baseline pass rate | v2 pass rate | Δ |
|-----------|--------------------|--------------|---|
| completeness | 38% (3/8) | **62% (10/16)** | **+24 pts** |
| locality | 88% (7/8) | **94% (15/16)** | **+6 pts** |
| correctness | 100% (8/8) | **100% (16/16)** | **±0** |

> **Headline:** the v2 prompt's mandatory prep + caveat step lifted **completeness 38% → 62% (+24 pts)**
> and the "no generic advice / name the local fallback" rule lifted **locality 88% → 94%**, while
> **correctness held at 100%**. Each delta maps to the §5 cluster it targeted.

**Honest caveats:**
- `run_evals.py` scores **every** `recycle.pipeline` root span in the project, so the v2 run re-scored
  the 8 baseline traces *plus* the 8 new v2 traces (16 total). The v2 rate is therefore a blended
  figure diluted by the older baseline spans; isolating only the v2 traces would show a larger lift.
  To get a clean cut, point each run at a separate Phoenix project (or clear the project between runs).
- Completeness, though much improved, is still the weakest criterion: the residual failures (e.g. "wipe
  your laptop before drop-off", the broken-glass caveat) need detail that **isn't in the bundled
  municipal rule itself** — the next lever is enriching the references in `gather_references`, not the
  synthesis prompt.

---

## How to reproduce

From `backend/` with the venv active and `app/.env` filled (Phoenix creds + `GOOGLE_API_KEY`):

```bash
pip install -r requirements.txt

# 1. Trace: start the backend (Redis running for the cache spans)
uvicorn app.main:app --host 0.0.0.0 --port 8000
# 2. In another shell — generate ~8-10 traces (add --image PATH for the vision path)
python -m evals.generate_traces
#    → confirm traces in Phoenix project 'rrr-backend' before continuing

# 3. Baseline evals  (app/.env: PROMPT_VARIANT=baseline)
python -m evals.run_evals --tag baseline
python -m evals.cluster_failures --tag baseline

# 4. Apply fix → set PROMPT_VARIANT=v2, restart uvicorn, regenerate + re-eval
python -m evals.generate_traces
python -m evals.run_evals --tag v2

# 5. Compare baseline vs v2 pass rates (printed by run_evals; CSVs in evals/results/)
```

Artifacts: per-run CSVs in `evals/results/<tag>_<criterion>.csv`; annotations visible in the
Phoenix UI as `<criterion> (<tag>)` next to each trace.
