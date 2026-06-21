from __future__ import annotations

import asyncio
import base64
import json
import re
from typing import Tuple

from google.genai import types

from app.config import settings
from app.schemas.rrr import IdentifyResponse, ItemCategory
from app.services.gemini import _get_client

IDENTIFY_SYSTEM = """You identify large household items in photos for the RRR donate/sell/discard app.
Return a short item name, category, and brief description of visible features.
Condition cannot be assessed reliably from photos — always use "good" unless clearly broken."""

VALID_CATEGORIES = {
    "furniture", "appliance", "electronics", "clothing", "decor", "sports", "other"
}


async def identify_item_from_image(image_base64: str) -> IdentifyResponse:
    payload = image_base64.strip()
    media_type = "image/jpeg"

    if payload.startswith("data:"):
        header, _, payload = payload.partition(",")
        if ";base64" in header:
            media_type = header[5:].split(";")[0] or media_type

    image_bytes = base64.b64decode(payload)
    return await identify_item_from_bytes(image_bytes, media_type=media_type)


async def identify_item_from_bytes(
    image_bytes: bytes,
    *,
    media_type: str = "image/jpeg",
) -> IdentifyResponse:
    client = _get_client()

    def _call() -> str:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=media_type),
                (
                    "Identify this item for donate/sell/discard guidance. "
                    'Return ONLY JSON: {"itemName":"...","category":"furniture|appliance|electronics|clothing|decor|sports|other","condition":"good","description":"..."}'
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=IDENTIFY_SYSTEM,
                max_output_tokens=256,
            ),
        )
        return response.text or ""

    raw = await asyncio.to_thread(_call)
    return _parse_identify_response(raw)


def _parse_identify_response(raw: str) -> IdentifyResponse:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            data = json.loads(text[start : end + 1])
            category = str(data.get("category", "other")).lower()
            if category not in VALID_CATEGORIES:
                category = _categorize_from_text(
                    f"{data.get('itemName', '')} {data.get('description', '')}"
                )
            return IdentifyResponse(
                itemName=_trim_item_name(str(data.get("itemName") or "unknown item")),
                category=category,  # type: ignore[arg-type]
                condition="good",
                description=str(data.get("description") or "").strip(),
            )
        except json.JSONDecodeError:
            pass

    label = re.sub(r'^(item:|object:|label:)\s*', "", text.strip(), flags=re.IGNORECASE)
    label = label.strip('"').strip("'") or "unknown item"
    if len(label) > 80:
        label = _first_short_phrase(label)
    return IdentifyResponse(
        itemName=label,
        category=_categorize_from_text(label),
        condition="good",
        description=label,
    )


def _trim_item_name(name: str) -> str:
    cleaned = name.strip()
    if len(cleaned) <= 80:
        return cleaned or "unknown item"
    return _first_short_phrase(cleaned)


def _first_short_phrase(text: str) -> str:
    match = re.search(
        r"\b((?:sofa|couch|chair|table|desk|bed|dresser|cabinet|lamp|rug|"
        r"refrigerator|microwave|television|tv|laptop|computer|phone|bicycle|"
        r"skyscraper|building|box|bottle|item)[\w\s-]{0,30})",
        text,
        re.IGNORECASE,
    )
    if match:
        return match.group(1).strip().lower()
    sentence = re.split(r"[.!?\n]", text)[0].strip()
    return (sentence[:60] + "...") if len(sentence) > 60 else sentence or "unknown item"


def _categorize_from_text(text: str) -> ItemCategory:
    joined = text.lower()
    rules: Tuple[Tuple[ItemCategory, Tuple[str, ...]], ...] = (
        ("furniture", ("chair", "table", "couch", "sofa", "desk", "furniture", "cabinet", "dresser", "bed", "shelf")),
        ("appliance", ("refrigerator", "fridge", "microwave", "washer", "dryer", "oven", "dishwasher")),
        ("electronics", ("television", "tv", "monitor", "laptop", "computer", "phone", "speaker", "camera")),
        ("clothing", ("shirt", "jacket", "dress", "clothing", "shoe", "coat", "pants")),
        ("decor", ("lamp", "rug", "mirror", "vase", "painting", "decor", "curtain", "pillow")),
        ("sports", ("bicycle", "bike", "treadmill", "sports", "ball", "weights", "gym")),
    )
    for category, keywords in rules:
        if any(k in joined for k in keywords):
            return category
    return "other"
