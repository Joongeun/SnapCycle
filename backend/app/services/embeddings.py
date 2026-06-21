from __future__ import annotations

import asyncio
from typing import List

from app.config import settings
from app.services.gemini import _get_client


async def embed_text(text: str) -> List[float]:
    """Generate an embedding vector for semantic item search."""
    client = _get_client()

    def _call() -> List[float]:
        response = client.models.embed_content(
            model=settings.embedding_model,
            contents=text,
        )
        return list(response.embeddings[0].values)

    return await asyncio.to_thread(_call)
