from datetime import datetime
from typing import Annotated, Literal, Optional

from .textclean import clean_free_text, strip_invisible
from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

Lang = Literal["en", "he"]
Theme = Literal["dark", "light"]
Level = Annotated[int, Field(ge=1, le=5)]
ChildAge = Annotated[int, Field(ge=1, le=14)]
LengthMinutes = Annotated[int, Field(ge=1, le=10)]


def _clean_keywords(items: list[str]) -> list[str]:
    cleaned = []
    for item in items:
        # Control characters (new lines, tabs, bells) are rejected, not silently removed.
        if any(ord(c) < 32 or ord(c) == 127 for c in item):
            raise ValueError("keywords cannot contain control characters or new lines")
        item = strip_invisible(item).strip()  # hidden characters and direction marks are removed
        if not 1 <= len(item) <= 40:
            raise ValueError("each keyword must be 1-40 characters")
        if "<" in item or ">" in item:
            raise ValueError("keywords cannot contain < or >")
        cleaned.append(item)
    return cleaned


# ---- Auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    preferred_language: Lang = "en"

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("password is too long (max 72 bytes)")
        return v


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def _bcrypt_limit(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("password is too long (max 72 bytes)")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=72)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    preferred_language: Lang
    created_at: datetime


# ---- Settings ----
class SettingsOut(BaseModel):
    theme: Theme
    default_educational_level: Level
    voice_enabled: bool
    preferred_language: Lang


class SettingsUpdate(BaseModel):
    theme: Optional[Theme] = None
    default_educational_level: Optional[Level] = None
    voice_enabled: Optional[bool] = None
    preferred_language: Optional[Lang] = None


# ---- Stories ----
Keywords = Annotated[list[str], AfterValidator(_clean_keywords)]

MAX_PROMPT_LENGTH = 800


Prompt = Annotated[str, Field(max_length=MAX_PROMPT_LENGTH), AfterValidator(clean_free_text)]


class StoryGenerateIn(BaseModel):
    keywords: Keywords = Field(default_factory=list, max_length=10)
    prompt: Optional[Prompt] = None  # the story idea in the user's own words (free text)
    educational_level: Optional[Level] = None
    child_age: Optional[ChildAge] = None  # the app sends 6 by default
    length_minutes: Optional[LengthMinutes] = None  # about how long the story takes to tell aloud
    language: Optional[Lang] = None
    is_torah_story: bool = False

    @model_validator(mode="after")
    def _need_an_idea(self):
        if not self.keywords and not self.prompt:
            raise ValueError("give at least one keyword or a description")
        return self


class SequelIn(BaseModel):
    parent_story_id: int
    keywords: Keywords = Field(default_factory=list, max_length=10)


class FavoriteIn(BaseModel):
    is_favorite: bool


class StorySummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    keywords: list[str]
    educational_level: int
    child_age: int
    length_minutes: int
    language: Lang
    is_torah_story: bool
    is_favorite: bool
    parent_story_id: Optional[int]
    root_story_id: Optional[int]
    chapter_number: int
    created_at: datetime


class StoryOut(StorySummaryOut):
    content: str
    prompt: Optional[str]
    source_reference: Optional[str]


# ---- Recordings ----
class RecordingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    story_id: int
    name: str
    duration_seconds: float
    size_bytes: int
    created_at: datetime


class RecordingUrlOut(BaseModel):
    url: str  # path with a short-lived signature. Add the server address in front of it.
    expires_in: int  # seconds


# ---- Voice cloning ----
class VoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    language: Lang
    duration_seconds: float
    created_at: datetime


class VoiceCapabilities(BaseModel):
    enabled: bool  # false when no voice worker is set up
    languages: list[Lang]  # languages a cloned voice can read
    min_sample_seconds: int
    max_sample_seconds: int


class NarrationCreate(BaseModel):
    voice_id: int


class NarrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    story_id: int
    voice_id: int
    voice_name: str
    status: Literal["queued", "running", "done", "failed"]
    progress_done: int
    progress_total: int
    duration_seconds: float
    error: Optional[str]
    created_at: datetime
    finished_at: Optional[datetime]
