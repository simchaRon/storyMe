from pydantic import field_validator
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

    @field_validator("jwt_secret")
    @classmethod
    def _secret_not_empty(cls, v: str) -> str:
        if len(v.strip()) < 32:
            raise ValueError("JWT_SECRET must be set and at least 32 characters long")
        return v


settings = Settings()
