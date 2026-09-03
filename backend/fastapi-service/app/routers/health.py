"""Liveness probe. Express calls this to report dual-backend status on /health."""
from datetime import datetime

from fastapi import APIRouter

from app.config import settings
from app.database import ping
from app.models.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health():
    mongo_ok = await ping()
    return {
        "service": "agriqueue-fastapi-intel",
        "status": "ok" if mongo_ok else "degraded",
        "mongo": mongo_ok,
        "database": settings.mongo_db_name,
        "environment": settings.environment,
        "timestamp": datetime.now(),
    }
