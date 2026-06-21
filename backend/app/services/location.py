from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List, Optional

DATA_DIR = Path(__file__).parent.parent / "data"

_locations: Optional[Dict[str, dict]] = None


def _load_locations() -> Dict[str, dict]:
    global _locations
    if _locations is not None:
        return _locations

    _locations = {}
    for path in DATA_DIR.glob("*.json"):
        with open(path) as f:
            data = json.load(f)
            _locations[data["id"]] = data
    return _locations


def list_locations() -> List[str]:
    return list(_load_locations().keys())


def get_location_data(location_id: str) -> Optional[dict]:
    return _load_locations().get(location_id)
