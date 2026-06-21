"""Step 4 — cluster failure explanations into the top patterns.

Reads the per-criterion CSVs that ``run_evals.py`` wrote (``evals/results/<tag>_<criterion>.csv``),
keeps the failing rows (score == 0), and buckets their judge explanations into recurring failure
patterns with light keyword clustering — the input for deciding which prompt/orchestrator fixes to make.

Usage:
    python -m evals.cluster_failures --tag baseline

Phoenix CLI / client alternative (pull annotated spans straight from Phoenix instead of CSVs):
    phoenix --help          # the CLI ships with arize-phoenix
    # or in Python:
    #   import phoenix as px
    #   df = px.Client().get_spans_dataframe(project_name="rrr-backend")
    #   ann = px.Client().get_evaluations()   # annotations logged by run_evals
"""
from __future__ import annotations

import argparse
import sys
from collections import Counter, defaultdict
from pathlib import Path

RESULTS = Path(__file__).parent / "results"

# Coarse patterns we bucket explanations into, per criterion. Keyword-based so it runs offline.
PATTERN_KEYWORDS = {
    "locality": {
        "generic / nationwide advice": ["generic", "nationwide", "any city", "not specific", "general"],
        "no local program/cart named": ["cart", "bin", "facility", "drop-off", "program", "named"],
        "wrong jurisdiction referenced": ["different city", "wrong location", "another"],
    },
    "completeness": {
        "no destination / where it goes": ["where", "destination", "which bin", "no location"],
        "missing prep steps": ["prepare", "rinse", "empty", "flatten", "prep"],
        "too vague / one-liner": ["vague", "one line", "brief", "lacks detail", "not actionable"],
    },
    "correctness": {
        "wrong bin/category vs local rule": ["wrong bin", "category", "contradict", "should be", "incorrect bin"],
        "wrong accepted/rejected status": ["accepted", "rejected", "not accepted", "curbside"],
        "ignored the local rule": ["ignored", "rule states", "authoritative", "contradicts"],
    },
}


def _bucket(criterion: str, explanation: str) -> str:
    text = (explanation or "").lower()
    for label, kws in PATTERN_KEYWORDS.get(criterion, {}).items():
        if any(k in text for k in kws):
            return label
    return "other / uncategorized"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tag", default="baseline")
    args = ap.parse_args()

    import pandas as pd

    criteria = ["completeness", "locality", "correctness"]
    any_found = False
    print(f"=== Failure patterns for tag '{args.tag}' ===\n")

    for crit in criteria:
        path = RESULTS / f"{args.tag}_{crit}.csv"
        if not path.exists():
            print(f"[skip] {path.name} not found — run run_evals.py --tag {args.tag} first.")
            continue
        any_found = True
        df = pd.read_csv(path)
        fails = df[df["score"] == 0]
        print(f"## {crit}: {len(fails)}/{len(df)} failing")
        if fails.empty:
            print("   (none)\n")
            continue

        buckets = Counter()
        examples = defaultdict(list)
        for _, row in fails.iterrows():
            b = _bucket(crit, str(row.get("explanation", "")))
            buckets[b] += 1
            if len(examples[b]) < 2:
                examples[b].append(
                    f"{row.get('item','?')} @ {row.get('location_name','?')}: "
                    f"{str(row.get('explanation',''))[:160]}"
                )
        for label, count in buckets.most_common():
            print(f"   • {label} — {count}")
            for ex in examples[label]:
                print(f"       e.g. {ex}")
        print()

    if not any_found:
        print("No result CSVs found. Run: python -m evals.run_evals --tag", args.tag)
        return 1
    print("Use these clusters to target fixes in prompts.py / disposal_prompts.py / "
          "research_prompts.py, then re-run evals with the v2 tag and compare.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
