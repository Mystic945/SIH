"""
Live ETA engine.

The Express API can compute a rough ETA from static constants; this service
replaces those constants with *measured* stage durations pulled from the last
week of stageHistory data, spread across the number of counters a centre has
actually opened today.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from bson import ObjectId

from app.database import Collections, get_db
from app.services.analytics import PIPELINE_STAGES, oid, stage_durations, today_str

IN_SERVICE = {"ARRIVED", "QUALITY_CHECK", "WEIGHMENT", "PAYMENT_INITIATED"}


def _remaining_minutes(stage: str, durations: dict[str, float]) -> float:
    """Work still owed to a token: its current stage plus every later stage."""
    if stage not in PIPELINE_STAGES:
        return 0.0
    idx = PIPELINE_STAGES.index(stage)
    return sum(durations.get(s, 0.0) for s in PIPELINE_STAGES[idx:-1])


def _sort_key(booking: dict) -> tuple:
    return (
        0 if booking.get("priority") else 1,
        0 if booking.get("stage") in IN_SERVICE else 1,
        booking.get("slotStart", "23:59"),
        booking.get("tokenNumber", 9999),
    )


async def compute_center_eta(center_id: str, date: str | None = None) -> dict:
    db = get_db()
    cid: ObjectId = oid(center_id)
    date = date or today_str()

    center = await db[Collections.centers].find_one({"_id": cid})
    if center is None:
        raise LookupError("Procurement centre not found")

    durations_raw = await stage_durations(cid, days=7)
    durations = {d["stage"]: d["avg_minutes"] for d in durations_raw}
    total_samples = sum(d["samples"] for d in durations_raw)

    bookings = (
        await db[Collections.bookings]
        .find({"center": cid, "slotDate": date, "stage": {"$nin": ["PAID", "CANCELLED", "NO_SHOW"]}})
        .to_list(length=None)
    )

    farmer_ids = [b["farmer"] for b in bookings if b.get("farmer")]
    farmers = (
        await db[Collections.farmers]
        .find({"_id": {"$in": farmer_ids}}, {"name": 1})
        .to_list(length=None)
    )
    names = {f["_id"]: f.get("name") for f in farmers}

    bookings.sort(key=_sort_key)
    counters = max(int(center.get("activeCounters") or 1), 1)

    # Confidence reflects how much real history the model had to learn from.
    if total_samples >= 200:
        confidence = "high"
    elif total_samples >= 40:
        confidence = "medium"
    else:
        confidence = "low"

    now = datetime.now()
    tokens: list[dict] = []
    cumulative = 0.0

    for index, booking in enumerate(bookings):
        eta_minutes = max(int(round(cumulative / counters)), 0)
        cumulative += _remaining_minutes(booking.get("stage", "BOOKED"), durations)
        tokens.append(
            {
                "booking_id": str(booking["_id"]),
                "token_code": booking.get("tokenCode", ""),
                "farmer_name": names.get(booking.get("farmer")),
                "stage": booking.get("stage", "BOOKED"),
                "position": index + 1,
                "ahead": index,
                "eta_minutes": eta_minutes,
                "eta_at": (now + timedelta(minutes=eta_minutes)).strftime("%H:%M"),
                "confidence": confidence,
            }
        )

    served_count = await db[Collections.bookings].count_documents(
        {"center": cid, "slotDate": date, "stage": "PAID"}
    )
    open_hour = int(str(center.get("openTime", "08:00")).split(":")[0])
    hours_open = max(now.hour - open_hour, 1)

    return {
        "center_id": center_id,
        "center_name": center.get("name", ""),
        "date": date,
        "active_counters": counters,
        "model": (
            f"measured stage durations over the last 7 days "
            f"({total_samples} transitions), divided across {counters} counters"
        ),
        "stage_durations": durations_raw,
        "served_per_hour": round(served_count / hours_open, 2),
        "tokens": tokens,
    }


async def eta_for_booking(booking_id: str) -> dict:
    """Single-token view used by the farmer's live tracker."""
    db = get_db()
    booking = await db[Collections.bookings].find_one({"_id": oid(booking_id)})
    if booking is None:
        raise LookupError("Token not found")

    snapshot = await compute_center_eta(str(booking["center"]), booking["slotDate"])
    match = next((t for t in snapshot["tokens"] if t["booking_id"] == booking_id), None)

    return {
        "center_id": snapshot["center_id"],
        "center_name": snapshot["center_name"],
        "date": snapshot["date"],
        "total_in_queue": len(snapshot["tokens"]),
        "served_per_hour": snapshot["served_per_hour"],
        "token": match,
    }
