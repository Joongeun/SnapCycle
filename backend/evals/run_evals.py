"""Step 3 — LLM-as-a-judge evals on the recycling traces.

Pulls the root ``recycle.pipeline`` spans from Phoenix, scores each run's final disposal
instructions on three criteria with a Gemini judge (to match the app's stack), and logs the
labels + explanations back to Phoenix as span annotations so they render next to each trace.

Criteria (LLM-as-a-judge ClassificationEvaluators, explanations ON):
  * completeness -> {complete, incomplete}    : full, actionable disposal steps?
  * locality     -> {local, non_local}        : services/rules specific to the detected location?
  * correctness  -> {correct, incorrect}      : aligned with the bundled municipal rules?

Targets arize-phoenix-evals >= 3.x and arize-phoenix-client >= 2.x.

Usage:
    python -m evals.run_evals --tag baseline      # PROMPT_VARIANT=baseline run first
    python -m evals.run_evals --tag v2            # then PROMPT_VARIANT=v2 and re-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from app.config import settings
from app.services.location import _load_locations

# Creds for the Phoenix client + the Gemini judge.
os.environ.setdefault("GOOGLE_API_KEY", settings.google_api_key)
os.environ.setdefault("GEMINI_API_KEY", settings.google_api_key)
if settings.phoenix_collector_endpoint:
    os.environ.setdefault("PHOENIX_COLLECTOR_ENDPOINT", settings.phoenix_collector_endpoint)
if settings.phoenix_api_key:
    os.environ.setdefault("PHOENIX_API_KEY", settings.phoenix_api_key)


# Mustache templates ({{column}}) — placeholders map to dataframe columns.
COMPLETENESS_TEMPLATE = """Grade this recycling answer for COMPLETENESS.

Item: {{item}}
Location: {{location_name}}
Instructions shown to the user: {{instructions}}
Steps:
{{steps}}

Does it give full, actionable disposal guidance — how to prepare the item, exactly where it goes,
and any caveat that changes the outcome? A vague one-liner with no concrete destination is incomplete.
Answer with one word: complete or incomplete."""

LOCALITY_TEMPLATE = """Grade this recycling answer for LOCALITY.

Detected location: {{location_name}}
Item: {{item}}
Instructions: {{instructions}}
Steps:
{{steps}}

Are the recommended services/rules specific to {{location_name}} (named local carts, bins, drop-off
sites, or facilities) rather than generic nationwide advice that would read the same for any city?
Answer with one word: local or non_local."""

CORRECTNESS_TEMPLATE = """Grade this recycling answer for CORRECTNESS against the authoritative municipal rules.

Location: {{location_name}}
Item: {{item}}
Authoritative local rules (ground truth for this jurisdiction):
{{local_rules}}

Answer given to the user:
Category: {{category}}
Instructions: {{instructions}}
Steps:
{{steps}}

Do the instructions and category align with the authoritative local rules for this item? Wrong bin,
wrong accepted/rejected status, or wrong category is incorrect. If the rules don't cover the item,
judge whether the advice is a safe, non-contradictory fallback.
Answer with one word: correct or incorrect."""

EVALUATORS = [
    {"name": "completeness", "template": COMPLETENESS_TEMPLATE, "choices": ["complete", "incomplete"], "pass": "complete"},
    {"name": "locality", "template": LOCALITY_TEMPLATE, "choices": ["local", "non_local"], "pass": "local"},
    {"name": "correctness", "template": CORRECTNESS_TEMPLATE, "choices": ["correct", "incorrect"], "pass": "correct"},
]


def _rules_for_location(location_id: str, location_name: str) -> str:
    locs = _load_locations()
    data = locs.get(location_id) or next(
        (d for d in locs.values() if d.get("name") == location_name), None
    )
    if not data:
        return "No bundled rules available for this location."
    return "\n".join(
        f"- {d.get('title')}: [{d.get('category')}] {d.get('instructions')} ({d.get('notes', '')})"
        for d in data.get("documents", [])
    )


def _output_value(row) -> dict:
    """Pull the JSON we stamped on the root span's output.value, however the client flattened it."""
    for col in ("attributes.output.value", "output.value"):
        if col in row and isinstance(row[col], str):
            try:
                return json.loads(row[col])
            except Exception:  # noqa: BLE001
                pass
    attrs = row.get("attributes")
    if isinstance(attrs, dict):
        raw = attrs.get("output", {}).get("value") if isinstance(attrs.get("output"), dict) else None
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:  # noqa: BLE001
                pass
    return {}


def _span_id_of(row, index_val):
    for col in ("context.span_id", "span_id", "id"):
        if col in row and row[col]:
            return row[col]
    return index_val


def _load_pipeline_spans(client, project: str):
    import pandas as pd

    df = client.spans.get_spans_dataframe(project_name=project, root_spans_only=True, limit=1000)
    if df is None or df.empty:
        return pd.DataFrame()
    if "name" in df.columns:
        df = df[df["name"] == "recycle.pipeline"]

    rows = []
    for idx, row in df.iterrows():
        data = _output_value(row)
        if not data.get("instructions"):
            continue
        steps = data.get("steps") or []
        rows.append(
            {
                "span_id": _span_id_of(row, idx),
                "item": data.get("item", ""),
                "location_id": data.get("location_id", ""),
                "location_name": data.get("location_name", ""),
                "category": data.get("category", ""),
                "instructions": data.get("instructions", ""),
                "steps": "\n".join(f"- {s}" for s in steps) if steps else "(none)",
            }
        )
    out = pd.DataFrame(rows)
    if not out.empty:
        out["local_rules"] = out.apply(
            lambda r: _rules_for_location(r["location_id"], r["location_name"]), axis=1
        )
        out = out.set_index("span_id")
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=settings.phoenix_project or "rrr-backend")
    ap.add_argument("--tag", default=settings.prompt_variant, help="label for this run, e.g. baseline | v2")
    ap.add_argument("--judge-model", default=settings.gemini_model)
    ap.add_argument("--no-log", action="store_true", help="don't log annotations back to Phoenix")
    args = ap.parse_args()

    from phoenix.client import Client
    from phoenix.evals import LLM, create_classifier, evaluate_dataframe

    client = Client(
        base_url=settings.phoenix_collector_endpoint or None,
        api_key=settings.phoenix_api_key or None,
    )

    spans = _load_pipeline_spans(client, args.project)
    if spans.empty:
        print("No 'recycle.pipeline' root spans with output found. Generate traces first.")
        return 1
    print(f"Scoring {len(spans)} runs from project '{args.project}' (tag={args.tag}).\n")

    judge = LLM(provider="google", model=args.judge_model)
    evaluators = [
        create_classifier(name=ev["name"], prompt_template=ev["template"], llm=judge, choices=ev["choices"])
        for ev in EVALUATORS
    ]
    results = evaluate_dataframe(dataframe=spans, evaluators=evaluators)

    out_dir = Path(__file__).parent / "results"
    out_dir.mkdir(exist_ok=True)
    summary = {}

    for ev in EVALUATORS:
        score_col = f"{ev['name']}_score"
        labels = results[score_col].apply(lambda s: (s or {}).get("label") if isinstance(s, dict) else None)
        explanations = results[score_col].apply(lambda s: (s or {}).get("explanation", "") if isinstance(s, dict) else "")
        passed_mask = labels == ev["pass"]
        scores = passed_mask.astype(int)
        summary[ev["name"]] = (int(scores.sum()), int(scores.count()))
        print(f"  {ev['name']:13} {int(scores.sum())}/{int(scores.count())} pass "
              f"({100*scores.sum()/max(scores.count(),1):.0f}%)")

        joined = spans.copy()
        joined["label"] = labels.values
        joined["explanation"] = explanations.values
        joined["score"] = scores.values
        joined.to_csv(out_dir / f"{args.tag}_{ev['name']}.csv")

        if not args.no_log:
            import pandas as pd

            ann = pd.DataFrame(
                {"label": labels.values, "score": scores.values, "explanation": explanations.values},
                index=spans.index,
            )
            ann.index.name = "span_id"
            try:
                client.spans.log_span_annotations_dataframe(
                    dataframe=ann,
                    annotation_name=f"{ev['name']} ({args.tag})",
                    annotator_kind="LLM",
                )
            except Exception as e:  # noqa: BLE001
                print(f"   [warn] could not log {ev['name']} annotations: {e}")

    print("\nSummary (tag=%s):" % args.tag)
    for name, (p, t) in summary.items():
        print(f"  {name:13} {p}/{t}  ({100*p/max(t,1):.0f}% pass)")
    if not args.no_log:
        print("\nLogged annotations back to Phoenix — open a trace to see labels + explanations.")
    print(f"Per-run CSVs in {out_dir}/{args.tag}_*.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
