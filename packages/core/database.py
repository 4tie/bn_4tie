from __future__ import annotations

from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from packages.core.settings import get_settings

settings = get_settings()

sync_engine = create_engine(settings.database_url, pool_pre_ping=True, future=True)
async_engine = create_async_engine(settings.async_database_url, pool_pre_ping=True, future=True)

SessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False, expire_on_commit=False)
AsyncSessionLocal = async_sessionmaker(bind=async_engine, autoflush=False, expire_on_commit=False)


def get_sync_session() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session
