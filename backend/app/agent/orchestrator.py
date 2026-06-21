from __future__ import annotations

from typing import Optional

from app.agent.schemas import CacheLayers, RecycleRequest, RecycleResponse
from app.observability import chain_span, set_span_output
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
    Agent workflow (one Phoenix trace, one child span per stage):
      1. Identify item (vision image OR text)
      2. Resolve location
      3. Resolve item_id (vector search → classify)
      4. Gather references (Redis + local JSON + Browserbase) — never return directly
      5. AI agent synthesizes instructions using references
    """
    with chain_span(
        "recycle.pipeline",
        kind="CHAIN",
        inputs={
            "item": request.item,
            "location_id": request.location_id,
            "has_image": bool(image_bytes or request.image_base64),
        },
    ) as root_span:
        cache_layers = CacheLayers()
        from_image = False
        item_label = request.item

        # --- 1. Identify item (vision or text) ---
        with chain_span("identify_item", kind="TOOL", inputs={"from_image": bool(image_bytes or request.image_base64)}) as span:
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
            set_span_output(span, {"item_label": item_label, "from_image": from_image})

        # --- 2. Resolve location ---
        with chain_span("resolve_location", kind="TOOL", inputs={"client_ip": client_ip, "location_id": request.location_id}) as span:
            location_id, location, geo = await resolve_location(client_ip, request.location_id)
            cache_layers.ip_cache_hit = geo.get("ip_cache_hit", False)
            dynamic = geo.get("dynamic", location.get("dynamic", False))
            set_span_output(span, {"location_id": location_id, "name": location.get("name"), "dynamic": dynamic})

        # --- 3. Resolve item_id (vector search → classify) ---
        with chain_span("resolve_item_id", kind="RETRIEVER", inputs={"item_label": item_label}) as span:
            item_match = await search_item(item_label)
            if item_match:
                item_id = item_match.item_id
                cache_layers.item_vector_hit = True
            else:
                item_id = await classify_item(item_label)
                await index_item_query(item_label, item_id)
                cache_layers.item_vector_hit = False
            set_span_output(span, {"item_id": item_id, "vector_hit": cache_layers.item_vector_hit})

        # --- 4. Gather references (Redis + local JSON + Browserbase) ---
        with chain_span(
            "gather_references",
            kind="RETRIEVER",
            inputs={"location_id": location_id, "item_id": item_id, "dynamic": dynamic},
        ) as span:
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
            set_span_output(
                span,
                {
                    "reference_count": len(references),
                    "ref_types": [r.get("ref_type") for r in references],
                    "redis_hit": redis_hit,
                    "browserbase_used": browserbase_used,
                },
            )

        # --- 5. LLM synthesis (the generate() call is auto-traced as a child LLM span) ---
        with chain_span(
            "synthesize_instructions",
            kind="CHAIN",
            inputs={"item": item_label, "location_name": location["name"], "reference_count": len(references)},
        ) as span:
            rule = await synthesize_instructions(
                item=item_label,
                item_id=item_id,
                location_name=location["name"],
                jurisdiction=location.get("jurisdiction", location["name"]),
                references=references,
                from_image=from_image,
            )
            set_span_output(span, rule)

        instructions = rule.get("instructions", "")
        notes = rule.get("notes") or ""
        if notes and notes.lower() != "none":
            instructions = f"{instructions} {notes}".strip()

        response = RecycleResponse(
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

        set_span_output(
            root_span,
            {
                "item": response.item,
                "location_id": response.location_id,
                "location_name": response.location_name,
                "category": response.category,
                "accepted": response.accepted,
                "instructions": response.instructions,
                "steps": response.steps,
                "reference_count": response.reference_count,
            },
        )
        return response
