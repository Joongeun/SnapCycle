from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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

app.include_router(recycle.router, prefix="/api/recycle", tags=["recycle"])
app.include_router(location.router, prefix="/api/location", tags=["location"])
app.include_router(rrr.router, prefix="/api", tags=["rrr"])


@app.get("/health")
async def health():
    return {"ok": True, "status": "ok"}
