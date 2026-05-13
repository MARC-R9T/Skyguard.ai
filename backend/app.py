import asyncio
import json
import logging
import os
import sys

# Fix path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from src.delay_propagation import (
    DelayPropagationError,
    get_delay_metadata,
    get_delay_tail_dates,
    simulate_delay_propagation,
)
from src.predict import predict_next_points
from src.forecasting import predict_linear_path
from bridge import get_complete_state

# Silence "socket.send() raised exception" spam.
# These fire whenever the browser closes a connection before the streaming
# response finishes — harmless on Windows but flood the log with noise.
logging.getLogger("uvicorn.error").setLevel(logging.CRITICAL)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

app = FastAPI()
PREDICTION_MODE = str(os.getenv("SKYGUARD_PREDICTION_MODE", "heuristic")).strip().lower()
STREAM_CONCURRENCY_LIMIT = max(int(os.getenv("SKYGUARD_STREAM_CONCURRENCY", "6")), 1)
STREAM_SEMAPHORE = asyncio.Semaphore(STREAM_CONCURRENCY_LIMIT)


def _stream_json(content):
    encoder = json.JSONEncoder(separators=(",", ":"), ensure_ascii=False)
    for chunk in encoder.iterencode(content):
        yield chunk


async def _stream_json_response(factory):
    async with STREAM_SEMAPHORE:
        payload = await asyncio.to_thread(factory)
        for chunk in _stream_json(payload):
            yield chunk


def _conflict_payload():
    state = get_complete_state()
    return {
        "conflicts": state.get("conflicts", []),
        "future_conflicts": state.get("future_conflicts", []),
    }


# CORS (frontend connection)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def home():
    return {"status": "Backend running"}


@app.post("/predict")
def predict(data: dict):
    trajectory = data.get("trajectory", [])
    steps = int(data.get("steps", 5))

    if not isinstance(trajectory, list):
        return {"result": [], "error": "trajectory must be a list of [lat, lng] points"}

    normalized_history = [
        {"lat": float(point[0]), "lng": float(point[1])}
        for point in trajectory
        if isinstance(point, (list, tuple)) and len(point) >= 2
    ]

    result = []
    if PREDICTION_MODE in {"ml", "hybrid"}:
        result = predict_next_points(trajectory, steps=steps)

    if not result and normalized_history:
        last_point = normalized_history[-1]
        result = [
            [point["lat"], point["lng"]]
            for point in predict_linear_path(
                history=normalized_history,
                current_lat=last_point["lat"],
                current_lng=last_point["lng"],
                heading=None,
                velocity=None,
                steps=steps,
            )
        ]

    return {
        "result": [
            {"lat": float(point[0]), "lng": float(point[1])}
            for point in result
        ]
    }


@app.get("/dashboard")
async def get_dashboard():
    return StreamingResponse(
        _stream_json_response(get_complete_state),
        media_type="application/json",
        headers={"Cache-Control": "no-store", "Connection": "close"},
    )


@app.get("/flights")
async def get_flights():
    return StreamingResponse(
        _stream_json_response(lambda: get_complete_state().get("states", [])),
        media_type="application/json",
        headers={"Cache-Control": "no-store", "Connection": "close"},
    )


@app.get("/conflicts")
async def get_conflicts():
    return StreamingResponse(
        _stream_json_response(_conflict_payload),
        media_type="application/json",
        headers={"Cache-Control": "no-store", "Connection": "close"},
    )


@app.get("/delay-propagation/meta")
async def get_delay_meta(mode: str = "demo"):
    try:
        return await asyncio.to_thread(get_delay_metadata, mode)
    except DelayPropagationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.get("/delay-propagation/dates")
async def get_delay_dates(mode: str = "demo", tail: str | None = None):
    try:
        return await asyncio.to_thread(get_delay_tail_dates, mode, tail)
    except DelayPropagationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@app.post("/delay-propagation/simulate")
async def simulate_delay(data: dict):
    try:
        return await asyncio.to_thread(
            simulate_delay_propagation,
            data.get("mode"),
            data.get("tail"),
            data.get("date"),
            data.get("overrides"),
        )
    except DelayPropagationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
