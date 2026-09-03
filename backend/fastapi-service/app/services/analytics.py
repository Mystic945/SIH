"""
Aggregation helpers over the shared procurement database.

Everything here is read-only: the Express API owns writes to bookings, so this
service can be scaled, restarted or taken offline without risking data loss.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from statistics import mean

from bson import ObjectId

from app.database import Collections, get_db

ACTIVE_STAGES = ["BOOKED", "ARRIVED", "QUALITY_CHECK", "WEIGHMENT", "PAYMENT_INITIATED"]
PIPELINE_STAGES = ["BOOKED", "ARRIVED", "QUALITY_CHECK", "WEIGHMENT", "PAYMENT_INITIATED", "PAID"]


def today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"'{value}' is not a valid id") from exc


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(int(round((pct / 100) * (len(ordered) - 1))), len(ordered) - 1)
    return ordered[index]


async def stage_durations(center_id: ObjectId | None = None, days: int = 7) -> list[dict]:
    """
    Measures how long each pipeline step actually takes, from stageHistory
    timestamps. This is what makes the ETA data-driven rather than a guess.
    """
    db = get_db()
    since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    query: dict = {"slotDate": {"$gte": since}, "stageHistory.4": {"$exists": True}}
    if center_id is not None:
        query["center"] = center_id

    cursor = db[Collections.bookings].find(query, {"stageHistory": 1}).limit(3000)

    buckets: dict[str, list[float]] = {s: [] for s in PIPELINE_STAGES[:-1]}
    async for doc in cursor:
        history = doc.get("stageHistory") or []
        for current, nxt in zip(history, history[1:]):
            stage = current.get("stage")
            if stage not in buckets:
                continue
            start, end = current.get("at"), nxt.get("at")
            if not isinstance(start, datetime) or not isinstance(end, datetime):
                continue
            minutes = (end - start).total_seconds() / 60
            # Discard overnight gaps and clock glitches.
            if 0 < minutes < 180:
                buckets[stage].append(minutes)

    # Sensible fallbacks so a fresh database still produces usable ETAs.
    defaults = {
        "BOOKED": 0.0,
        "ARRIVED": 4.0,
        "QUALITY_CHECK": 8.0,
        "WEIGHMENT": 6.0,
        "PAYMENT_INITIATED": 5.0,
    }

    result = []
    for stage in PIPELINE_STAGES[:-1]:
        samples = buckets.get(stage, [])
        result.append(
            {
                "stage": stage,
                "avg_minutes": round(mean(samples), 1) if samples else defaults[stage],
                "p90_minutes": round(percentile(samples, 90), 1) if samples else defaults[stage] * 1.6,
                "samples": len(samples),
            }
        )
    return result


async def center_funnel(center_id: ObjectId, date: str) -> dict[str, int]:
    db = get_db()
    pipeline = [
        {"$match": {"center": center_id, "slotDate": date}},
        {"$group": {"_id": "$stage", "count": {"$sum": 1}}},
    ]
    rows = await db[Collections.bookings].aggregate(pipeline).to_list(length=None)
    funnel = {stage: 0 for stage in PIPELINE_STAGES + ["CANCELLED", "NO_SHOW"]}
    for row in rows:
        funnel[row["_id"]] = row["count"]
    return funnel


async def hourly_load(center_id: ObjectId, date: str) -> list[dict]:
    """Booked-vs-served split by slot hour — shows where congestion builds up."""
    db = get_db()
    pipeline = [
        {"$match": {"center": center_id, "slotDate": date, "stage": {"$ne": "CANCELLED"}}},
        {
            "$group": {
                "_id": {"$substr": ["$slotStart", 0, 2]},
                "booked": {"$sum": 1},
                "served": {"$sum": {"$cond": [{"$eq": ["$stage", "PAID"]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await db[Collections.bookings].aggregate(pipeline).to_list(length=None)
    return [
        {"hour": f"{row['_id']}:00", "booked": row["booked"], "served": row["served"]}
        for row in rows
    ]


async def turnaround_stats(center_id: ObjectId | None, date_from: str, date_to: str) -> dict:
    """Average arrival→payment minutes, plus how long farmers waited before check-in."""
    db = get_db()
    match: dict = {
        "slotDate": {"$gte": date_from, "$lte": date_to},
        "arrivedAt": {"$ne": None},
        "completedAt": {"$ne": None},
    }
    if center_id is not None:
        match["center"] = center_id

    pipeline = [
        {"$match": match},
        {
            "$project": {
                "turnaround": {
                    "$divide": [{"$subtract": ["$completedAt", "$arrivedAt"]}, 60000]
                }
            }
        },
        {
            "$group": {
                "_id": None,
                "avg": {"$avg": "$turnaround"},
                "max": {"$max": "$turnaround"},
                "count": {"$sum": 1},
            }
        },
    ]
    rows = await db[Collections.bookings].aggregate(pipeline).to_list(length=1)
    if not rows:
        return {"avg_turnaround_minutes": 0.0, "max_turnaround_minutes": 0.0, "samples": 0}
    row = rows[0]
    return {
        "avg_turnaround_minutes": round(row.get("avg") or 0, 1),
        "max_turnaround_minutes": round(row.get("max") or 0, 1),
        "samples": row.get("count", 0),
    }


async def procurement_totals(match: dict) -> dict:
    db = get_db()
    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": None,
                "tokens": {"$sum": 1},
                "served": {"$sum": {"$cond": [{"$eq": ["$stage", "PAID"]}, 1, 0]}},
                "quintals": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$stage", "PAID"]},
                            {"$ifNull": ["$weighment.netQuintals", "$quantityQuintals"]},
                            0,
                        ]
                    }
                },
                "amount": {
                    "$sum": {
                        "$cond": [{"$eq": ["$payment.status", "PAID"]}, "$payment.amount", 0]
                    }
                },
                "no_shows": {"$sum": {"$cond": [{"$eq": ["$stage", "NO_SHOW"]}, 1, 0]}},
            }
        },
    ]
    rows = await db[Collections.bookings].aggregate(pipeline).to_list(length=1)
    if not rows:
        return {"tokens": 0, "served": 0, "quintals": 0.0, "amount": 0.0, "no_shows": 0}
    row = rows[0]
    row.pop("_id", None)
    row["quintals"] = round(row.get("quintals", 0), 2)
    row["amount"] = round(row.get("amount", 0), 2)
    return row


async def daily_series(center_id: ObjectId | None, days: int = 14) -> list[dict]:
    db = get_db()
    start = (datetime.now() - timedelta(days=days - 1)).strftime("%Y-%m-%d")
    end = today_str()

    match: dict = {"slotDate": {"$gte": start, "$lte": end}}
    if center_id is not None:
        match["center"] = center_id

    pipeline = [
        {"$match": match},
        {
            "$group": {
                "_id": "$slotDate",
                "booked": {"$sum": 1},
                "served": {"$sum": {"$cond": [{"$eq": ["$stage", "PAID"]}, 1, 0]}},
                "quintals": {
                    "$sum": {
                        "$cond": [
                            {"$eq": ["$stage", "PAID"]},
                            {"$ifNull": ["$weighment.netQuintals", 0]},
                            0,
                        ]
                    }
                },
                "amount": {
                    "$sum": {"$cond": [{"$eq": ["$payment.status", "PAID"]}, "$payment.amount", 0]}
                },
                "turnaround": {
                    "$avg": {
                        "$cond": [
                            {"$and": [{"$ne": ["$arrivedAt", None]}, {"$ne": ["$completedAt", None]}]},
                            {"$divide": [{"$subtract": ["$completedAt", "$arrivedAt"]}, 60000]},
                            None,
                        ]
                    }
                },
            }
        },
        {"$sort": {"_id": 1}},
    ]
    rows = await db[Collections.bookings].aggregate(pipeline).to_list(length=None)
    return [
        {
            "date": row["_id"],
            "booked": row["booked"],
            "served": row["served"],
            "quintals": round(row.get("quintals") or 0, 2),
            "amount": round(row.get("amount") or 0, 2),
            "avg_turnaround_minutes": round(row.get("turnaround") or 0, 1),
        }
        for row in rows
    ]
