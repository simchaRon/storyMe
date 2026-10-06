import logging
import threading
from collections import defaultdict
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .config import settings
from sqlalchemy import select

from .database import Base, SessionLocal, add_missing_columns, engine
from .limiter import limiter
from .middleware import MaxBodySizeMiddleware, RedactSignatureFilter
from .models import Narration, StoryRecording, Voice
from .routers import auth, cloning, recordings, settings as settings_router, stories, voice
from .services import recording_store
from .services.narrator import get_narration_runner, recover_after_restart


# The link to a recording has a secret signature in the address. Keep it out of the access log.
logging.getLogger("uvicorn.access").addFilter(RedactSignatureFilter())


def _sweep_orphan_recordings() -> None:
    """At start: remove audio files that have no database row (left by a crash or a failed delete)."""
    try:
        with SessionLocal() as db:
            for kind, model in (("recordings", StoryRecording), ("voices", Voice), ("narrations", Narration)):
                known: dict[int, set[str]] = defaultdict(set)
                for user_id, file_name in db.execute(select(model.user_id, model.file_name)):
                    if file_name:
                        known[user_id].add(file_name)
                recording_store.sweep_orphans(known, kind=kind)
    except Exception:  # a sweep problem must never stop the server from starting
        logging.getLogger(__name__).warning("Audio sweep failed", exc_info=True)


SWEEP_EVERY_SECONDS = 24 * 60 * 60


def _sweep_every_day() -> None:
    """Run the sweep now, then once a day. A server that stays up for weeks must not keep orphan files."""
    _sweep_orphan_recordings()
    timer = threading.Timer(SWEEP_EVERY_SECONDS, _sweep_every_day)
    timer.daemon = True  # it must not keep the server from stopping
    timer.start()


def _recover_narrations() -> None:
    try:
        recover_after_restart(get_narration_runner())
    except Exception:
        logging.getLogger(__name__).warning("Narration recovery failed", exc_info=True)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)  # dev convenience; use Alembic in production
    add_missing_columns(engine)
    _sweep_every_day()
    _recover_narrations()
    yield


app = FastAPI(title="DreamTale AI", lifespan=lifespan)
app.state.limiter = limiter
# Added before CORS, so CORS is the outer layer and a 413 answer still carries the CORS headers.
app.add_middleware(MaxBodySizeMiddleware)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, settings_router.router, stories.router, recordings.router, cloning.router, voice.router):
    app.include_router(r)


@app.get("/api/health")
def health():
    return {"status": "ok"}
