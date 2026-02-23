from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, ValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
DEFAULT_ENV_FILE = ROOT_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(DEFAULT_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    artifacts_dir: Path = Field(default=ROOT_DIR / "storage/artifacts", alias="ARTIFACTS_DIR")
    bot_loop_interval_seconds: float = Field(default=5.0, alias="BOT_LOOP_INTERVAL_SECONDS")
    paper_starting_cash: float = Field(default=10000.0, alias="PAPER_STARTING_CASH")

    @property
    def sync_database_url(self) -> str:
        normalized = self.database_url
        if normalized.startswith("postgres://"):
            normalized = normalized.replace("postgres://", "postgresql://", 1)
        return normalized

    @property
    def async_database_url(self) -> str:
        normalized = self.sync_database_url
        if normalized.startswith("postgresql+asyncpg://"):
            return normalized

        if normalized.startswith("postgresql+psycopg://"):
            return normalized.replace("postgresql+psycopg://", "postgresql+asyncpg://", 1)

        if normalized.startswith("postgresql://"):
            return normalized.replace("postgresql://", "postgresql+asyncpg://", 1)

        return normalized


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    try:
        return Settings()
    except ValidationError as exc:
        missing_aliases = []
        for error in exc.errors():
            if error.get("type") != "missing":
                continue
            loc = error.get("loc", [])
            field_name = loc[0] if loc else ""
            alias = {
                "database_url": "DATABASE_URL",
                "redis_url": "REDIS_URL",
            }.get(str(field_name), str(field_name).upper())
            missing_aliases.append(alias)

        if missing_aliases:
            env_path = str(DEFAULT_ENV_FILE)
            raise RuntimeError(
                "Missing required environment variables: "
                f"{', '.join(sorted(set(missing_aliases)))}. "
                f"Set them in OS env or in {env_path}."
            ) from exc

        raise RuntimeError(f"Invalid environment configuration: {exc}") from exc
