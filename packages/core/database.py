from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from packages.core.settings import get_settings


@lru_cache(maxsize=1)
def get_sync_engine():
    settings = get_settings()
    return create_engine(settings.sync_database_url, pool_pre_ping=True, future=True)


@lru_cache(maxsize=1)
def get_async_engine():
    settings = get_settings()
    return create_async_engine(settings.async_database_url, pool_pre_ping=True, future=True)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_sync_engine(), autoflush=False, autocommit=False, expire_on_commit=False)


@lru_cache(maxsize=1)
def get_async_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(bind=get_async_engine(), autoflush=False, expire_on_commit=False)


def SessionLocal() -> Session:
    """Backwards-compatible session constructor used by worker tasks."""
    return get_session_factory()()


def get_sync_session() -> Generator[Session, None, None]:
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_async_session_factory()() as session:
        yield session
