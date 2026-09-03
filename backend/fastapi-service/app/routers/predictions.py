"""ETA, forecasting and slot-recommendation endpoints."""
from fastapi import APIRouter, HTTPException, Query

from app.models.schemas import (
    CenterEtaResponse,
    ForecastResponse,
    SlotRecommendationRequest,
    SlotRecommendationResponse,
)
from app.services import eta as ETA
from app.services import forecast as F

router = APIRouter(tags=["intelligence"])


@router.get("/eta/{center_id}", response_model=CenterEtaResponse)
async def center_eta(center_id: str, date: str | None = Query(default=None)):
    """Live ETA for every waiting token, derived from measured stage durations."""
    try:
        return await ETA.compute_center_eta(center_id, date)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/eta/booking/{booking_id}")
async def booking_eta(booking_id: str):
    """Single-token ETA, used by the farmer's live tracker screen."""
    try:
        return await ETA.eta_for_booking(booking_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/forecast/{center_id}", response_model=ForecastResponse)
async def forecast(center_id: str, days: int = Query(default=7, ge=1, le=21)):
    """Predicted footfall and the counter count needed to absorb it."""
    try:
        return await F.forecast_center(center_id, days)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/recommend-slot", response_model=SlotRecommendationResponse)
async def recommend_slot(payload: SlotRecommendationRequest):
    """Suggests the least-congested slots so farmers spread their arrivals out."""
    try:
        return await F.recommend_slots(payload.center_id, payload.date, payload.quantity_quintals)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
