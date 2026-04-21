"""Authentication utilities: JWT tokens and password hashing.

Uses short-lived access tokens (30 minutes) for the demo.
No refresh tokens — users must re-login after expiry.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Annotated

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.models.user import User, get_user_db

# ── Config ─────────────────────────────────────────────────────────────

SECRET_KEY = os.environ.get("PRIVATEAI_SECRET_KEY")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "PRIVATEAI_SECRET_KEY must be set to a random string of at least 32 characters"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

# ── Password hashing ─────────────────────────────────────────────────────


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


# ── JWT ──────────────────────────────────────────────────────────────────

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def create_access_token(user_id: str) -> str:
    """Create a short-lived JWT for the given user."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": user_id, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    """FastAPI dependency: extract and validate the current user from a JWT.

    Use this on any endpoint that requires authentication:
        @router.get("/protected")
        async def protected(user: User = Depends(get_current_user)):
            ...
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = get_user_db().get_by_id(user_id)
    if user is None:
        raise credentials_exception
    return user


async def get_current_user_optional(
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User | None:
    """Like get_current_user but returns None instead of 401.

    Useful for endpoints that work for both anonymous and authenticated users.
    """
    if not token:
        return None
    try:
        return await get_current_user(token)
    except HTTPException:
        return None
