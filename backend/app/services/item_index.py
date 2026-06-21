from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import List, Optional

from redis.exceptions import ResponseError

from app.config import settings
from app.observability import capture_silent_failure
from app.services.cache import get_redis_binary, item_doc_key, normalize_query, pack_embedding
from app.services.embeddings import embed_text

logger = logging.getLogger(__name__)

ITEM_INDEX = "item_idx"


@dataclass
class ItemMatch:
    query: str
    item_id: str
    distance: float


async def init_item_index() -> None:
    """Create Redis vector index for item query → item_id mapping."""
    redis = get_redis_binary()
    if redis is None:
        return

    try:
        from redis.commands.search.field import TagField, TextField, VectorField
        from redis.commands.search.index_definition import IndexDefinition, IndexType

        schema = (
            TextField("query"),
            TagField("item_id"),
            VectorField(
                "embedding",
                "HNSW",
                {
                    "TYPE": "FLOAT32",
                    "DIM": settings.embedding_dim,
                    "DISTANCE_METRIC": "COSINE",
                },
            ),
        )
        await redis.ft(ITEM_INDEX).create_index(
            schema,
            definition=IndexDefinition(prefix=["item:"], index_type=IndexType.HASH),
        )
        logger.info("Redis item vector index created")
    except ResponseError as exc:
        if "Index already exists" in str(exc):
            logger.info("Redis item vector index already exists")
        else:
            logger.warning("Could not create vector index (Redis Stack required): %s", exc)
            capture_silent_failure(exc, where="redis.vector_index.create", reason="response_error")
    except Exception as exc:
        logger.warning("Vector index init skipped: %s", exc)
        capture_silent_failure(exc, where="redis.vector_index.create", reason="init_skipped")


async def search_item(query: str) -> Optional[ItemMatch]:
    """
    Vector search for closest cached item mapping.
    Returns None if no match or distance exceeds threshold (cache miss).
    """
    redis = get_redis_binary()
    if redis is None:
        return None

    try:
        from redis.commands.search.query import Query

        vector = await embed_text(query)
        q = (
            Query("*=>[KNN 1 @embedding $vec AS distance]")
            .sort_by("distance")
            .return_fields("query", "item_id", "distance")
            .dialect(2)
        )
        results = await redis.ft(ITEM_INDEX).search(
            q,
            query_params={"vec": pack_embedding(vector)},
        )

        if not results.docs:
            return None

        doc = results.docs[0]
        distance = float(doc.distance)
        if distance > settings.vector_distance_threshold:
            logger.info(
                "Item vector cache miss: query=%r distance=%.3f threshold=%.3f",
                query,
                distance,
                settings.vector_distance_threshold,
            )
            return None

        item_id = doc.item_id
        if isinstance(item_id, bytes):
            item_id = item_id.decode()

        matched_query = doc.query
        if isinstance(matched_query, bytes):
            matched_query = matched_query.decode()

        return ItemMatch(query=matched_query, item_id=item_id, distance=distance)
    except Exception as exc:
        logger.warning("Item vector search failed: %s", exc)
        capture_silent_failure(exc, where="redis.vector_search", query=query)
        return None


async def index_item_query(query: str, item_id: str) -> None:
    """Save query embedding → item_id mapping permanently in Redis."""
    redis = get_redis_binary()
    if redis is None:
        return

    try:
        normalized = normalize_query(query)
        key = item_doc_key(normalized)
        vector = await embed_text(query)
        await redis.hset(
            key,
            mapping={
                "query": normalized,
                "item_id": item_id,
                "embedding": pack_embedding(vector),
            },
        )
        logger.info("Indexed item query: %r → %s", query, item_id)
    except Exception as exc:
        logger.warning("Failed to index item query: %s", exc)
        capture_silent_failure(exc, where="redis.vector_index.write", query=query, item_id=item_id)
