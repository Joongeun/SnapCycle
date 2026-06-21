from __future__ import annotations

from typing import Optional

from google import genai
from google.genai import types

from app.config import settings

_client: Optional[genai.Client] = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not settings.google_api_key:
            raise ValueError("GOOGLE_API_KEY is not set")
        _client = genai.Client(api_key=settings.google_api_key)
    return _client


async def generate(system: str, user: str, *, max_output_tokens: int = 1024) -> str:
    client = _get_client()
    response = await client.aio.models.generate_content(
        model=settings.gemini_model,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_output_tokens,
        ),
    )
    return response.text


def generate_sync(system: str, user: str, *, max_output_tokens: int = 1024) -> str:
    client = _get_client()
    response = client.models.generate_content(
        model=settings.gemini_model,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            max_output_tokens=max_output_tokens,
        ),
    )
    return response.text
