"""Transparency dashboard + reporting endpoints."""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.database import Collections, get_db
from app.models.schemas import (
    CenterAnalytics,
    OverviewResponse,
    ProcurementReport,
    TrendPoint,
)
from app.services import analytics as A

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/overview", response_model=OverviewResponse)
async def overview():
    """Nationwide snapshot that powers the public transparency dashboard."""
    db = get_db()
    date = A.today_str()

    totals_all = await A.procurement_totals({"stage": {"$ne": "CANCELLED"}})
    totals_today = await A.procurement_totals({"slotDate": date, "stage": {"$ne": "CANCELLED"}})
    turnaround = await A.turnaround_stats(
        None, (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d"), date
    )

    centers_count = await db[Collections.centers].count_documents({"isActive": True})
    farmers_count = await db[Collections.farmers].count_documents({})

    by_commodity = await db[Collections.bookings].aggregate([
        {"$match": {"stage": "PAID"}},
        {
            "$group": {
                "_id": "$commodity",
                "tokens": {"$sum": 1},
                "quintals": {"$sum": {"$ifNull": ["$weighment.netQuintals", "$quantityQuintals"]}},
                "amount": {"$sum": "$payment.amount"},
            }
        },
        {"$sort": {"quintals": -1}},
    ]).to_list(length=None)

    by_state = await db[Collections.bookings].aggregate([
        {"$match": {"stage": "PAID"}},
        {
            "$lookup": {
                "from": Collections.centers,
                "localField": "center",
                "foreignField": "_id",
                "as": "centre",
            }
        },
        {"$unwind": "$centre"},
        {
            "$group": {
                "_id": "$centre.state",
                "tokens": {"$sum": 1},
                "quintals": {"$sum": {"$ifNull": ["$weighment.netQuintals", "$quantityQuintals"]}},
                "amount": {"$sum": "$payment.amount"},
            }
        },
        {"$sort": {"amount": -1}},
    ]).to_list(length=None)

    top_centers = await db[Collections.bookings].aggregate([
        {"$match": {"slotDate": date, "stage": {"$ne": "CANCELLED"}}},
        {
            "$group": {
                "_id": "$center",
                "booked": {"$sum": 1},
                "served": {"$sum": {"$cond": [{"$eq": ["$stage", "PAID"]}, 1, 0]}},
            }
        },
        {
            "$lookup": {
                "from": Collections.centers,
                "localField": "_id",
                "foreignField": "_id",
                "as": "centre",
            }
        },
        {"$unwind": "$centre"},
        {
            "$project": {
                "_id": 0,
                "center_id": {"$toString": "$_id"},
                "name": "$centre.name",
                "code": "$centre.code",
                "district": "$centre.district",
                "state": "$centre.state",
                "booked": 1,
                "served": 1,
                "capacity": "$centre.dailyCapacity",
                "load_pct": {
                    "$round": [
                        {"$multiply": [{"$divide": ["$booked", "$centre.dailyCapacity"]}, 100]},
                        1,
                    ]
                },
            }
        },
        {"$sort": {"load_pct": -1}},
        {"$limit": 8},
    ]).to_list(length=None)

    grievance_rows = await db[Collections.grievances].aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]).to_list(length=None)
    grievances = {row["_id"]: row["count"] for row in grievance_rows}
    total_grievances = sum(grievances.values())
    resolved = grievances.get("RESOLVED", 0) + grievances.get("REJECTED", 0)

    return {
        "generated_at": datetime.now(),
        "date": date,
        "totals": {
            "centers": centers_count,
            "farmers": farmers_count,
            "tokens_all_time": totals_all["tokens"],
            "quintals_procured": totals_all["quintals"],
            "amount_disbursed": totals_all["amount"],
        },
        "today": {
            "tokens_booked": totals_today["tokens"],
            "tokens_served": totals_today["served"],
            "quintals": totals_today["quintals"],
            "amount": totals_today["amount"],
            "avg_turnaround_minutes": turnaround["avg_turnaround_minutes"],
        },
        "by_commodity": [
            {
                "commodity": row["_id"],
                "tokens": row["tokens"],
                "quintals": round(row["quintals"], 2),
                "amount": round(row["amount"] or 0, 2),
            }
            for row in by_commodity
        ],
        "by_state": [
            {
                "state": row["_id"],
                "tokens": row["tokens"],
                "quintals": round(row["quintals"], 2),
                "amount": round(row["amount"] or 0, 2),
            }
            for row in by_state
        ],
        "top_centers": top_centers,
        "grievances": {
            "total": total_grievances,
            "open": grievances.get("OPEN", 0),
            "in_review": grievances.get("IN_REVIEW", 0),
            "resolved": resolved,
            "resolution_rate_pct": round((resolved / total_grievances * 100), 1)
            if total_grievances
            else 0.0,
        },
    }


@router.get("/center/{center_id}", response_model=CenterAnalytics)
async def center_analytics(center_id: str, date: str | None = Query(default=None)):
    """Per-centre operational analytics: funnel, hourly load, stage timings."""
    db = get_db()
    try:
        cid = A.oid(center_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    center = await db[Collections.centers].find_one({"_id": cid})
    if center is None:
        raise HTTPException(status_code=404, detail="Procurement centre not found")

    date = date or A.today_str()

    funnel = await A.center_funnel(cid, date)
    hourly = await A.hourly_load(cid, date)
    durations = await A.stage_durations(cid, days=7)
    turnaround = await A.turnaround_stats(cid, date, date)
    totals = await A.procurement_totals({"center": cid, "slotDate": date})

    booked_total = sum(funnel.values())
    capacity = max(int(center.get("dailyCapacity", 120)), 1)
    served = funnel.get("PAID", 0)

    open_hour = int(str(center.get("openTime", "08:00")).split(":")[0])
    hours_elapsed = max(datetime.now().hour - open_hour, 1)

    # Waiting time = booking→arrival gap is not meaningful, so wait is measured as
    # arrival→first service step across the day's completed tokens.
    wait_rows = await db[Collections.bookings].aggregate([
        {"$match": {"center": cid, "slotDate": date, "arrivedAt": {"$ne": None}}},
        {"$project": {"history": "$stageHistory"}},
    ]).to_list(length=None)

    waits: list[float] = []
    for row in wait_rows:
        history = row.get("history") or []
        arrived = next((h for h in history if h.get("stage") == "ARRIVED"), None)
        checked = next((h for h in history if h.get("stage") == "QUALITY_CHECK"), None)
        if arrived and checked:
            minutes = (checked["at"] - arrived["at"]).total_seconds() / 60
            if 0 <= minutes < 300:
                waits.append(minutes)

    return {
        "center_id": center_id,
        "center_name": center.get("name", ""),
        "date": date,
        "funnel": funnel,
        "hourly_load": hourly,
        "stage_durations": durations,
        "avg_wait_minutes": round(sum(waits) / len(waits), 1) if waits else 0.0,
        "avg_turnaround_minutes": turnaround["avg_turnaround_minutes"],
        "throughput_per_hour": round(served / hours_elapsed, 2),
        "capacity_used_pct": round((booked_total / capacity) * 100, 1),
        "quintals_procured": totals["quintals"],
        "amount_disbursed": totals["amount"],
        "no_show_rate_pct": round((funnel.get("NO_SHOW", 0) / booked_total * 100), 1)
        if booked_total
        else 0.0,
    }


@router.get("/trends", response_model=list[TrendPoint])
async def trends(
    center_id: str | None = Query(default=None),
    days: int = Query(default=14, ge=2, le=90),
):
    """Daily series for the line charts on both dashboards."""
    cid = None
    if center_id:
        try:
            cid = A.oid(center_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await A.daily_series(cid, days)


@router.get("/report", response_model=ProcurementReport)
async def procurement_report(
    state: str | None = Query(default=None),
    district: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
):
    """
    Centre-wise procurement report. This is the endpoint a district officer or
    an RTI-style public dashboard would consume.
    """
    db = get_db()
    date_to = date_to or A.today_str()
    date_from = date_from or (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")

    center_filter: dict = {"isActive": True}
    if state:
        center_filter["state"] = state
    if district:
        center_filter["district"] = district

    centers = await db[Collections.centers].find(center_filter).to_list(length=None)
    center_ids = [c["_id"] for c in centers]

    stats = await db[Collections.bookings].aggregate([
        {
            "$match": {
                "center": {"$in": center_ids},
                "slotDate": {"$gte": date_from, "$lte": date_to},
            }
        },
        {
            "$group": {
                "_id": "$center",
                "tokens": {"$sum": 1},
                "served": {"$sum": {"$cond": [{"$eq": ["$stage", "PAID"]}, 1, 0]}},
                "no_shows": {"$sum": {"$cond": [{"$eq": ["$stage", "NO_SHOW"]}, 1, 0]}},
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
                    "$sum": {"$cond": [{"$eq": ["$payment.status", "PAID"]}, "$payment.amount", 0]}
                },
                "turnaround": {
                    "$avg": {
                        "$cond": [
                            {
                                "$and": [
                                    {"$ne": ["$arrivedAt", None]},
                                    {"$ne": ["$completedAt", None]},
                                ]
                            },
                            {"$divide": [{"$subtract": ["$completedAt", "$arrivedAt"]}, 60000]},
                            None,
                        ]
                    }
                },
            }
        },
    ]).to_list(length=None)
    stat_map = {s["_id"]: s for s in stats}

    grievance_rows = await db[Collections.grievances].aggregate([
        {"$match": {"center": {"$in": center_ids}, "status": {"$in": ["OPEN", "IN_REVIEW"]}}},
        {"$group": {"_id": "$center", "count": {"$sum": 1}}},
    ]).to_list(length=None)
    grievance_map = {g["_id"]: g["count"] for g in grievance_rows}

    rows = []
    for center in centers:
        stat = stat_map.get(center["_id"], {})
        tokens = stat.get("tokens", 0)
        rows.append(
            {
                "center_code": center.get("code", ""),
                "center_name": center.get("name", ""),
                "district": center.get("district", ""),
                "state": center.get("state", ""),
                "tokens_served": stat.get("served", 0),
                "quintals": round(stat.get("quintals", 0) or 0, 2),
                "amount": round(stat.get("amount", 0) or 0, 2),
                "avg_turnaround_minutes": round(stat.get("turnaround") or 0, 1),
                "no_show_rate_pct": round((stat.get("no_shows", 0) / tokens * 100), 1)
                if tokens
                else 0.0,
                "open_grievances": grievance_map.get(center["_id"], 0),
            }
        )

    rows.sort(key=lambda r: r["quintals"], reverse=True)

    return {
        "generated_at": datetime.now(),
        "date_from": date_from,
        "date_to": date_to,
        "filters": {"state": state, "district": district},
        "totals": {
            "centers": len(rows),
            "tokens_served": sum(r["tokens_served"] for r in rows),
            "quintals": round(sum(r["quintals"] for r in rows), 2),
            "amount": round(sum(r["amount"] for r in rows), 2),
            "open_grievances": sum(r["open_grievances"] for r in rows),
        },
        "rows": rows,
    }
