"""Authentication endpoints: register, login, and current user.

Passwords are hashed with bcrypt. JWTs are short-lived (30 min).
The server never stores cloud credentials or SSH keys.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel

from app.models.user import UserCreate, UserResponse, get_user_db
from app.utils.auth import create_access_token, get_current_user, get_password_hash, verify_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds


class RegisterResponse(BaseModel):
    user: UserResponse
    message: str


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(request: UserCreate):
    """Create a new user account."""
    db = get_user_db()
    password_hash = get_password_hash(request.password)
    try:
        user = db.create(request.username, password_hash)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(e),
        )
    return RegisterResponse(
        user=UserResponse(id=user.id, username=user.username, created_at=user.created_at),
        message="Account created successfully",
    )


@router.post("/login", response_model=TokenResponse)
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    """Authenticate and return a short-lived JWT.

    Use the returned `access_token` in the `Authorization: Bearer <token>`
    header for all subsequent protected requests.
    """
    db = get_user_db()
    user = db.get_by_username(form_data.username)
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = create_access_token(user.id)
    from app.utils.auth import ACCESS_TOKEN_EXPIRE_MINUTES
    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


@router.get("/me", response_model=UserResponse)
async def me(user=Depends(get_current_user)):
    """Return the currently authenticated user's public info."""
    return UserResponse(id=user.id, username=user.username, created_at=user.created_at)
