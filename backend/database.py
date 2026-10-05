"""Database connection setup: engine, session factory and the get_db dependency."""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

# Load backend/.env explicitly so this works no matter which folder uvicorn is started from.
load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set. Add it to backend/.env.")

url = make_url(DATABASE_URL)
# SQLAlchemy 2.1 maps a bare postgresql:// URL to psycopg (v3); we have psycopg2 installed.
if url.drivername in ("postgres", "postgresql"):
    url = url.set(drivername="postgresql+psycopg2")

# pool_pre_ping replaces connections the Supabase pooler has closed while idle.
engine = create_engine(url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI dependency: one session per request, always closed afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
