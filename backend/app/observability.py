"""Arize Phoenix (OSS) tracing setup.

One call to ``setup_tracing()`` at FastAPI startup:
  * registers the OTEL tracer provider against the Phoenix collector
    (``phoenix.otel.register``), and
  * auto-instruments every OpenInference package that is installed
    (google-genai, httpx, redis) so their calls become spans automatically.

Manual spans in ``orchestrator.py`` use ``get_tracer()`` + ``chain_span()`` to make
each pipeline stage visible even where auto-instrumentation has nothing to hook.

Everything degrades to a no-op if Phoenix is disabled or the SDK isn't installed,
so the app always boots.
"""
from __future__ import annotations

import logging
import os
from contextlib import contextmanager
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

_initialized = False

# OpenInference semantic-convention keys (string fallbacks so we don't hard-depend
# on the semconv package at import time).
SPAN_KIND = "openinference.span.kind"
INPUT_VALUE = "input.value"
OUTPUT_VALUE = "output.value"
METADATA = "metadata"


def setup_tracing() -> Optional[Any]:
    """Register the Phoenix tracer provider. Idempotent and best-effort."""
    global _initialized
    if _initialized:
        return None

    if not settings.phoenix_enabled:
        logger.info("Phoenix tracing disabled (PHOENIX_ENABLED=false).")
        return None
    if not settings.phoenix_collector_endpoint:
        logger.warning("PHOENIX_COLLECTOR_ENDPOINT not set — tracing is off.")
        return None

    # phoenix.otel.register reads these from the environment.
    os.environ.setdefault("PHOENIX_COLLECTOR_ENDPOINT", settings.phoenix_collector_endpoint)
    if settings.phoenix_api_key:
        os.environ.setdefault("PHOENIX_API_KEY", settings.phoenix_api_key)
        # Phoenix Cloud authenticates the OTLP exporter via this header.
        os.environ.setdefault(
            "OTEL_EXPORTER_OTLP_HEADERS", f"authorization=Bearer {settings.phoenix_api_key}"
        )

    try:
        from phoenix.otel import register

        register(
            project_name=settings.phoenix_project or "rrr-backend",
            auto_instrument=True,  # picks up every installed openinference-instrumentation-*
            batch=True,
        )
        _initialized = True
        logger.info(
            "Phoenix tracing on → project=%s endpoint=%s",
            settings.phoenix_project,
            settings.phoenix_collector_endpoint,
        )
    except Exception:  # noqa: BLE001 — never let observability crash the app
        logger.exception("Phoenix tracing failed to initialize; continuing without it.")
        return None

    return None


def capture_silent_failure(exc: BaseException, *, where: str, **context: Any) -> None:
    """Report an exception that the app is about to swallow behind a graceful fallback.

    The app keeps degrading exactly as before (caller still returns its fallback);
    this just makes the masked failure visible in Sentry. Tags every event with
    ``silent_failure=true`` and ``failure.where=<site>`` so the hidden failures are
    filterable from genuine 5xx errors. No-ops if sentry_sdk isn't installed or no
    DSN was configured.
    """
    try:
        import sentry_sdk
    except Exception:  # noqa: BLE001 — observability must never crash the app
        return

    try:
        with sentry_sdk.new_scope() as scope:
            scope.set_tag("silent_failure", "true")
            scope.set_tag("failure.where", where)
            if context:
                scope.set_context("silent_failure", {"where": where, **context})
            sentry_sdk.capture_exception(exc)
    except Exception:  # noqa: BLE001
        pass


def get_tracer(name: str = "rrr.backend"):
    """Return an OTEL tracer. Safe even if no provider was registered (no-op spans)."""
    from opentelemetry import trace

    return trace.get_tracer(name)


@contextmanager
def chain_span(name: str, *, kind: str = "CHAIN", inputs: Any = None, metadata: Optional[dict] = None):
    """Start a manual OpenInference span for a pipeline stage.

    Sets the OpenInference span kind (CHAIN/TOOL/RETRIEVER/...) and the input value
    so the stage renders as a first-class node in the Phoenix trace tree. Yields the
    span; set the output with ``span.set_attribute(OUTPUT_VALUE, ...)`` or use the
    returned helper.
    """
    tracer = get_tracer()
    with tracer.start_as_current_span(name) as span:
        try:
            span.set_attribute(SPAN_KIND, kind)
            if inputs is not None:
                span.set_attribute(INPUT_VALUE, _stringify(inputs))
            if metadata:
                for k, v in metadata.items():
                    span.set_attribute(f"metadata.{k}", _stringify(v))
        except Exception:  # noqa: BLE001
            pass
        yield span


@contextmanager
def llm_span(name: str, *, model: str, system: Optional[str] = None, user: Any = None):
    """Manual OpenInference LLM span for a Gemini call.

    Used because the google-genai auto-instrumentor is incompatible with the pinned
    google-genai on Python 3.14. Records model, provider, and the prompt; set the
    completion + token usage afterward via ``set_llm_output``.
    """
    tracer = get_tracer()
    with tracer.start_as_current_span(name) as span:
        try:
            span.set_attribute(SPAN_KIND, "LLM")
            span.set_attribute("llm.model_name", model)
            span.set_attribute("llm.provider", "google")
            span.set_attribute("llm.system", "gemini")
            if system is not None:
                span.set_attribute("llm.prompt_template.system", _stringify(system))
            if user is not None:
                span.set_attribute(INPUT_VALUE, _stringify(user))
        except Exception:  # noqa: BLE001
            pass
        yield span


def set_llm_output(span, text: Any, usage: Any = None) -> None:
    """Attach the completion text and (if present) Gemini usage_metadata token counts."""
    try:
        span.set_attribute(OUTPUT_VALUE, _stringify(text))
        if usage is not None:
            prompt = getattr(usage, "prompt_token_count", None)
            out = getattr(usage, "candidates_token_count", None)
            total = getattr(usage, "total_token_count", None)
            if prompt is not None:
                span.set_attribute("llm.token_count.prompt", int(prompt))
            if out is not None:
                span.set_attribute("llm.token_count.completion", int(out))
            if total is not None:
                span.set_attribute("llm.token_count.total", int(total))
    except Exception:  # noqa: BLE001
        pass


def set_span_output(span, value: Any) -> None:
    try:
        span.set_attribute(OUTPUT_VALUE, _stringify(value))
    except Exception:  # noqa: BLE001
        pass


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    try:
        import json

        return json.dumps(value, default=str)[:8000]
    except Exception:  # noqa: BLE001
        return str(value)[:8000]
