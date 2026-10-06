"""Voice cloning (English): record a voice sample, then have an English story read in that voice.

What is guaranteed, and what is not:
- A voice is only made from a sample that comes with a consent flag and the current consent text.
  The server cannot prove who is speaking: a stolen recording could be uploaded (see "Known limits"
  in docs/flow-cloning.md). The same sample file cannot be used twice, and the upload is logged.
- Only the account that made a voice can use it. Only its own stories can be read with it.
- Only the text of a story the app wrote is read. A user cannot type a text to be read. BUT the story is written
  by Claude from the user's own words, so it is checked before it is read: with plain code and with a second
  Claude check (services/narrator.py). A story with a link, an e-mail address, a phone number, text copied
  from the user's request, or a message to a real person is refused.
- A voice and everything made with it can be deleted at any time.
"""

import hashlib
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..limiter import limiter
from ..models import Narration, NarrationLog, Story, User, Voice
from ..schemas import NarrationCreate, NarrationOut, RecordingUrlOut, VoiceCapabilities, VoiceOut
from ..security import AUDIO_TOKEN_MINUTES, check_audio_token, create_audio_token, get_current_user
from ..services import recording_store
from ..services.media_usage import media_used_bytes
from ..services.narrator import (
    CANNOT_READ,
    NarrationRunner,
    TtsClient,
    TtsError,
    get_narration_runner,
    get_tts_client,
    refuse_reason,
    split_for_tts,
    story_text,
)
from ..textclean import strip_invisible
from ..userlock import user_lock

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["voice cloning"])

LANGUAGES = ["en"]  # a cloned voice reads English stories only, for now
MIN_SAMPLE_SECONDS = 10
MAX_SAMPLE_SECONDS = 120
MAX_NAME = 60
# The consent text the speaker sees in the app. The app sends this version with the upload. When the text
# changes, change the version here and in mobile/src/consent.ts. An old app is refused until it is updated.
CONSENT_TEXT_VERSION = "2026-10-clone-v1"


def _require_enabled() -> None:
    if not settings.tts_url:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Voice cloning is not set up on this server")


def _own_voice(db: Session, user: User, voice_id: int) -> Voice:
    voice = db.scalar(select(Voice).where(Voice.id == voice_id, Voice.user_id == user.id))
    if voice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Voice not found")
    return voice


def _own_story(db: Session, user: User, story_id: int) -> Story:
    story = db.scalar(select(Story).where(Story.id == story_id, Story.user_id == user.id))
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    return story


def _own_narration(db: Session, user: User, narration_id: int) -> Narration:
    n = db.scalar(select(Narration).where(Narration.id == narration_id, Narration.user_id == user.id))
    if n is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found")
    return n


def _clean_name(value: str) -> str:
    name = " ".join(strip_invisible(value).split())
    if not 1 <= len(name) <= MAX_NAME:
        raise HTTPException(422, f"The name must be 1 to {MAX_NAME} characters")
    return name


def _sha256_of(user_id: int, file_name: str) -> str:
    digest = hashlib.sha256()
    with open(recording_store.path_for(user_id, file_name, "voices"), "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


# ---------------------------------------------------------------- what is possible
@router.get("/voices/capabilities", response_model=VoiceCapabilities)
def capabilities(user: User = Depends(get_current_user)):
    return VoiceCapabilities(
        enabled=bool(settings.tts_url),
        languages=LANGUAGES,
        min_sample_seconds=MIN_SAMPLE_SECONDS,
        max_sample_seconds=MAX_SAMPLE_SECONDS,
    )


# ---------------------------------------------------------------- voices (the samples)
@router.post("/voices", response_model=VoiceOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_voice(
    request: Request,
    file: UploadFile = File(...),
    name: str = Form(...),
    duration_seconds: float = Form(0.0),  # what the app measured. The real length is measured by the voice worker
    consent: bool = Form(False),
    consent_text_version: str = Form(""),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    tts: TtsClient = Depends(get_tts_client),
):
    _require_enabled()
    if not consent:
        raise HTTPException(422, "The speaker must agree that their voice is copied")
    if consent_text_version != CONSENT_TEXT_VERSION:
        raise HTTPException(422, "The consent text has changed. Please update the app.")
    clean_name = _clean_name(name)
    if not 0 <= duration_seconds <= MAX_SAMPLE_SECONDS * 2:  # a sanity check only. False for nan too
        raise HTTPException(422, "The duration is not valid")

    max_bytes = settings.max_voice_sample_mb * 1024 * 1024
    with user_lock(user.id):
        db.execute(select(User.id).where(User.id == user.id).with_for_update())  # PostgreSQL: lock across servers
        count = db.scalar(select(func.count()).select_from(Voice).where(Voice.user_id == user.id))
        if count >= settings.max_voices_per_user:
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have the most voices you can have. Delete one first.")
        room = settings.max_user_media_mb * 1024 * 1024 - media_used_bytes(db, user.id)
        if room <= 0:
            raise HTTPException(413, "There is no storage left. Delete old audio.")
        try:
            file_name, size = recording_store.save_stream(user.id, file.file, min(max_bytes, room), kind="voices")
        except recording_store.NotAudio:
            raise HTTPException(415, "This is not an audio file we can use")
        except recording_store.TooBig:
            raise HTTPException(413, "The recording is too big, or there is no storage left")

        def reject(code: int, message: str):
            recording_store.delete_files(user.id, [file_name], "voices")
            raise HTTPException(code, message)

        # The same file cannot become a voice twice (a stolen recording tried again, or by another account).
        sha = _sha256_of(user.id, file_name)
        if db.scalar(select(Voice.id).where(Voice.sample_sha256 == sha)) is not None:
            log.warning("A voice sample was uploaded again (user %s)", user.id)
            reject(409, "This recording was already used for a voice")
        # The real length, measured by the voice worker. The length the app sends is not trusted.
        try:
            seconds = tts.inspect(recording_store.path_for(user.id, file_name, "voices").read_bytes())
        except TtsError as e:
            reject(503 if "reachable" in e.message or "too long" in e.message else 422, e.message)
        if not MIN_SAMPLE_SECONDS <= seconds <= MAX_SAMPLE_SECONDS + 5:
            reject(422, f"The sample must be {MIN_SAMPLE_SECONDS} to {MAX_SAMPLE_SECONDS} seconds long")

        voice = Voice(
            user_id=user.id,
            name=clean_name,
            language="en",
            file_name=file_name,
            size_bytes=size,
            duration_seconds=round(seconds, 1),
            consent_at=datetime.now(timezone.utc),
            consent_text_version=consent_text_version,
            sample_sha256=sha,
            uploaded_from=(request.client.host if request.client else None),
        )
        db.add(voice)
        try:
            db.commit()
        except Exception:
            db.rollback()
            recording_store.delete_files(user.id, [file_name], "voices")
            raise
    log.info("Voice %s created for user %s from %s", voice.id, user.id, voice.uploaded_from)
    return voice


@router.get("/voices", response_model=list[VoiceOut])
def list_voices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Voice).where(Voice.user_id == user.id).order_by(Voice.created_at, Voice.id)).all()


@router.delete("/voices/{voice_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_voice(voice_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Deletes the sample and every audio file that was made with this voice."""
    voice = _own_voice(db, user, voice_id)
    sample = voice.file_name
    made = [n.file_name for n in voice.narrations if n.file_name]
    db.delete(voice)  # the rows of its narrations go with it
    db.commit()
    recording_store.delete_files(user.id, [sample], "voices")
    recording_store.delete_files(user.id, made, "narrations")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- narrations (a story read in a cloned voice)
def _existing_narration(db: Session, story_id: int, voice_id: int):
    return db.scalar(select(Narration).where(Narration.story_id == story_id, Narration.voice_id == voice_id))


@router.post("/stories/{story_id}/narrations", response_model=NarrationOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def create_narration(
    request: Request,
    response: Response,
    story_id: int,
    body: NarrationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    runner: NarrationRunner = Depends(get_narration_runner),
):
    _require_enabled()
    story = _own_story(db, user, story_id)
    voice = _own_voice(db, user, body.voice_id)
    if story.language not in LANGUAGES or voice.language not in LANGUAGES:
        raise HTTPException(422, "A cloned voice can read English stories only, for now")
    text = story_text(story)
    if len(text) > settings.max_narration_chars or len(split_for_tts(text)) > settings.max_narration_pieces:
        raise HTTPException(413, "This story is too long to make into audio")
    if refuse_reason(story):  # links, phone numbers, or text copied from the user's own request
        raise HTTPException(422, CANNOT_READ)

    with user_lock(user.id):
        db.execute(select(User.id).where(User.id == user.id).with_for_update())
        existing = _existing_narration(db, story.id, voice.id)
        if existing is not None and existing.status == "done":
            # Normally there is nothing new to do. If its file was lost, make it again.
            try:
                if recording_store.path_for(user.id, existing.file_name or "", "narrations").is_file():
                    response.status_code = status.HTTP_200_OK
                    return existing
            except ValueError:
                pass
        elif existing is not None and existing.status != "failed":
            response.status_code = status.HTTP_200_OK  # it is waiting or being made. Nothing new starts
            return existing

        busy = db.scalar(
            select(func.count()).select_from(Narration).where(
                Narration.user_id == user.id, Narration.status.in_(("queued", "running"))
            )
        )
        if busy:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Wait for the audio you started before you start another")
        start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today = db.scalar(
            select(func.count()).select_from(NarrationLog).where(
                NarrationLog.user_id == user.id, NarrationLog.created_at >= start, NarrationLog.refunded.is_(False)
            )
        )
        if today >= settings.daily_narration_limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "You made the most audio you can make today. Try again tomorrow.")

        old_file = existing.file_name if existing is not None else None
        if existing is not None:
            db.delete(existing)  # a failed try (or an audio whose file was lost) is replaced
            db.flush()
        narration = Narration(story_id=story.id, voice_id=voice.id, user_id=user.id, voice_name=voice.name)
        db.add(narration)
        try:
            db.flush()
            db.add(NarrationLog(user_id=user.id, narration_id=narration.id))
            db.commit()
        except IntegrityError:  # another request made it first (the database allows one per story and voice)
            db.rollback()
            winner = _existing_narration(db, story.id, voice.id)
            if winner is None:
                raise
            response.status_code = status.HTTP_200_OK
            return winner
    if old_file:
        recording_store.delete_files(user.id, [old_file], "narrations")
    runner.submit(narration.id)
    return narration


@router.get("/stories/{story_id}/narrations", response_model=list[NarrationOut])
def list_narrations(story_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    story = _own_story(db, user, story_id)
    return db.scalars(select(Narration).where(Narration.story_id == story.id).order_by(Narration.created_at, Narration.id)).all()


@router.get("/narrations/{narration_id}/url", response_model=RecordingUrlOut)
def narration_url(narration_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _own_narration(db, user, narration_id)
    if n.status != "done":
        raise HTTPException(status.HTTP_409_CONFLICT, "The audio is not ready yet")
    token = create_audio_token(n.id, user.id, kind="narration")
    return RecordingUrlOut(url=f"/api/narrations/{n.id}/audio?sig={token}", expires_in=AUDIO_TOKEN_MINUTES * 60)


# Like the recordings: no Authorization header (web players cannot send one). The short-lived signature
# in the address is the proof. See the notes at the recording audio route.
@router.get("/narrations/{narration_id}/audio")
def narration_audio(narration_id: int, sig: str, db: Session = Depends(get_db)):
    user_id = check_audio_token(sig, narration_id, kind="narration")
    n = db.scalar(select(Narration).where(Narration.id == narration_id, Narration.user_id == user_id))
    if n is None or n.status != "done" or not n.file_name:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found")
    try:
        path = recording_store.path_for(n.user_id, n.file_name, "narrations")
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found")
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Audio not found")
    return FileResponse(
        path,
        media_type=recording_store.content_type_for(n.file_name),
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Disposition": 'inline; filename="story.wav"',
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


@router.delete("/narrations/{narration_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_narration(narration_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    n = _own_narration(db, user, narration_id)
    file_name = n.file_name
    db.delete(n)  # if it is still being made, the worker sees that the row is gone and stops
    db.commit()
    if file_name:
        recording_store.delete_files(user.id, [file_name], "narrations")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
