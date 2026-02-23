from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine, pool

ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from packages.core.models import Base
from packages.core.settings import get_settings

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


target_metadata = Base.metadata


def _database_url() -> str:
    try:
        url = get_settings().sync_database_url
    except RuntimeError as exc:
        raise RuntimeError(f"Alembic configuration error: {exc}") from exc

    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    return url


def _sync_alembic_config_url_from_env() -> str:
    """
    Keep alembic.ini interpolation (%(DATABASE_URL)s) aligned with runtime env.
    """
    database_url = _database_url()
    escaped = database_url.replace("%", "%%")
    config.set_main_option("DATABASE_URL", escaped)
    config.set_main_option("sqlalchemy.url", escaped)
    return database_url


def run_migrations_offline() -> None:
    database_url = _sync_alembic_config_url_from_env()
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    database_url = _sync_alembic_config_url_from_env()
    connectable = create_engine(database_url, poolclass=pool.NullPool)

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
