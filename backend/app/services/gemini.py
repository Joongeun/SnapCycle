from __future__ import annotations

from typing import Optional

from google import genai
from google.genai import types

from app.config import settings
from app.observability import llm_span, set_llm_output

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
    with llm_span("gemini.generate", model=settings.gemini_model, system=system, user=user) as span:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_output_tokens,
            ),
        )
        set_llm_output(span, response.text, getattr(response, "usage_metadata", None))
        return response.text


async def generate_json(system: str, user: str, *, max_output_tokens: int = 2048) -> str:
    """Generate with JSON output forced and thinking disabled, so the response is
    clean parseable JSON (gemini-2.5-flash is a thinking model and otherwise
    truncates the JSON when reasoning eats the token budget)."""
    client = _get_client()
    with llm_span("gemini.generate_json", model=settings.gemini_model, system=system, user=user) as span:
        response = await client.aio.models.generate_content(
            model=settings.gemini_model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                max_output_tokens=max_output_tokens,
                response_mime_type="application/json",
                thinking_config=types.ThinkingConfig(thinking_budget=0),
            ),
        )
        set_llm_output(span, response.text, getattr(response, "usage_metadata", None))
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
