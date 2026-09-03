"""Shared-secret guard for endpoints that only Express should reach."""
from fastapi import Header, HTTPException, status

from app.config import settings


async def require_internal_key(x_internal_key: str | None = Header(default=None)) -> None:
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid or missing internal service key",
        )
