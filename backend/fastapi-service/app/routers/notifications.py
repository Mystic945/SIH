"""
Bulk notification dispatch.

Express sends the transactional one-to-one messages; this service handles the
fan-out cases (advisories to everyone booked tomorrow, "centre closed today"
alerts) where a batch job is the right shape. Both write into the same
`notifications` collection, tagged with `dispatchedBy` so the admin outbox can
show which service sent what.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from app.database import Collections, get_db
from app.models.schemas import BroadcastRequest, BroadcastResponse
from app.security import require_internal_key
from app.services.analytics import oid, today_str

router = APIRouter(prefix="/admin/notify", tags=["notifications"])


@router.post("/broadcast", response_model=BroadcastResponse)
async def broadcast(payload: BroadcastRequest, _: None = Depends(require_internal_key)):
    """Sends one advisory to every farmer matching a centre + date + stage filter."""
    db = get_db()
    try:
        cid = oid(payload.center_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    center = await db[Collections.centers].find_one({"_id": cid})
    if center is None:
        raise HTTPException(status_code=404, detail="Procurement centre not found")

    date = payload.date or today_str()
    bookings = (
        await db[Collections.bookings]
        .find({"center": cid, "slotDate": date, "stage": {"$in": payload.stages}})
        .to_list(length=None)
    )

    if not bookings:
        return {
            "center_id": payload.center_id,
            "matched": 0,
            "dispatched": 0,
            "dry_run": payload.dry_run,
            "sample": [],
        }

    farmer_ids = [b["farmer"] for b in bookings]
    farmers = (
        await db[Collections.farmers]
        .find({"_id": {"$in": farmer_ids}}, {"phone": 1, "preferredLanguage": 1, "name": 1})
        .to_list(length=None)
    )
    farmer_map = {f["_id"]: f for f in farmers}

    documents = []
    now = datetime.now()
    for booking in bookings:
        farmer = farmer_map.get(booking["farmer"])
        if not farmer:
            continue
        lang = farmer.get("preferredLanguage", "hi")
        body = payload.message_hi if lang == "hi" else payload.message_en
        message = body.replace("{token}", booking.get("tokenCode", "")).replace(
            "{center}", center.get("name", "")
        )
        documents.append(
            {
                "farmer": farmer["_id"],
                "booking": booking["_id"],
                "phone": farmer.get("phone", ""),
                "channel": payload.channel,
                "template": "BROADCAST",
                "message": message,
                "lang": lang,
                "status": "SENT",
                "provider": "MOCK",
                "dispatchedBy": "fastapi",
                "sentAt": now,
                "meta": {"date": date, "stages": payload.stages},
                "createdAt": now,
                "updatedAt": now,
            }
        )

    dispatched = 0
    if documents and not payload.dry_run:
        result = await db[Collections.notifications].insert_many(documents)
        dispatched = len(result.inserted_ids)

    return {
        "center_id": payload.center_id,
        "matched": len(bookings),
        "dispatched": dispatched,
        "dry_run": payload.dry_run,
        "sample": [
            {"phone": d["phone"], "lang": d["lang"], "message": d["message"]}
            for d in documents[:5]
        ],
    }


@router.get("/log")
async def notification_log(
    limit: int = Query(default=50, ge=1, le=200),
    dispatched_by: str | None = Query(default=None, pattern="^(express|fastapi)$"),
    _: None = Depends(require_internal_key),
):
    """Recent outbox entries, with a per-service breakdown."""
    db = get_db()
    query: dict = {}
    if dispatched_by:
        query["dispatchedBy"] = dispatched_by

    rows = (
        await db[Collections.notifications]
        .find(query)
        .sort("createdAt", -1)
        .limit(limit)
        .to_list(length=None)
    )

    breakdown = await db[Collections.notifications].aggregate([
        {"$group": {"_id": {"service": "$dispatchedBy", "channel": "$channel"}, "count": {"$sum": 1}}},
    ]).to_list(length=None)

    return {
        "count": len(rows),
        "breakdown": [
            {
                "service": b["_id"].get("service"),
                "channel": b["_id"].get("channel"),
                "count": b["count"],
            }
            for b in breakdown
        ],
        "items": [
            {
                "id": str(r["_id"]),
                "phone": r.get("phone"),
                "channel": r.get("channel"),
                "template": r.get("template"),
                "message": r.get("message"),
                "lang": r.get("lang"),
                "status": r.get("status"),
                "dispatched_by": r.get("dispatchedBy"),
                "sent_at": r.get("sentAt"),
            }
            for r in rows
        ],
    }
