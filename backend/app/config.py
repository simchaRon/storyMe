from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dreamtale.db"
    jwt_secret: str
    jwt_expire_minutes: int = 10080
    anthropic_api_key: str = ""
    claude_model: str = "claude-sonnet-5-5"
    cors_origins: str = "http://localhost:8081,http://localhost:19006"
    daily_story_limit: int = 20
    # Voice recordings (a parent reads a story aloud). Files live on disk under media_dir.
    media_dir: str = "./media"
    max_recording_mb: int = 25  # one recording
    max_recordings_per_story: int = 5
    max_user_media_mb: int = 300  # all recordings of one user
    # Voice cloning (English). A separate "voice worker" makes the audio (see tools/tts-worker).
    tts_url: str = ""  # address of the worker. Empty = voice cloning is off
    tts_api_key: str = ""  # shared secret with the worker (optional on one computer)
    tts_timeout_seconds: int = 600  # for ONE piece of text. A slow computer needs a long time
    max_voices_per_user: int = 3
    max_voice_sample_mb: int = 10
    daily_narration_limit: int = 5  # audio versions a user can start per day
    max_narration_chars: int = 12000  # a longer story is refused (it would take too long)
    max_narration_pieces: int = 80  # pieces of text one audio can have
    narration_deadline_minutes: int = 60  # the whole job. A slow computer may need more
    max_worker_response_mb: int = 30  # one answer from the voice worker

    @field_validator("jwt_secret")
    @classmethod
    def _secret_not_empty(cls, v: str) -> str:
        if len(v.strip()) < 32:
            raise ValueError("JWT_SECRET must be set and at least 32 characters long")
        return v


    @model_validator(mode="after")
    def _worker_key_for_remote_worker(self):
        """A voice worker on another computer must have a key. On this computer (loopback) it is optional."""
        if self.tts_url and not self.tts_api_key:
            host = (urlparse(self.tts_url).hostname or "").lower()
            if host not in ("localhost", "127.0.0.1", "::1"):
                raise ValueError("TTS_API_KEY must be set when the voice worker is not on this computer")
        return self


settings = Settings()