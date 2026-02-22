import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set")

sync_engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=sync_engine)

ASYNC_DB_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://").replace("postgresql://", "postgresql+asyncpg://")
engine = create_async_engine(ASYNC_DB_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
