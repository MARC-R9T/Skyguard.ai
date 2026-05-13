import sys
import threading
from functools import lru_cache
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd


DELAY_ROOT = Path(__file__).resolve().parents[2] / "external" / "delay_propagation" / "Delay_Propagation"
DELAY_DATA_ROOT = DELAY_ROOT / "data"
DELAY_MODEL_ROOT = DELAY_ROOT / "models"
DEMO_DATASET_PATH = DELAY_ROOT / "aviation_industry_demo_dataset.csv"
FULL_DATASET_PATH = DELAY_DATA_ROOT / "full_processed.parquet"
ENCODER_PATH = DELAY_MODEL_ROOT / "label_encoders.pkl"

DELAY_MODE_DEMO = "demo"
DELAY_MODE_FULL = "full"

SIMULATION_LOCK = threading.Lock()

DISPLAY_NAME_MAP = {
    "hour_of_day": "Hour of day",
    "day_of_week": "Day of week",
    "is_weekend": "Weekend",
    "month": "Month",
    "origin_iata": "Origin airport",
    "destination_iata": "Destination airport",
    "distance_km": "Distance",
    "dep_temperature_c": "Departure temperature",
    "dep_precipitation_mm": "Precipitation",
    "dep_wind_speed_kmh": "Wind speed",
    "dep_visibility_m": "Visibility",
    "dep_humidity_pct": "Humidity",
    "dep_storm_indicator": "Storm indicator",
    "dep_flights_this_hour": "Flights this hour",
    "dep_congestion_ratio": "Congestion ratio",
    "turnaround_time_min": "Turnaround time",
}


class DelayPropagationError(RuntimeError):
    pass


def _ensure_delay_root() -> Path:
    if not DELAY_ROOT.exists():
        raise DelayPropagationError(
            f"Delay propagation package was not found at {DELAY_ROOT}."
        )
    return DELAY_ROOT


def _normalize_mode(mode: str | None) -> str:
    requested_mode = str(mode or DELAY_MODE_DEMO).strip().lower()
    if requested_mode not in {DELAY_MODE_DEMO, DELAY_MODE_FULL}:
        return DELAY_MODE_DEMO
    if requested_mode == DELAY_MODE_FULL and not FULL_DATASET_PATH.exists():
        return DELAY_MODE_DEMO
    return requested_mode


def _coerce_numeric_frame(frame: pd.DataFrame) -> pd.DataFrame:
    numeric_frame = frame.copy()
    for column in numeric_frame.columns:
        numeric_frame[column] = pd.to_numeric(numeric_frame[column], errors="coerce").fillna(0)
    return numeric_frame


def _parse_datetime_columns(frame: pd.DataFrame) -> pd.DataFrame:
    normalized = frame.copy()
    for column in ("scheduled_departure", "scheduled_arrival", "actual_arr"):
        if column in normalized.columns:
            normalized[column] = pd.to_datetime(normalized[column], errors="coerce")
    return normalized


def _dataset_modes() -> list[dict[str, str]]:
    modes = [
        {"value": DELAY_MODE_DEMO, "label": "Demo Dataset"},
    ]
    if FULL_DATASET_PATH.exists():
        modes.append({"value": DELAY_MODE_FULL, "label": "Full Dataset"})
    return modes


@lru_cache(maxsize=1)
def _load_encoders() -> dict[str, Any]:
    _ensure_delay_root()
    if not ENCODER_PATH.exists():
        return {}
    try:
        return joblib.load(ENCODER_PATH)
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _load_simulation_engine():
    _ensure_delay_root()
    if str(DELAY_ROOT) not in sys.path:
        sys.path.append(str(DELAY_ROOT))

    import os
    os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
    os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

    from simulation.engine import SimulationEngine

    return SimulationEngine(
        xgb_path=str(DELAY_MODEL_ROOT / "xgb_base.json"),
        lstm_path=str(DELAY_MODEL_ROOT / "lstm_prop.keras"),
        meta_path=str(DELAY_MODEL_ROOT / "meta_model.pkl"),
    )


def _prepare_demo_dataset() -> pd.DataFrame:
    if not DEMO_DATASET_PATH.exists():
        raise DelayPropagationError("Delay propagation demo dataset was not found.")

    encoders = _load_encoders()
    dataset = pd.read_csv(DEMO_DATASET_PATH, engine="python")
    dataset = _parse_datetime_columns(dataset)

    for column in ("origin_iata", "destination_iata"):
        if column in encoders and column in dataset.columns:
            known_classes = set(encoders[column].classes_)
            fallback_value = encoders[column].classes_[0]
            dataset[column] = dataset[column].apply(
                lambda value: value if value in known_classes else fallback_value
            )
            dataset[column] = encoders[column].transform(dataset[column])

    defaults = {
        "distance_km": 1000.0,
        "dep_precipitation_mm": 0.0,
        "dep_storm_indicator": 0.0,
        "dep_flights_this_hour": 10.0,
    }
    for column, default_value in defaults.items():
        if column not in dataset.columns:
            dataset[column] = default_value

    dataset["tail_label"] = dataset["aircraft_tail"].astype(str)
    return dataset


def _prepare_full_dataset() -> pd.DataFrame:
    if not FULL_DATASET_PATH.exists():
        raise DelayPropagationError("Delay propagation full dataset was not found.")

    dataset = pd.read_parquet(FULL_DATASET_PATH)
    dataset = _parse_datetime_columns(dataset)
    encoders = _load_encoders()

    if "aircraft_tail" in dataset.columns and "aircraft_tail" in encoders:
        tail_values = dataset["aircraft_tail"].fillna(0).astype(int).to_numpy()
        dataset["tail_label"] = encoders["aircraft_tail"].inverse_transform(tail_values)
    else:
        dataset["tail_label"] = dataset["aircraft_tail"].astype(str)

    return dataset


@lru_cache(maxsize=2)
def _load_dataset(mode: str) -> pd.DataFrame:
    normalized_mode = _normalize_mode(mode)
    if normalized_mode == DELAY_MODE_FULL:
        return _prepare_full_dataset()
    return _prepare_demo_dataset()


def _decode_airport(code: Any, column_name: str = "origin_iata") -> str:
    encoders = _load_encoders()
    if column_name in encoders:
        try:
            value = int(float(code))
            return str(encoders[column_name].inverse_transform([value])[0])
        except Exception:
            return str(code)
    return str(code)


def _format_timestamp(value: Any) -> str | None:
    if value is None or pd.isna(value):
        return None
    timestamp = pd.to_datetime(value, errors="coerce")
    if pd.isna(timestamp):
        return None
    return timestamp.isoformat()


def _tail_options(dataset: pd.DataFrame) -> list[dict[str, str]]:
    unique_tails = (
        dataset[["aircraft_tail", "tail_label"]]
        .dropna()
        .drop_duplicates()
        .sort_values("tail_label")
    )
    return [
        {
            "value": str(row["aircraft_tail"]),
            "label": str(row["tail_label"]),
        }
        for _, row in unique_tails.iterrows()
    ]


def _filter_tail_dataset(dataset: pd.DataFrame, tail_value: str) -> pd.DataFrame:
    tail_frame = dataset[dataset["aircraft_tail"].astype(str) == str(tail_value)].copy()
    return tail_frame.sort_values("scheduled_departure").reset_index(drop=True)


def _scenario_defaults(flight_row: pd.Series) -> dict[str, float]:
    return {
        "wind_speed_kmh": float(pd.to_numeric(flight_row.get("dep_wind_speed_kmh"), errors="coerce") or 0.0),
        "precipitation_mm": float(pd.to_numeric(flight_row.get("dep_precipitation_mm"), errors="coerce") or 0.0),
        "visibility_m": float(pd.to_numeric(flight_row.get("dep_visibility_m"), errors="coerce") or 0.0),
    }


def _safe_delay_float(value: Any) -> float:
    if value is None or pd.isna(value):
        return 0.0
    return float(value)


def _feature_display_value(feature_name: str, feature_value: Any) -> str:
    if feature_name in {"origin_iata", "destination_iata"}:
        return _decode_airport(feature_value, feature_name)
    if feature_name == "is_weekend":
        return "Weekend" if int(float(feature_value)) == 1 else "Weekday"
    if feature_name == "dep_storm_indicator":
        return "Storm" if int(float(feature_value)) == 1 else "Clear"
    if feature_name == "dep_visibility_m":
        return f"{float(feature_value):.0f} m"
    if feature_name == "distance_km":
        return f"{float(feature_value):.0f} km"
    if feature_name == "turnaround_time_min":
        return f"{float(feature_value):.0f} min"
    if feature_name in {"dep_temperature_c", "dep_wind_speed_kmh"}:
        return f"{float(feature_value):.1f}"
    return str(feature_value)


def _heuristic_base_delay(row: pd.Series) -> tuple[float, dict[str, float]]:
    wind_component = max(_safe_delay_float(row.get("dep_wind_speed_kmh")) - 12.0, 0.0) * 0.42
    precipitation_component = _safe_delay_float(row.get("dep_precipitation_mm")) * 1.8
    visibility_component = max(0.0, (6000.0 - _safe_delay_float(row.get("dep_visibility_m"), 6000.0)) / 400.0)
    congestion_component = _safe_delay_float(row.get("dep_congestion_ratio")) * 18.0
    turnaround_component = max(0.0, 45.0 - _safe_delay_float(row.get("turnaround_time_min"), 45.0)) * 0.55

    components = {
        "dep_wind_speed_kmh": wind_component,
        "dep_precipitation_mm": precipitation_component,
        "dep_visibility_m": visibility_component,
        "dep_congestion_ratio": congestion_component,
        "turnaround_time_min": turnaround_component,
    }
    return sum(components.values()), components


def _heuristic_driver_rows(scenario_frame: pd.DataFrame) -> list[list[dict[str, Any]]]:
    driver_rows: list[list[dict[str, Any]]] = []
    for _, row in scenario_frame.iterrows():
        _, components = _heuristic_base_delay(row)
        sorted_components = sorted(
            components.items(),
            key=lambda item: abs(item[1]),
            reverse=True,
        )[:4]
        driver_rows.append([
            {
                "feature": feature_name,
                "label": DISPLAY_NAME_MAP.get(feature_name, feature_name.replace("_", " ").title()),
                "impact": round(float(impact), 3),
                "direction": "increase" if impact >= 0 else "decrease",
                "value": _feature_display_value(feature_name, row.get(feature_name, 0)),
            }
            for feature_name, impact in sorted_components
        ])
    return driver_rows


def _simulate_delay_chain_fallback(scenario_frame: pd.DataFrame) -> pd.DataFrame:
    scenario = scenario_frame.sort_values("scheduled_departure").reset_index(drop=True)
    aircraft_state: dict[str, dict[str, Any]] = {}
    results: list[dict[str, Any]] = []

    for _, row in scenario.iterrows():
        tail = str(row.get("aircraft_tail"))
        state = aircraft_state.get(tail, {
            "last_arrival_time": pd.NaT,
            "history": [],
            "cumulative_delay": 0.0,
        })

        scheduled_departure = pd.to_datetime(row["scheduled_departure"])
        turnaround_time = _safe_delay_float(row.get("turnaround_time_min"), 0.0)
        if pd.isna(state["last_arrival_time"]):
            spill_delay = 0.0
        else:
            effective_turnaround = (scheduled_departure - state["last_arrival_time"]).total_seconds() / 60
            spill_delay = max(0.0, turnaround_time - effective_turnaround)

        base_delay, _ = _heuristic_base_delay(row)
        delay_history = state["history"][-3:]
        historical_average = float(np.mean(delay_history)) if delay_history else 0.0
        propagation_delay = (
            historical_average * 0.48
            + (_safe_delay_float(row.get("dep_congestion_ratio")) * 6.5)
            + (spill_delay * 0.18)
        )
        final_delay = max(0.0, (base_delay * 0.62) + (propagation_delay * 0.38) + spill_delay)
        predicted_actual_arrival = pd.to_datetime(row["scheduled_arrival"]) + pd.Timedelta(minutes=final_delay)

        state["last_arrival_time"] = predicted_actual_arrival
        state["history"] = [*state["history"], final_delay]
        state["cumulative_delay"] += final_delay
        aircraft_state[tail] = state

        result_row = row.to_dict()
        result_row["predicted_base_delay_xgb"] = float(base_delay)
        result_row["predicted_prop_delay_lstm"] = float(propagation_delay)
        result_row["calculated_spill_delay"] = float(spill_delay)
        result_row["final_predicted_delay"] = float(final_delay)
        result_row["predicted_actual_arrival"] = predicted_actual_arrival
        result_row["cumulative_delay"] = float(state["cumulative_delay"])
        results.append(result_row)

    return pd.DataFrame(results)


def _top_feature_drivers(engine, scenario_frame: pd.DataFrame) -> list[list[dict[str, Any]]]:
    try:
        import xgboost as xgb
    except Exception:
        return _heuristic_driver_rows(scenario_frame)

    try:
        feature_frame = _coerce_numeric_frame(scenario_frame[engine.xgb_features].copy())
        booster = engine.xgb_model.get_booster()
        contribution_matrix = booster.predict(
            xgb.DMatrix(feature_frame, feature_names=engine.xgb_features),
            pred_contribs=True,
        )
    except Exception:
        return _heuristic_driver_rows(scenario_frame)

    top_drivers_by_flight: list[list[dict[str, Any]]] = []
    for row_index, contributions in enumerate(contribution_matrix):
        feature_contributions = contributions[:-1]
        top_indexes = np.argsort(np.abs(feature_contributions))[::-1][:4]
        row_drivers = []

        for feature_index in top_indexes:
            feature_name = engine.xgb_features[int(feature_index)]
            impact = float(feature_contributions[int(feature_index)])
            row_drivers.append({
                "feature": feature_name,
                "label": DISPLAY_NAME_MAP.get(feature_name, feature_name.replace("_", " ").title()),
                "impact": round(impact, 3),
                "direction": "increase" if impact >= 0 else "decrease",
                "value": _feature_display_value(feature_name, feature_frame.iloc[row_index][feature_name]),
            })

        top_drivers_by_flight.append(row_drivers)

    return top_drivers_by_flight


def get_delay_metadata(mode: str | None = None) -> dict[str, Any]:
    normalized_mode = _normalize_mode(mode)
    dataset = _load_dataset(normalized_mode)
    tails = _tail_options(dataset)
    default_tail = tails[0]["value"] if tails else None

    return {
        "modes": _dataset_modes(),
        "mode": normalized_mode,
        "tails": tails,
        "default_tail": default_tail,
    }


def get_delay_tail_dates(mode: str | None, tail_value: str | None) -> dict[str, Any]:
    normalized_mode = _normalize_mode(mode)
    dataset = _load_dataset(normalized_mode)
    tails = _tail_options(dataset)
    selected_tail = tail_value or (tails[0]["value"] if tails else None)
    if not selected_tail:
        return {"mode": normalized_mode, "tail": None, "dates": [], "default_date": None, "defaults": None}

    tail_frame = _filter_tail_dataset(dataset, selected_tail)
    dates = sorted({
        pd.to_datetime(timestamp).date().isoformat()
        for timestamp in tail_frame["scheduled_departure"].dropna()
    })
    default_date = dates[0] if dates else None
    first_flight = tail_frame.iloc[0] if not tail_frame.empty else None

    return {
        "mode": normalized_mode,
        "tail": str(selected_tail),
        "tail_label": str(first_flight["tail_label"]) if first_flight is not None else str(selected_tail),
        "dates": dates,
        "default_date": default_date,
        "defaults": _scenario_defaults(first_flight) if first_flight is not None else None,
    }


def simulate_delay_propagation(
    mode: str | None = None,
    tail_value: str | None = None,
    date_value: str | None = None,
    overrides: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_mode = _normalize_mode(mode)
    dataset = _load_dataset(normalized_mode)
    tails = _tail_options(dataset)
    selected_tail = tail_value or (tails[0]["value"] if tails else None)

    if not selected_tail:
        raise DelayPropagationError("No aircraft tail is available for delay simulation.")

    tail_frame = _filter_tail_dataset(dataset, selected_tail)
    if tail_frame.empty:
        raise DelayPropagationError("No flights were found for the selected aircraft tail.")

    available_dates = sorted({
        pd.to_datetime(timestamp).date().isoformat()
        for timestamp in tail_frame["scheduled_departure"].dropna()
    })
    selected_date = date_value or (available_dates[0] if available_dates else None)
    if not selected_date:
        raise DelayPropagationError("No available delay simulation date was found.")

    scenario_frame = tail_frame[
        tail_frame["scheduled_departure"].dt.date == pd.to_datetime(selected_date).date()
    ].copy()
    if scenario_frame.empty:
        raise DelayPropagationError("No flights were found for the selected simulation date.")

    scenario_frame = scenario_frame.sort_values("scheduled_departure").reset_index(drop=True)
    if overrides:
        first_index = scenario_frame.index[0]
        if "wind_speed_kmh" in overrides:
            scenario_frame.loc[first_index, "dep_wind_speed_kmh"] = float(overrides["wind_speed_kmh"])
        if "precipitation_mm" in overrides:
            scenario_frame.loc[first_index, "dep_precipitation_mm"] = float(overrides["precipitation_mm"])
        if "visibility_m" in overrides:
            scenario_frame.loc[first_index, "dep_visibility_m"] = float(overrides["visibility_m"])

    engine_mode = "ml"
    try:
        engine = _load_simulation_engine()
        with SIMULATION_LOCK:
            engine.reset_state()
            result_frame = engine.process_flights(scenario_frame)
            explainability = _top_feature_drivers(engine, scenario_frame)
    except Exception:
        engine_mode = "fallback"
        result_frame = _simulate_delay_chain_fallback(scenario_frame)
        explainability = _heuristic_driver_rows(scenario_frame)

    total_flights = int(len(result_frame))
    summary = {
        "total_flights": total_flights,
        "cumulative_delay": round(_safe_delay_float(result_frame["cumulative_delay"].iloc[-1]), 2),
        "max_delay": round(_safe_delay_float(result_frame["final_predicted_delay"].max()), 2),
        "average_delay": round(_safe_delay_float(result_frame["final_predicted_delay"].mean()), 2),
    }

    timeline = []
    flight_breakdown = []
    for index, row in result_frame.iterrows():
        flight_duration = row["scheduled_arrival"] - row["scheduled_departure"]
        predicted_actual_arrival = pd.to_datetime(row["predicted_actual_arrival"])
        predicted_actual_departure = predicted_actual_arrival - flight_duration
        origin_label = _decode_airport(row["origin_iata"], "origin_iata")
        destination_label = _decode_airport(row["destination_iata"], "destination_iata")

        timeline.append({
            "id": f"timeline-{index + 1}",
            "label": f"Flight {index + 1}",
            "route": f"{origin_label} -> {destination_label}",
            "scheduled_departure": _format_timestamp(row["scheduled_departure"]),
            "scheduled_arrival": _format_timestamp(row["scheduled_arrival"]),
            "predicted_departure": _format_timestamp(predicted_actual_departure),
            "predicted_arrival": _format_timestamp(predicted_actual_arrival),
        })

        flight_breakdown.append({
            "id": f"delay-flight-{index + 1}",
            "sequence": index + 1,
            "route": f"{origin_label} -> {destination_label}",
            "origin": origin_label,
            "destination": destination_label,
            "scheduled_departure": _format_timestamp(row["scheduled_departure"]),
            "scheduled_arrival": _format_timestamp(row["scheduled_arrival"]),
            "predicted_departure": _format_timestamp(predicted_actual_departure),
            "predicted_arrival": _format_timestamp(predicted_actual_arrival),
            "base_delay": round(_safe_delay_float(row["predicted_base_delay_xgb"]), 2),
            "propagation_delay": round(_safe_delay_float(row["predicted_prop_delay_lstm"]), 2),
            "spill_delay": round(_safe_delay_float(row["calculated_spill_delay"]), 2),
            "final_delay": round(_safe_delay_float(row["final_predicted_delay"]), 2),
            "cumulative_delay": round(_safe_delay_float(row["cumulative_delay"]), 2),
            "drivers": explainability[index] if index < len(explainability) else [],
        })

    return {
        "engine_mode": engine_mode,
        "mode": normalized_mode,
        "modes": _dataset_modes(),
        "tail": str(selected_tail),
        "tail_label": str(scenario_frame["tail_label"].iloc[0]),
        "selected_date": selected_date,
        "available_dates": available_dates,
        "defaults": _scenario_defaults(scenario_frame.iloc[0]),
        "summary": summary,
        "timeline": timeline,
        "flights": flight_breakdown,
    }
