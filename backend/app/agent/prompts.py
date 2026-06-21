from __future__ import annotations

from typing import Any, Dict, List

from app.config import settings


AGENT_SYSTEM = """You are a local recycling regulations agent.
You receive reference material from prior research (Redis cache, local databases, web sources).
Use references to inform your answer but always synthesize clear, user-facing instructions.
Adapt references to the specific item shown or described. If references conflict, note uncertainty and give the safest option.
Never mention Redis, caches, or internal systems to the user."""


# v2: hardened for the three eval criteria — locality, completeness, correctness.
AGENT_SYSTEM_V2 = """You are a local recycling & disposal regulations agent for a SPECIFIC city/jurisdiction.
You receive reference material from prior research (local rule databases and web sources for that jurisdiction).

Follow these rules:
1. LOCALITY: Ground every recommendation in the named location. Use the jurisdiction's own program
   and container names from the references (e.g. "gray recycling cart", "green compost cart",
   the named hazardous-waste or e-waste facility). Do NOT give generic, nationwide advice. If the
   references contain no location-specific rule for this item, say so explicitly and give the safest
   local-fallback (e.g. "take to <this city>'s transfer station") rather than inventing a program.
2. CORRECTNESS: When the references state a rule for this location, follow it exactly — its category,
   its accepted/not-accepted status, and its caveats override your general knowledge.
3. COMPLETENESS: Give fully actionable steps — how to prepare the item, exactly where it goes, and any
   caveat that changes the outcome. Provide at least two concrete steps.
Never mention Redis, caches, or internal systems to the user."""


def agent_system() -> str:
    """System prompt for the synthesis agent, switched by PROMPT_VARIANT."""
    return AGENT_SYSTEM_V2 if settings.prompt_variant == "v2" else AGENT_SYSTEM


def build_agent_instruction_prompt(
    *,
    item: str,
    item_id: str,
    location_name: str,
    jurisdiction: str,
    references: List[Dict[str, Any]],
    from_image: bool = False,
) -> str:
    if settings.prompt_variant == "v2":
        return _build_v2(item, item_id, location_name, jurisdiction, references, from_image)

    input_line = f'Item identified from photo: "{item}"' if from_image else f'Item: "{item}"'
    refs_block = _format_references(references)

    return f"""{input_line}
Standardized item ID: {item_id}
Location: {location_name} ({jurisdiction})

Reference material from prior research (use as guidance, do not copy blindly):
{refs_block}

Synthesize recycling / cycling / disposal instructions for this user.

Respond in this exact format:
ACCEPTED: [true or false]
CATEGORY: [recyclable | compost | landfill | special | unknown]
INSTRUCTIONS: [1-2 sentence summary for the user]
STEPS:
- [step 1]
- [step 2]
- [step 3 if needed]
NOTES: [caveats or "none"]
"""


def _build_v2(
    item: str,
    item_id: str,
    location_name: str,
    jurisdiction: str,
    references: List[Dict[str, Any]],
    from_image: bool,
) -> str:
    input_line = f'Item identified from photo: "{item}"' if from_image else f'Item: "{item}"'
    refs_block = _format_references(references)

    return f"""{input_line}
Standardized item ID: {item_id}
Location: {location_name} ({jurisdiction})

Reference material for THIS jurisdiction (authoritative — prefer it over general knowledge):
{refs_block}

Write disposal instructions for a resident of {location_name}. Name the specific local
containers/programs/facilities from the references. If no local rule for this item is present
above, say so and recommend the safest {location_name}-specific fallback — do not invent programs.

Respond in this exact format:
ACCEPTED: [true or false]
CATEGORY: [recyclable | compost | landfill | special | unknown]
INSTRUCTIONS: [1-2 sentence summary naming where in {location_name} this item goes]
STEPS:
- [prep step — how to clean/flatten/empty/contain the item]
- [destination step — the exact local cart/bin/drop-off it goes to in {location_name}]
- [caveat step if the references note one]
NOTES: [location-specific caveats, drop-off locations, or "none"]
"""


def _format_references(references: List[Dict[str, Any]]) -> str:
    if not references:
        return "No prior reference material available. Use general best practices and note uncertainty."

    parts = []
    for i, ref in enumerate(references, 1):
        ref_type = ref.get("ref_type") or ref.get("source", "unknown")
        parts.append(
            f"{i}. [{ref_type}]\n"
            f"   Category: {ref.get('category', 'unknown')}\n"
            f"   Instructions: {ref.get('instructions', 'N/A')}\n"
            f"   Steps: {ref.get('steps', [])}\n"
            f"   Notes: {ref.get('notes', 'none')}\n"
            f"   Sources: {ref.get('sources', [])}"
        )
    return "\n\n".join(parts)
