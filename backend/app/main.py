from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import location, recycle, rrr
from app.config import settings
from app.services.cache import close_redis, init_redis
from app.services.item_index import init_item_index


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
