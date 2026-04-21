"""Encrypted vault endpoints.

The server stores only opaque, client-side encrypted blobs.
It cannot decrypt them — the encryption key is derived from the user's
password and never leaves their browser.

This is a zero-knowledge design: a database breach reveals nothing usable.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime
from typing import Self

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.user import User, get_user_db
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/v1/vault", tags=["vault"])

DB_PATH = os.environ.get("PRIVATEAI_DB_PATH", "/tmp/privateai_users.db")


class VaultStoreRequest(BaseModel):
    """Store an encrypted blob.

    The `encrypted_blob` is an opaque string produced by the client
    (e.g. AES-256-GCM ciphertext + IV + salt, base64-encoded).
    The server cannot inspect its contents.
    """

    encrypted_blob: str


class VaultRetrieveResponse(BaseModel):
    encrypted_blob: str
    updated_at: datetime


class VaultEntry:
    """Low-level SQLite storage for encrypted vault blobs."""

    def __init__(self) -> None:
        self._ensure_table()

    def _connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _ensure_table(self) -> None:
        with self._connection() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS vaults (
                    user_id TEXT PRIMARY KEY,
                    encrypted_blob TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def store(self, user_id: str, encrypted_blob: str) -> None:
        updated_at = datetime.utcnow().isoformat()
        with self._connection() as conn:
            conn.execute(
                """
                INSERT INTO vaults (user_id, encrypted_blob, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    encrypted_blob = excluded.encrypted_blob,
                    updated_at = excluded.updated_at
                """,
                (user_id, encrypted_blob, updated_at),
            )
            conn.commit()

    def retrieve(self, user_id: str) -> dict | None:
        with self._connection() as conn:
            row = conn.execute(
                "SELECT encrypted_blob, updated_at FROM vaults WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "encrypted_blob": row["encrypted_blob"],
            "updated_at": datetime.fromisoformat(row["updated_at"]),
        }

    def delete(self, user_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM vaults WHERE user_id = ?", (user_id,))
            conn.commit()


_vault_db: VaultEntry | None = None


def get_vault_db() -> VaultEntry:
    global _vault_db
    if _vault_db is None:
        _vault_db = VaultEntry()
    return _vault_db


@router.post("/store")
async def vault_store(request: VaultStoreRequest, user: User = Depends(get_current_user)):
    """Store the user's encrypted credential vault.

    The server stores the blob verbatim. It cannot decrypt it.
    """
    get_vault_db().store(user.id, request.encrypted_blob)
    return {"success": True, "message": "Vault stored"}


@router.get("/retrieve", response_model=VaultRetrieveResponse)
async def vault_retrieve(user: User = Depends(get_current_user)):
    """Retrieve the user's encrypted credential vault.

    The client must decrypt the blob with their password-derived key.
    """
    entry = get_vault_db().retrieve(user.id)
    if not entry:
        raise HTTPException(status_code=404, detail="No vault found")
    return VaultRetrieveResponse(
        encrypted_blob=entry["encrypted_blob"],
        updated_at=entry["updated_at"],
    )


@router.delete("/delete")
async def vault_delete(user: User = Depends(get_current_user)):
    """Delete the user's vault permanently."""
    get_vault_db().delete(user.id)
    return {"success": True, "message": "Vault deleted"}
