from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    artifacts_dir: Path = Field(default=Path("storage/artifacts"), alias="ARTIFACTS_DIR")
    bot_loop_interval_seconds: float = Field(default=5.0, alias="BOT_LOOP_INTERVAL_SECONDS")
    paper_starting_cash: float = Field(default=10000.0, alias="PAPER_STARTING_CASH")

    @property
    def async_database_url(self) -> str:
        normalized = self.database_url
        if normalized.startswith("postgres://"):
            normalized = normalized.replace("postgres://", "postgresql://", 1)

        if normalized.startswith("postgresql+asyncpg://"):
            return normalized

        if normalized.startswith("postgresql://"):
            return normalized.replace("postgresql://", "postgresql+asyncpg://", 1)

        return normalized


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
