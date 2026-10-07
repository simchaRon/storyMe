from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .database import Base
from .defaults import DEFAULT_CHILD_AGE, DEFAULT_LENGTH_MINUTES


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UTCDateTime(TypeDecorator):
    """Always stores UTC and always returns an aware UTC value (SQLite drops the time zone)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    def process_result_value(self, value, dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    preferred_language: Mapped[str] = mapped_column(String(2), default="en")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    settings: Mapped[Optional["UserSettings"]] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    stories: Mapped[list["Story"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class PasswordReset(Base):
    """A password reset link that was sent. Only the hash of the token is kept, so a stolen database cannot reset anything."""

    __tablename__ = "password_resets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime)
    used_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    theme: Mapped[str] = mapped_column(String(10), default="dark")
    default_educational_level: Mapped[int] = mapped_column(default=2)
    voice_enabled: Mapped[bool] = mapped_column(default=False)

    user: Mapped[User] = relationship(back_populates="settings")


class Story(Base):
    __tablename__ = "stories"
    __table_args__ = (Index("ix_stories_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)
    keywords: Mapped[list] = mapped_column(JSON, default=list)
    prompt: Mapped[Optional[str]] = mapped_column(Text, default=None)
    educational_level: Mapped[int] = mapped_column(default=2)
    child_age: Mapped[int] = mapped_column(default=DEFAULT_CHILD_AGE)
    length_minutes: Mapped[int] = mapped_column(default=DEFAULT_LENGTH_MINUTES)
    language: Mapped[str] = mapped_column(String(2), default="en")
    is_torah_story: Mapped[bool] = mapped_column(default=False)
    source_reference: Mapped[Optional[str]] = mapped_column(String(255), default=None)
    is_favorite: Mapped[bool] = mapped_column(default=False)
    parent_story_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
    root_story_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("stories.id", ondelete="SET NULL"), default=None
    )
    chapter_number: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    user: Mapped[User] = relationship(back_populates="stories")
    recordings: Mapped[list["StoryRecording"]] = relationship(
        back_populates="story", cascade="all, delete-orphan"
    )
    narrations: Mapped[list["Narration"]] = relationship(back_populates="story", cascade="all, delete-orphan")


class GenerationLog(Base):
    """One row per Claude call. The daily quota counts these, so deleting stories does not reset it."""

    __tablename__ = "generation_log"
    __table_args__ = (Index("ix_generation_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    units: Mapped[int] = mapped_column(default=1)  # 1, 2 or 3 (a longer story uses more)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)


class StoryRecording(Base):
    """A person reading a story aloud. The audio file is on disk (see services/recording_store.py)."""

    __tablename__ = "story_recordings"

    id: Mapped[int] = mapped_column(primary_key=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))  # whose voice, for example "Mom"
    file_name: Mapped[str] = mapped_column(String(100))  # made by the server, never from the user
    size_bytes: Mapped[int] = mapped_column(default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    # When the speaker agreed, and which consent text they saw. Set by the upload code, only after consent.
    consent_at: Mapped[datetime] = mapped_column(UTCDateTime)
    consent_text_version: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    story: Mapped[Story] = relationship(back_populates="recordings")


class Voice(Base):
    """A voice that can be cloned: a short recording (the sample) of someone who agreed."""

    __tablename__ = "voices"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))  # whose voice, for example "Mom"
    language: Mapped[str] = mapped_column(String(2), default="en")
    file_name: Mapped[str] = mapped_column(String(100))  # the sample, in the "voices" folder
    size_bytes: Mapped[int] = mapped_column(default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    consent_at: Mapped[datetime] = mapped_column(UTCDateTime)
    consent_text_version: Mapped[str] = mapped_column(String(20))
    sample_sha256: Mapped[str] = mapped_column(String(64), index=True)  # the same file cannot be used twice
    uploaded_from: Mapped[Optional[str]] = mapped_column(String(45), default=None)  # network address, for an audit
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)

    narrations: Mapped[list["Narration"]] = relationship(back_populates="voice", cascade="all, delete-orphan")


class Narration(Base):
    """A story read aloud by a cloned voice. It is made in the background and can take minutes."""

    __tablename__ = "narrations"
    __table_args__ = (
        Index("ix_narrations_user_created", "user_id", "created_at"),
        UniqueConstraint("story_id", "voice_id", name="uq_narration_story_voice"),  # one audio per story and voice
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    story_id: Mapped[int] = mapped_column(ForeignKey("stories.id", ondelete="CASCADE"), index=True)
    voice_id: Mapped[int] = mapped_column(ForeignKey("voices.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    voice_name: Mapped[str] = mapped_column(String(60))  # copied, so the answer never needs a second lookup
    status: Mapped[str] = mapped_column(String(10), default="queued")  # queued, running, done, failed
    progress_done: Mapped[int] = mapped_column(default=0)  # pieces of text finished
    progress_total: Mapped[int] = mapped_column(default=0)
    file_name: Mapped[Optional[str]] = mapped_column(String(100), default=None)
    size_bytes: Mapped[int] = mapped_column(default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[Optional[str]] = mapped_column(String(200), default=None)  # a message that is safe to show
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
    finished_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime, default=None)

    story: Mapped[Story] = relationship(back_populates="narrations")
    voice: Mapped[Voice] = relationship(back_populates="narrations")


class NarrationLog(Base):
    """One row for every audio a user started. The daily limit counts these, so deleting the audio (or a
    failed try) does not give the day back. Only a try that failed before any work was done is refunded."""

    __tablename__ = "narration_log"
    __table_args__ = (Index("ix_narration_log_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    narration_id: Mapped[int] = mapped_column(default=0)  # not a foreign key: the log outlives the audio
    refunded: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=_now)
