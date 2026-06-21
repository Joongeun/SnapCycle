from __future__ import annotations

import asyncio
import base64
import re
from typing import Optional, Tuple

from google.genai import types

from app.config import settings
from app.services.gemini import _get_client

VISION_SYSTEM = """You identify objects in photos for waste sorting and recycling.
Describe what you see in one short phrase suitable for a recycling search query.
Examples: "plastic water bottle", "greasy pizza box", "AA battery", "cardboard shipping box".
Return ONLY the item label — no explanation."""


async def identify_item_from_image(
    image_base64: str,
    *,
    media_type: str = "image/jpeg",
) -> str:
    """Use Gemini vision to label the item in an image."""
    image_bytes = base64.b64decode(image_base64)
    return await identify_item_from_bytes(image_bytes, media_type=media_type)


async def identify_item_from_bytes(
    image_bytes: bytes,
    *,
    media_type: str = "image/jpeg",
) -> str:
    client = _get_client()

    def _call() -> str:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[
                types.Part.from_bytes(data=image_bytes, mime_type=media_type),
                "What is this item? Give a short recycling search label.",
            ],
            config=types.GenerateContentConfig(
                system_instruction=VISION_SYSTEM,
                max_output_tokens=64,
            ),
        )
        return _clean_label(response.text or "")

    return await asyncio.to_thread(_call)


def _clean_label(raw: str) -> str:
    label = raw.strip().strip('"').strip("'")
    label = re.sub(r"^(item:|object:|label:)\s*", "", label, flags=re.IGNORECASE)
    return label or "unknown item"


def decode_base64_image(image_base64: str) -> Tuple[bytes, str]:
    """Support data-URI prefixes: data:image/png;base64,..."""
    media_type = "image/jpeg"
    payload = image_base64.strip()

    if payload.startswith("data:"):
        header, _, payload = payload.partition(",")
        if ";base64" in header:
            media_type = header[5:].split(";")[0] or media_type

    return base64.b64decode(payload), media_type
