"""Pydantic response/request models. These also generate the /docs schema."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

Stage = Literal[
    "BOOKED",
    "ARRIVED",
    "QUALITY_CHECK",
    "WEIGHMENT",
    "PAYMENT_INITIATED",
    "PAID",
    "CANCELLED",
    "NO_SHOW",
]


class HealthResponse(BaseModel):
    service: str = "agriqueue-fastapi-intel"
    status: str
    mongo: bool
    database: str
    environment: str
    version: str = "1.0.0"
    timestamp: datetime


class StageDuration(BaseModel):
    stage: str
    avg_minutes: float
    p90_minutes: float
    samples: int


class TokenEta(BaseModel):
    booking_id: str
    token_code: str
    farmer_name: str | None = None
    stage: Stage
    position: int
    ahead: int
    eta_minutes: int
    eta_at: str
    confidence: Literal["high", "medium", "low"]


class CenterEtaResponse(BaseModel):
    center_id: str
    center_name: str
    date: str
    active_counters: int
    model: str = Field(description="How the ETA was derived for this centre")
    stage_durations: list[StageDuration]
    served_per_hour: float
    tokens: list[TokenEta]


class HourlyLoad(BaseModel):
    hour: str
    booked: int
    served: int


class CenterAnalytics(BaseModel):
    center_id: str
    center_name: str
    date: str
    funnel: dict[str, int]
    hourly_load: list[HourlyLoad]
    stage_durations: list[StageDuration]
    avg_wait_minutes: float
    avg_turnaround_minutes: float
    throughput_per_hour: float
    capacity_used_pct: float
    quintals_procured: float
    amount_disbursed: float
    no_show_rate_pct: float


class OverviewResponse(BaseModel):
    generated_at: datetime
    date: str
    totals: dict[str, Any]
    today: dict[str, Any]
    by_commodity: list[dict[str, Any]]
    by_state: list[dict[str, Any]]
    top_centers: list[dict[str, Any]]
    grievances: dict[str, Any]


class TrendPoint(BaseModel):
    date: str
    booked: int
    served: int
    quintals: float
    amount: float
    avg_turnaround_minutes: float


class ForecastPoint(BaseModel):
    date: str
    weekday: str
    predicted_footfall: int
    lower_bound: int
    upper_bound: int
    recommended_counters: int
    congestion_risk: Literal["low", "medium", "high"]


class ForecastResponse(BaseModel):
    center_id: str
    center_name: str
    method: str
    baseline_daily_avg: float
    points: list[ForecastPoint]


class SlotRecommendationRequest(BaseModel):
    center_id: str
    date: str | None = None
    quantity_quintals: float = 10.0


class SlotSuggestion(BaseModel):
    date: str
    slot_start: str
    slot_end: str
    expected_wait_minutes: int
    load_pct: float
    score: float
    reason_en: str
    reason_hi: str


class SlotRecommendationResponse(BaseModel):
    center_id: str
    center_name: str
    evaluated_slots: int
    suggestions: list[SlotSuggestion]


class BroadcastRequest(BaseModel):
    center_id: str
    date: str | None = None
    stages: list[Stage] = Field(default_factory=lambda: ["BOOKED"])
    channel: Literal["SMS", "IVR", "WHATSAPP", "APP"] = "SMS"
    message_en: str
    message_hi: str
    dry_run: bool = False


class BroadcastResponse(BaseModel):
    center_id: str
    matched: int
    dispatched: int
    dry_run: bool
    sample: list[dict[str, Any]]


class ProcurementReportRow(BaseModel):
    center_code: str
    center_name: str
    district: str
    state: str
    tokens_served: int
    quintals: float
    amount: float
    avg_turnaround_minutes: float
    no_show_rate_pct: float
    open_grievances: int


class ProcurementReport(BaseModel):
    generated_at: datetime
    date_from: str
    date_to: str
    filters: dict[str, Any]
    totals: dict[str, Any]
    rows: list[ProcurementReportRow]
