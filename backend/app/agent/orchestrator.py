from __future__ import annotations

from typing import Optional

from app.agent.schemas import CacheLayers, RecycleRequest, RecycleResponse
from app.services.geoip import resolve_location
from app.services.instruction_agent import gather_references, synthesize_instructions
from app.services.item_classifier import classify_item
from app.services.item_index import index_item_query, search_item
from app.services.vision import decode_base64_image, identify_item_from_bytes


async def get_recycling_instructions(
    request: RecycleRequest,
    client_ip: str,
    *,
    image_bytes: Optional[bytes] = None,
    image_media_type: str = "image/jpeg",
) -> RecycleResponse:
    """
    Agent workflow:
      1. Resolve location
      2. Identify item (vision image OR text)
      3. Resolve item_id (vector search → classify)
      4. Gather references (Redis + local JSON + Browserbase) — never return directly
      5. AI agent synthesizes instructions using references
    """
    cache_layers = CacheLayers()
    from_image = False
    item_label = request.item

    if image_bytes:
        item_label = await identify_item_from_bytes(image_bytes, media_type=image_media_type)
        from_image = True
        cache_layers.vision_used = True
    elif request.image_base64:
        img_bytes, media_type = decode_base64_image(request.image_base64)
        item_label = await identify_item_from_bytes(
            img_bytes, media_type=request.image_media_type or media_type
        )
        from_image = True
        cache_layers.vision_used = True

    if not item_label:
        raise ValueError("Could not identify item from input")

    location_id, location, geo = await resolve_location(
        client_ip, request.location_id
    )
    cache_layers.ip_cache_hit = geo.get("ip_cache_hit", False)
    dynamic = geo.get("dynamic", location.get("dynamic", False))

    item_match = await search_item(item_label)
    if item_match:
        item_id = item_match.item_id
        cache_layers.item_vector_hit = True
    else:
        item_id = await classify_item(item_label)
        await index_item_query(item_label, item_id)
        cache_layers.item_vector_hit = False

    references, redis_hit, browserbase_used = await gather_references(
        location_id,
        item_id,
        original_query=item_label,
        city=geo.get("city") or location.get("city"),
        region=geo.get("region") or location.get("region") or location.get("jurisdiction"),
        location=location,
        dynamic=dynamic,
    )
    cache_layers.rule_cache_hit = redis_hit
    cache_layers.browserbase_research = browserbase_used

    rule = await synthesize_instructions(
        item=item_label,
        item_id=item_id,
        location_name=location["name"],
        jurisdiction=location.get("jurisdiction", location["name"]),
        references=references,
        from_image=from_image,
    )

    instructions = rule.get("instructions", "")
    notes = rule.get("notes") or ""
    if notes and notes.lower() != "none":
        instructions = f"{instructions} {notes}".strip()

    return RecycleResponse(
        item=item_label,
        item_id=item_id,
        location_id=location_id,
        location_name=location["name"],
        category=rule.get("category", "unknown"),
        accepted=rule.get("accepted", False),
        instructions=instructions,
        steps=rule.get("steps", []),
        sources=rule.get("sources", []),
        matched_rules=[item_id],
        reference_count=len(references),
        from_image=from_image,
        cached=cache_layers.any_hit(),
        cache=cache_layers,
        dynamic_location=dynamic,
    )
