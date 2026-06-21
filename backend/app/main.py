from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import location, recycle, rrr
from app.config import settings
from app.observability import setup_tracing
from app.services.cache import close_redis, init_redis
from app.services.item_index import init_item_index

# Initialize Sentry BEFORE the app + instrumented libraries are first used, so the
# capture_exception() calls sprinkled through the silent-failure fallbacks have a
# live client to report to. No-ops cleanly when SENTRY_DSN is unset.
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
        integrations=[
            StarletteIntegration(transaction_style="endpoint"),
            FastApiIntegration(transaction_style="endpoint"),
        ],
    )

# Register Phoenix tracing before the app + instrumented libraries are first used.
setup_tracing()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_redis()
    await init_item_index()
    yield
    await close_redis()


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException):
    """Expo client reads `error.message`; FastAPI defaults to `detail`."""
    message = exc.detail if isinstance(exc.detail, str) else "Request failed"
    return JSONResponse(status_code=exc.status_code, content={"message": message})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, _exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"message": "Invalid request body"})


app.include_router(recycle.router, prefix="/api/recycle", tags=["recycle"])
app.include_router(location.router, prefix="/api/location", tags=["location"])
app.include_router(rrr.router, prefix="/api", tags=["rrr"])


@app.get("/health")
async def health():
    return {"ok": True, "status": "ok"}


@app.get("/debug/sentry-test")
async def sentry_test():
    """Send a test event to Sentry. Remove or protect in production."""
    import sentry_sdk

    sentry_sdk.capture_message("RRR backend Sentry test ping", level="info")
    return {"sent": True, "sentry_enabled": bool(settings.sentry_dsn)}
