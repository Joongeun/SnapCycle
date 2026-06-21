from __future__ import annotations

from typing import List, Optional

from app.config import settings
from app.services.search import keyword_search


def retrieve_regulations(
    documents: List[dict],
    item: str,
    extra_keywords: Optional[List[str]] = None,
    top_k: Optional[int] = None,
) -> List[dict]:
    """
    MVP RAG retrieval: keyword search over local regulation documents.
    Swap this module for vector embeddings when ready to scale.
    """
    k = top_k or settings.rag_top_k
    results = keyword_search(documents, item, extra_keywords, top_k=k)
    return [doc for doc, _score in results]


def format_sources(docs: List[dict]) -> List[str]:
    return [doc.get("title", doc.get("id", "unknown")) for doc in docs]
