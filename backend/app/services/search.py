from __future__ import annotations

import re
from typing import List, Optional, Tuple


def keyword_search(
    documents: List[dict],
    query: str,
    extra_keywords: Optional[List[str]] = None,
    top_k: int = 5,
) -> List[Tuple[dict, float]]:
    """
    MVP keyword search over local regulation documents.
    Returns (document, score) pairs sorted by relevance.
    """
    terms = _tokenize(query)
    if extra_keywords:
        terms.extend(_tokenize(" ".join(extra_keywords)))
    terms = list(dict.fromkeys(terms))  # dedupe, preserve order

    if not terms:
        return []

    scored: List[Tuple[dict, float]] = []
    for doc in documents:
        score = _score_document(doc, terms)
        if score > 0:
            scored.append((doc, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_k]


def _tokenize(text: str) -> List[str]:
    return [t for t in re.split(r"[\s,./\-_#]+", text.lower()) if len(t) > 1]


def _score_document(doc: dict, terms: List[str]) -> float:
    title = doc.get("title", "").lower()
    keywords = " ".join(doc.get("keywords", [])).lower()
    instructions = doc.get("instructions", "").lower()
    notes = (doc.get("notes") or "").lower()
    category = doc.get("category", "").lower()

    score = 0.0
    for term in terms:
        if term in title:
            score += 3.0
        if term in keywords:
            score += 2.0
        if term in category:
            score += 1.5
        if term in instructions:
            score += 1.0
        if term in notes:
            score += 0.5

    return score
