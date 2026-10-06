"""A person reads a story aloud in the app. The recording is kept and can be played later."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..limiter import limiter
from ..models import Story, StoryRecording, User
from ..schemas import RecordingOut, RecordingUrlOut
from ..security import AUDIO_TOKEN_MINUTES, check_audio_token, create_audio_token, get_current_user
from ..services import recording_store
from ..services.media_usage import media_used_bytes
from ..textclean import strip_invisible
from ..userlock import user_lock

router = APIRouter(prefix="/api", tags=["recordings"])

MAX_NAME = 60
MAX_DURATION_SECONDS = 3600
# Which consent text the speaker saw (the app shows it on the record screen). Change it when the text changes.
CONSENT_TEXT_VERSION = "2026-10-v1"

def _own_story(db: Session, user: User, story_id: int) -> Story:
    story = db.scalar(select(Story).where(Story.id == story_id, Story.user_id == user.id))
    if story is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Story not found")
    return story


def _own_recording(db: Session, user: User, recording_id: int) -> StoryRecording:
    rec = db.scalar(
        select(StoryRecording).where(StoryRecording.id == recording_id, StoryRecording.user_id == user.id)
    )
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recording not found")
    return rec


def _clean_name(value: str) -> str:
    # Hidden characters (including text-direction tricks) are removed. One space between words.
    name = " ".join(strip_invisible(value).split())
    if not 1 <= len(name) <= MAX_NAME:
        raise HTTPException(422, f"The name must be 1 to {MAX_NAME} characters")
    return name


@router.post("/stories/{story_id}/recordings", response_model=RecordingOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def upload_recording(
    request: Request,
    story_id: int,
    file: UploadFile = File(...),
    name: str = Form(...),
    duration_seconds: float = Form(0.0),
    consent: bool = Form(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # The body size is already limited while it arrives (MaxBodySizeMiddleware). The checks below are the second layer.
    story = _own_story(db, user, story_id)
    if not consent:
        raise HTTPException(422, "The speaker must agree to the recording")
    clean_name = _clean_name(name)
    if not 0 <= duration_seconds <= MAX_DURATION_SECONDS:  # also false for nan
        raise HTTPException(422, "The duration is not valid")

    max_bytes = settings.max_recording_mb * 1024 * 1024
    with user_lock(user.id):
        # On PostgreSQL this also locks the row across several servers. SQLite does not need it.
        db.execute(select(User.id).where(User.id == user.id).with_for_update())
        count = db.scalar(select(func.count()).select_from(StoryRecording).where(StoryRecording.story_id == story.id))
        if count >= settings.max_recordings_per_story:
            raise HTTPException(status.HTTP_409_CONFLICT, "This story already has the most recordings it can have")
        used = media_used_bytes(db, user.id)  # recordings, voice samples and cloned-voice audio together
        room = settings.max_user_media_mb * 1024 * 1024 - used
        if room <= 0:
            raise HTTPException(413, "There is no storage left. Delete an old recording.")
        try:
            file_name, size = recording_store.save_stream(user.id, file.file, min(max_bytes, room))
        except recording_store.NotAudio:
            raise HTTPException(415, "This is not an audio file we can use")
        except recording_store.TooBig:
            raise HTTPException(413, "The recording is too big, or there is no storage left")

        rec = StoryRecording(
            story_id=story.id,
            user_id=user.id,
            name=clean_name,
            file_name=file_name,
            size_bytes=size,
            duration_seconds=duration_seconds,
            consent_at=datetime.now(timezone.utc),  # set here, only after consent was given
            consent_text_version=CONSENT_TEXT_VERSION,
        )
        db.add(rec)
        try:
            db.commit()
        except Exception:
            db.rollback()
            recording_store.delete_files(user.id, [file_name])  # do not leave a file with no row
            raise
    return rec


@router.get("/stories/{story_id}/recordings", response_model=list[RecordingOut])
def list_recordings(story_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    story = _own_story(db, user, story_id)
    return db.scalars(
        select(StoryRecording).where(StoryRecording.story_id == story.id).order_by(StoryRecording.created_at, StoryRecording.id)
    ).all()


@router.get("/recordings/{recording_id}/url", response_model=RecordingUrlOut)
def recording_url(recording_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = _own_recording(db, user, recording_id)
    token = create_audio_token(rec.id, user.id)
    return RecordingUrlOut(url=f"/api/recordings/{rec.id}/audio?sig={token}", expires_in=AUDIO_TOKEN_MINUTES * 60)


# No Authorization header here: audio players on the web cannot send one. The short-lived signature
# in the address proves the user asked for this recording. It is hidden in the server logs (see
# RedactSignatureFilter) and the answer tells browsers not to pass the address on (no-referrer).
# FileResponse also answers Range requests, which iPhones need to play audio from a server.
@router.get("/recordings/{recording_id}/audio")
def recording_audio(recording_id: int, sig: str, db: Session = Depends(get_db)):
    user_id = check_audio_token(sig, recording_id)
    rec = db.scalar(select(StoryRecording).where(StoryRecording.id == recording_id, StoryRecording.user_id == user_id))
    if rec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recording not found")
    try:
        path = recording_store.path_for(rec.user_id, rec.file_name)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recording not found")
    if not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recording not found")
    extension = rec.file_name.rsplit(".", 1)[-1]
    return FileResponse(
        path,
        media_type=recording_store.content_type_for(rec.file_name),
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Content-Disposition": f'inline; filename="recording.{extension}"',
            "Content-Security-Policy": "sandbox; default-src 'none'",
        },
    )


@router.delete("/recordings/{recording_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recording(recording_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rec = _own_recording(db, user, recording_id)
    file_name = rec.file_name
    db.delete(rec)
    db.commit()
    recording_store.delete_files(user.id, [file_name])
    return Response(status_code=status.HTTP_204_NO_CONTENT)
