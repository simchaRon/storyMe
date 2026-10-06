from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import settings
from .database import Base, add_missing_columns, engine
from .limiter import limiter
from .routers import auth, settings as settings_router, stories, voice


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)  # dev convenience; use Alembic in production
    add_missing_columns(engine)
    yield


app = FastAPI(title="DreamTale AI", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, settings_router.router, stories.router, voice.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}
