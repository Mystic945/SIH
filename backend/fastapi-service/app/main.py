"""
AgriQueue — FastAPI Intelligence Service
=======================================

The second half of a deliberate two-backend split:

    Express (Node.js, :5000)   transactional core — auth, bookings, stage
                               updates, grievances, Socket.IO realtime
    FastAPI (Python,  :8000)   analytics, ETA modelling, footfall forecasting,
                               bulk notification dispatch, reporting

Both processes talk to the *same* MongoDB Atlas database. Express fronts this
service at /api/v1/intel/*, so the browser only deals with one origin, while
this service also stays independently reachable at :8000/docs for demos.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import close_mongo_connection, connect_to_mongo
from app.routers import analytics, health, notifications, predictions

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)s :: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("agriqueue")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await connect_to_mongo()
    logger.info("FastAPI intelligence service ready on port %s", settings.port)
    yield
    await close_mongo_connection()


app = FastAPI(
    title="AgriQueue Intelligence Service",
    description=(
        "Analytics, live ETA modelling, footfall forecasting and bulk "
        "notification dispatch for the AgriQueue procurement platform."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"detail": str(exc)})


# Mounted twice on purpose: /health for container probes, /intel/* for the
# Express proxy, which forwards the path through unchanged.
app.include_router(health.router)
app.include_router(health.router, prefix="/intel")
app.include_router(analytics.router, prefix="/intel")
app.include_router(predictions.router, prefix="/intel")
app.include_router(notifications.router, prefix="/intel")


@app.get("/", tags=["health"])
async def root():
    return {
        "service": "AgriQueue Intelligence Service",
        "version": "1.0.0",
        "docs": "/docs",
        "database": settings.mongo_db_name,
        "companion": f"{settings.express_url} (Express transactional API)",
        "endpoints": [
            "/intel/analytics/overview",
            "/intel/analytics/center/{center_id}",
            "/intel/analytics/trends",
            "/intel/analytics/report",
            "/intel/eta/{center_id}",
            "/intel/eta/booking/{booking_id}",
            "/intel/forecast/{center_id}",
            "/intel/recommend-slot",
            "/intel/admin/notify/broadcast",
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=settings.port, reload=True)
