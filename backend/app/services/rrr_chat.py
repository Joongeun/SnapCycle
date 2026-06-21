"""
Chat agent — answers clarifying questions about the listed disposal services.

Grounded in the persistent location RAG plus the cards currently on screen, so
the user can ask things like "Am I eligible for the free pickup?" or "Do they
take mattresses?" and get a grounded answer with source links.
"""

from __future__ import annotations

import json
import logging
import re
from typing import List

from app.schemas.rrr import ChatRequest, ChatResponse
from app.services.gemini import generate_json
from app.services.rrr_location_research import format_rag_context, retrieve_location_rag

logger = logging.getLogger(__name__)

CHAT_SYSTEM = """You are the RRR disposal assistant chat agent.
Answer the user's question about getting rid of their item using ONLY the local
knowledge base and the disposal options provided as context. Be concise and
practical. If the answer is not in the context, say you are not sure and suggest
the most relevant option. Never invent phone numbers, URLs, or eligibility rules."""


def _cards_context(req: ChatRequest) -> str:
    if not req.cards:
        return "No specific options on screen."
    lines: List[str] = []
    for c in req.cards:
        bits = [f"{c.title} ({c.method})"]
        if c.phone:
            bits.append(f"phone {c.phone}")
        if c.formUrl:
            bits.append(f"form {c.formUrl}")
        if c.subOptions:
            bits.append("; ".join(s.name for s in c.subOptions))
        lines.append("- " + ", ".join(bits))
    return "\n".join(lines)


def _extract_json(raw: str) -> dict:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


async def answer_question(req: ChatRequest) -> ChatResponse:
    rag = await retrieve_location_rag(req.zip, f"{req.question} {req.itemName or ''}")
    rag_context = format_rag_context(rag)

    prompt = f"""User question: {req.question}

Item: {req.itemName or 'unspecified'}
Location: {req.location or 'unknown'}

Local knowledge base:
{rag_context}

Disposal options currently shown to the user:
{_cards_context(req)}

Return ONLY valid JSON (no markdown fences):
{{
  "answer": "concise, grounded answer",
  "sources": ["relevant URLs you used, [] if none"]
}}"""

    raw = await generate_json(CHAT_SYSTEM, prompt, max_output_tokens=768)
    data = _extract_json(raw)

    answer = (data.get("answer") or "").strip() or "Sorry, I couldn't find an answer for that."
    sources = [str(s).strip() for s in (data.get("sources") or []) if str(s).strip()]
    return ChatResponse(answer=answer, sources=sources)
