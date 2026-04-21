"""User model and database operations for the hosted demo.

Uses SQLite for simplicity. Passwords are hashed with bcrypt.
The server never stores cloud credentials or SSH private keys.
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from datetime import datetime
from typing import Self

from pydantic import BaseModel, Field


DB_PATH = os.environ.get("PRIVATEAI_DB_PATH", "/tmp/privateai_users.db")


class User(BaseModel):
    """A PrivateAI user account."""

    id: str
    username: str
    password_hash: str = Field(..., exclude=True)  # Never serialized
    created_at: datetime


class UserCreate(BaseModel):
    """Registration request."""

    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)


class UserResponse(BaseModel):
    """Public user info."""

    id: str
    username: str
    created_at: datetime


class UserInDB:
    """Low-level SQLite operations for user storage."""

    def __init__(self) -> None:
        self._ensure_table()

    def _connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _ensure_table(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def create(self, username: str, password_hash: str) -> User:
        user_id = str(uuid.uuid4())
        created_at = datetime.utcnow().isoformat()
        with self._connection() as conn:
            try:
                conn.execute(
                    "INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
                    (user_id, username, password_hash, created_at),
                )
                conn.commit()
            except sqlite3.IntegrityError:
                raise ValueError(f"Username '{username}' already exists")
        return User(
            id=user_id,
            username=username,
            password_hash=password_hash,
            created_at=datetime.fromisoformat(created_at),
        )

    def get_by_username(self, username: str) -> User | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE username = ?",
                (username,),
            ).fetchone()
        if not row:
            return None
        return User(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def get_by_id(self, user_id: str) -> User | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT id, username, password_hash, created_at FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
        if not row:
            return None
        return User(
            id=row["id"],
            username=row["username"],
            password_hash=row["password_hash"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )


# Module-level singleton
_user_db: UserInDB | None = None


def get_user_db() -> UserInDB:
    global _user_db
    if _user_db is None:
        _user_db = UserInDB()
    return _user_db
