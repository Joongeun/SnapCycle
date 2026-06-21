from __future__ import annotations

from typing import Any, Dict, List


AGENT_SYSTEM = """You are a local recycling regulations agent.
You receive reference material from prior research (Redis cache, local databases, web sources).
Use references to inform your answer but always synthesize clear, user-facing instructions.
Adapt references to the specific item shown or described. If references conflict, note uncertainty and give the safest option.
Never mention Redis, caches, or internal systems to the user."""


def build_agent_instruction_prompt(
    *,
    item: str,
    item_id: str,
    location_name: str,
    jurisdiction: str,
    references: List[Dict[str, Any]],
    from_image: bool = False,
) -> str:
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
