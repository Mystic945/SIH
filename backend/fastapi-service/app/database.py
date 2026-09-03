"""Async MongoDB access. Shares the exact database the Express API writes to."""
import logging

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

logger = logging.getLogger("agriqueue.db")

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


async def connect_to_mongo() -> None:
    global _client, _db
    _client = AsyncIOMotorClient(settings.mongo_uri, serverSelectionTimeoutMS=15000)
    _db = _client[settings.mongo_db_name]
    await _client.admin.command("ping")
    logger.info("Connected to MongoDB database '%s'", settings.mongo_db_name)


async def close_mongo_connection() -> None:
    global _client
    if _client is not None:
        _client.close()
        logger.info("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialised. Did the app lifespan run?")
    return _db


async def ping() -> bool:
    try:
        await get_db().command("ping")
        return True
    except Exception:  # noqa: BLE001 - health probe must never raise
        return False


# Mongoose pluralises model names, so these are the collection names it creates.
class Collections:
    centers = "centers"
    farmers = "farmers"
    bookings = "bookings"
    schedules = "schedules"
    grievances = "grievances"
    notifications = "notifications"
    staff = "staffusers"
