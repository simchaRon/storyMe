from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..models import Narration, StoryRecording, Voice


def media_used_bytes(db: Session, user_id: int) -> int:
    """All audio a user keeps on the server: recordings, voice samples and audio made with their voices."""
    total = 0
    for model in (StoryRecording, Voice, Narration):
        total += db.scalar(select(func.coalesce(func.sum(model.size_bytes), 0)).where(model.user_id == user_id)) or 0
    return int(total)
