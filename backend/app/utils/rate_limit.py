"""Simple in-memory rate limiter for auth endpoints.

Uses a sliding window per IP address. In production, replace with Redis.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from threading import Lock
from typing import Callable

from fastapi import HTTPException, Request, status


@dataclass
class _Bucket:
    requests: list[float] = field(default_factory=list)
    lock: Lock = field(default_factory=Lock)


class RateLimiter:
    """Sliding-window rate limiter.

    Args:
        max_requests: Maximum number of requests allowed per window.
        window_seconds: Size of the sliding window in seconds.
    """

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._buckets: dict[str, _Bucket] = {}
        self._buckets_lock = Lock()

    def _get_client_ip(self, request: Request) -> str:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _clean(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self.window_seconds
        with bucket.lock:
            bucket.requests = [t for t in bucket.requests if t > cutoff]

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        with self._buckets_lock:
            bucket = self._buckets.setdefault(key, _Bucket())
        self._clean(bucket, now)
        with bucket.lock:
            if len(bucket.requests) >= self.max_requests:
                return False
            bucket.requests.append(now)
            return True

    def __call__(self, request: Request) -> None:
        ip = self._get_client_ip(request)
        if not self.is_allowed(ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(self.window_seconds)},
            )


def rate_limit(max_requests: int = 5, window_seconds: int = 300) -> Callable:
    """Factory that returns a FastAPI dependency for rate limiting.

    Usage:
        @router.post("/login")
        async def login(..., _rate=Depends(rate_limit())):
            ...
    """
    limiter = RateLimiter(max_requests=max_requests, window_seconds=window_seconds)
    return limiter
