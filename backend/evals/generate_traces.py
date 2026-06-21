"""Step 2 — generate traces.

Hits the running backend's main recycling endpoint with a varied matrix of items
across the four supported locations (Ann Arbor, Berkeley, Stanford, UCLA), exercising
both the text path and (optionally) the photo path. Each call produces one Phoenix
trace under project ``rrr-backend``.

Usage:
    # backend running on :8000, text path only
    python -m evals.generate_traces

    # include the vision path with your own photos
    python -m evals.generate_traces --image path/to/bottle.jpg --image path/to/battery.jpg

After it finishes, confirm the traces appear in the Phoenix UI before running evals.
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
import time
from pathlib import Path
from urllib import request as urlrequest

# (item text, location_id) — varied items, all four supported locations, both
# curbside-simple and special/hazardous cases so evals have signal to grade.
TEXT_CASES = [
    ("plastic water bottle", "ann_arbor"),
    ("AA battery", "ann_arbor"),
    ("greasy pizza box", "berkeley"),
    ("styrofoam takeout container", "berkeley"),
    ("old laptop", "stanford"),
    ("glass wine bottle", "stanford"),
    ("plastic grocery bag", "ucla"),
    ("banana peel", "ucla"),
]


def _post_json(base_url: str, payload: dict) -> dict:
    data = json.dumps(payload).encode()
    req = urlrequest.Request(
        f"{base_url}/api/recycle/",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlrequest.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--image", action="append", default=[], help="photo path(s) for the vision path")
    ap.add_argument("--image-location", default="berkeley", help="location_id to use for image runs")
    args = ap.parse_args()

    n = 0
    for item, loc in TEXT_CASES:
        try:
            out = _post_json(args.base_url, {"item": item, "location_id": loc})
            n += 1
            print(f"[{n:2}] text  {loc:9} {item:28} -> {out.get('category'):10} | {out.get('instructions','')[:70]}")
        except Exception as e:  # noqa: BLE001
            print(f"[ERR] text  {loc:9} {item:28} -> {e}")
        time.sleep(0.3)

    for img_path in args.image:
        p = Path(img_path)
        if not p.exists():
            print(f"[ERR] image not found: {img_path}")
            continue
        b64 = base64.b64encode(p.read_bytes()).decode()
        try:
            out = _post_json(
                args.base_url,
                {"image_base64": b64, "location_id": args.image_location},
            )
            n += 1
            print(f"[{n:2}] image {args.image_location:9} {p.name:28} -> {out.get('item')} / {out.get('category')}")
        except Exception as e:  # noqa: BLE001
            print(f"[ERR] image {p.name}: {e}")
        time.sleep(0.3)

    print(f"\nGenerated {n} traces. Open Phoenix → project 'rrr-backend' and confirm "
          f"each shows a 'recycle.pipeline' root span with child stage spans.")
    return 0 if n else 1


if __name__ == "__main__":
    sys.exit(main())
