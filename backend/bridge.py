import json
import math
import os
import sys
import threading
import time

import pandas as pd

# Add current directory to path so we can import src
sys.path.append(os.path.join(os.path.dirname(__file__)))

from src.analysis import run_traffic_analysis
from src.conflict_detector import detect_conflicts
from src.data_fetcher import fetch_opensky_data, load_local_history, load_local_snapshot
from src.data_preprocessing import clean_opensky, filter_region
from src.delays import calculate_delays
from src.forecasting import detect_future_conflicts, predict_linear_path
from src.geo_context import resolve_location_context

CONFLICT_THRESHOLD_KM = float(os.getenv("SKYGUARD_CONFLICT_THRESHOLD_KM", "10"))
MAX_HISTORY_POINTS = int(os.getenv("SKYGUARD_HISTORY_POINTS", "8"))
MAX_HISTORY_PAYLOAD_POINTS = int(os.getenv("SKYGUARD_HISTORY_PAYLOAD_POINTS", "3"))
PREDICTION_STEPS = int(os.getenv("SKYGUARD_PREDICTION_STEPS", "5"))
MAX_PREDICTION_PAYLOAD_FLIGHTS = int(os.getenv("SKYGUARD_PREDICTION_PAYLOAD_FLIGHTS", "160"))
DASHBOARD_CACHE_SECONDS = float(os.getenv("SKYGUARD_DASHBOARD_CACHE_SECONDS", "10"))
SNAPSHOT_CACHE = {
    "expires_at": 0.0,
    "payload": None,
}
SNAPSHOT_LOCK = threading.Lock()


def _safe_float(value, default=0.0):
    if value is None or pd.isna(value):
        return default
    return float(value)


def _safe_int(value, default=0):
    if value is None or pd.isna(value):
        return default
    return int(float(value))


def _risk_level(distance_km):
    if distance_km < 3:
        return "high"
    if distance_km < 6:
        return "medium"
    return "low"


def _format_timestamp(row):
    timestamp_value = row.get("last_contact") or row.get("time_position")
    if timestamp_value is not None and not pd.isna(timestamp_value):
        try:
            return pd.to_datetime(float(timestamp_value), unit="s", utc=True).isoformat()
        except Exception:
            pass
    return pd.Timestamp.utcnow().isoformat()


def _normalize_longitude(lng):
    return ((float(lng) + 180.0) % 360.0) - 180.0


def _project_destination(lat, lng, heading, velocity, history):
    if history and len(history) >= 2:
        prev = history[-2]
        curr = history[-1]
        delta_lat = curr["lat"] - prev["lat"]
        delta_lng = curr["lng"] - prev["lng"]
        if abs(delta_lat) > 1e-6 or abs(delta_lng) > 1e-6:
            return {
                "lat": curr["lat"] + (delta_lat * 4),
                "lng": _normalize_longitude(curr["lng"] + (delta_lng * 4)),
            }

    bearing_deg = _safe_float(heading, 90.0)
    speed_kmh = max(_safe_float(velocity, 250.0) * 1.852, 80.0)
    distance_km = max(speed_kmh * 0.25, 75.0)

    radius_earth_km = 6371.0
    angular_distance = distance_km / radius_earth_km
    bearing = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lng)

    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular_distance)
        + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
        math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
    )

    return {
        "lat": math.degrees(lat2),
        "lng": _normalize_longitude(math.degrees(lon2)),
    }


def _location_payload(lat, lng, country_hint=None):
    context = resolve_location_context(lat, lng, country_hint=country_hint)
    return {
        "lat": round(float(lat), 5),
        "lng": round(_normalize_longitude(lng), 5),
        "place": context["place"],
        "zone": context["zone"],
        "sector": context["sector"],
        "label": context["label"],
        "macroRegion": context["macroRegion"],
    }


def _format_current_conflicts(conflicts, country_lookup):
    formatted_conflicts = []

    for index, conflict in enumerate(conflicts):
        first, second, distance = conflict
        lat1 = _safe_float(first["lat"])
        lng1 = _safe_float(first["lon"])
        lat2 = _safe_float(second["lat"])
        lng2 = _safe_float(second["lon"])
        midpoint_lat = (lat1 + lat2) / 2
        midpoint_lng = (lng1 + lng2) / 2
        country_hint = (
            country_lookup.get(str(first["icao24"]).strip())
            or country_lookup.get(str(second["icao24"]).strip())
        )

        formatted_conflicts.append({
            "id": f"conflict-{index}",
            "id1": str(first["icao24"]).strip(),
            "id2": str(second["icao24"]).strip(),
            "dist": round(_safe_float(distance), 3),
            "riskLevel": _risk_level(_safe_float(distance)),
            "pathType": "current",
            "location": _location_payload(midpoint_lat, midpoint_lng, country_hint=country_hint),
        })

    formatted_conflicts.sort(key=lambda item: item["dist"])
    return formatted_conflicts


def _format_future_conflicts(conflicts, country_lookup):
    formatted_conflicts = []

    for index, conflict in enumerate(conflicts):
        location = conflict.get("location") or {}
        midpoint_lat = _safe_float(location.get("lat"))
        midpoint_lng = _safe_float(location.get("lng"))
        country_hint = (
            country_lookup.get(conflict["id1"])
            or country_lookup.get(conflict["id2"])
        )

        formatted_conflicts.append({
            "id": f"future-conflict-{index}",
            "id1": str(conflict["id1"]).strip(),
            "id2": str(conflict["id2"]).strip(),
            "dist": round(_safe_float(conflict.get("distance")), 3),
            "riskLevel": _risk_level(_safe_float(conflict.get("distance"))),
            "pathType": "future",
            "step": _safe_int(conflict.get("step"), 0),
            "location": _location_payload(midpoint_lat, midpoint_lng, country_hint=country_hint),
        })

    formatted_conflicts.sort(key=lambda item: (item.get("step", 999), item["dist"]))
    return formatted_conflicts


def _load_runtime_dataframe():
    runtime_region = os.getenv("SKYGUARD_REGION", "global")
    live_df = clean_opensky(fetch_opensky_data(use_local_fallback=False))
    if not live_df.empty:
        live_df = filter_region(live_df, region=runtime_region)
        if "icao24" in live_df.columns:
            live_df = live_df.drop_duplicates(subset=["icao24"], keep="last")
        return live_df.reset_index(drop=True), "live"

    local_df = clean_opensky(load_local_snapshot())
    if not local_df.empty:
        local_df = filter_region(local_df, region=runtime_region)
        if "icao24" in local_df.columns:
            local_df = local_df.drop_duplicates(subset=["icao24"], keep="last")
        return local_df.reset_index(drop=True), "local"

    return pd.DataFrame(), "unavailable"


def _empty_state(source):
    return {
        "states": [],
        "conflicts": [],
        "future_conflicts": [],
        "analysis": {},
        "timestamp": pd.Timestamp.utcnow().isoformat(),
        "source": source,
    }


def _build_dashboard_state():
    df, source = _load_runtime_dataframe()
    if df.empty:
        return _empty_state(source)

    history_lookup = load_local_history(
        max_points=MAX_HISTORY_POINTS,
        flight_ids=df["icao24"].astype(str).tolist(),
    )

    country_lookup = {
        str(row["icao24"]).strip(): str(row.get("origin_country", "")).strip()
        for row in df.to_dict("records")
    }

    current_conflicts = detect_conflicts(df, threshold_km=CONFLICT_THRESHOLD_KM)
    formatted_conflicts = _format_current_conflicts(current_conflicts, country_lookup)
    conflict_ids = {
        conflict["id1"]
        for conflict in formatted_conflicts
    } | {
        conflict["id2"]
        for conflict in formatted_conflicts
    }

    delays = calculate_delays(df)
    flight_states = []
    predictions_by_id = {}
    prediction_priority = {}

    for row in df.to_dict("records"):
        icao = str(row["icao24"]).strip()
        lat = _safe_float(row.get("lat"))
        lng = _safe_float(row.get("lon"))
        heading = _safe_float(row.get("heading"), 0.0)
        velocity = round(_safe_float(row.get("velocity")), 2)
        vertical_rate = round(_safe_float(row.get("vertical_rate")), 2)
        delay_minutes = _safe_int(delays.get(icao, 0))
        history = list(history_lookup.get(icao, []))

        current_point = {"lat": lat, "lng": lng}
        if not history or history[-1] != current_point:
            history.append(current_point)
        history = history[-MAX_HISTORY_POINTS:]
        history_payload = history[-MAX_HISTORY_PAYLOAD_POINTS:]

        current_context = resolve_location_context(
            lat,
            lng,
            country_hint=str(row.get("origin_country", "")).strip() or None,
        )
        destination_point = _project_destination(lat, lng, heading, velocity, history)
        destination_context = resolve_location_context(destination_point["lat"], destination_point["lng"])
        prediction = predict_linear_path(
            history=history,
            current_lat=lat,
            current_lng=lng,
            heading=heading,
            velocity=velocity,
            steps=PREDICTION_STEPS,
        )

        if prediction:
            predictions_by_id[icao] = prediction

        status = "conflict" if icao in conflict_ids else ("delayed" if delay_minutes > 0 else "on-time")
        priority = len(history) * 6
        if delay_minutes > 0:
            priority += 22
        if vertical_rate > 1200:
            priority += 18
        if status == "conflict":
            priority += 120

        prediction_priority[icao] = priority

        flight_states.append({
            "id": icao,
            "callsign": str(row.get("callsign", "")).strip() or icao.upper(),
            "origin": {
                "lat": lat,
                "lng": lng,
                "city": current_context["place"],
                "code": "NOW",
                "zone": current_context["zone"],
                "label": current_context["label"],
            },
            "destination": {
                "lat": round(destination_point["lat"], 5),
                "lng": round(destination_point["lng"], 5),
                "city": destination_context["place"],
                "code": "PRJ",
                "zone": destination_context["zone"],
                "label": destination_context["label"],
            },
            "status": status,
            "altitude": _safe_float(row.get("alt")),
            "velocity": velocity,
            "lastUpdate": _format_timestamp(row),
            "history": history_payload,
            "delayMinutes": delay_minutes,
            "heading": heading,
            "verticalRate": vertical_rate,
            "originCountry": str(row.get("origin_country", "")).strip(),
            "zone": current_context["zone"],
            "locationLabel": current_context["label"],
            "source": source,
        })

    future_conflicts = detect_future_conflicts(
        predictions_by_id,
        threshold_km=CONFLICT_THRESHOLD_KM,
    )
    formatted_future_conflicts = _format_future_conflicts(future_conflicts, country_lookup)
    future_conflict_ids = {
        conflict["id1"]
        for conflict in formatted_future_conflicts
    } | {
        conflict["id2"]
        for conflict in formatted_future_conflicts
    }

    for flight_id in future_conflict_ids:
        prediction_priority[flight_id] = prediction_priority.get(flight_id, 0) + 90

    prediction_attach_ids = set(
        flight_id
        for flight_id, _ in sorted(
            prediction_priority.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if flight_id in predictions_by_id
    )
    if len(prediction_attach_ids) > MAX_PREDICTION_PAYLOAD_FLIGHTS:
        sorted_ids = [
            flight_id
            for flight_id, _ in sorted(
                prediction_priority.items(),
                key=lambda item: item[1],
                reverse=True,
            )
            if flight_id in predictions_by_id
        ]
        prediction_attach_ids = set(sorted_ids[:MAX_PREDICTION_PAYLOAD_FLIGHTS])

    for flight in flight_states:
        flight_id = flight["id"]
        if flight_id in prediction_attach_ids:
            flight["prediction"] = predictions_by_id.get(flight_id, [])
            flight["futureConflict"] = flight_id in future_conflict_ids

    analysis = run_traffic_analysis(
        df,
        conflicts_count=len(formatted_conflicts),
        future_conflicts_count=len(formatted_future_conflicts),
    )

    return {
        "states": flight_states,
        "conflicts": formatted_conflicts,
        "future_conflicts": formatted_future_conflicts,
        "analysis": analysis,
        "timestamp": pd.Timestamp.utcnow().isoformat(),
        "source": source,
    }


def get_complete_state(force_refresh=False):
    """
    Run the backend pipeline and return one frontend-friendly state object.
    """
    now = time.time()

    if not force_refresh and DASHBOARD_CACHE_SECONDS > 0:
        with SNAPSHOT_LOCK:
            cached_payload = SNAPSHOT_CACHE["payload"]
            if cached_payload is not None and now < SNAPSHOT_CACHE["expires_at"]:
                return cached_payload

    try:
        payload = _build_dashboard_state()
        if DASHBOARD_CACHE_SECONDS > 0 and "error" not in payload:
            with SNAPSHOT_LOCK:
                SNAPSHOT_CACHE["payload"] = payload
                SNAPSHOT_CACHE["expires_at"] = now + DASHBOARD_CACHE_SECONDS
        return payload
    except Exception as e:
        error_payload = _empty_state("unavailable")
        error_payload["error"] = str(e)
        return error_payload


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else "get_all"

    if command == "get_all":
        print(json.dumps(get_complete_state()))
    elif command == "health":
        print(json.dumps({"status": "ok", "engine": "python3"}))
