from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Index, String, Text
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
