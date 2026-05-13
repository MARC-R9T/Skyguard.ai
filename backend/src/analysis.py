import json

import pandas as pd

from src.geo_context import resolve_location_context
from src.weather_service import resolve_weather_zones


DENSITY_CELL_SIZE_DEGREES = 4.0
MAX_DENSITY_CELLS = 180
MAX_HAZARD_ZONES = 10


def _mean_numeric(series):
    if series is None:
        return 0.0

    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return 0.0
    return float(numeric.mean())


def _std_numeric(series):
    if series is None:
        return 0.0

    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if len(numeric) < 2:
        return 0.0
    return float(numeric.std())


def _bucket_coordinate(series, cell_size):
    return (pd.to_numeric(series, errors="coerce") / cell_size).round() * cell_size


def _clamp(value, lower=0.0, upper=1.0):
    return max(lower, min(upper, float(value)))


def _severity_from_score(score):
    if score >= 0.74:
        return "high"
    if score >= 0.46:
        return "medium"
    return "low"


def _build_density_cells(flights_df):
    if flights_df is None or flights_df.empty or not {"lat", "lon"}.issubset(flights_df.columns):
        return []

    density_df = flights_df.copy()
    density_df["lat_bucket"] = _bucket_coordinate(density_df["lat"], DENSITY_CELL_SIZE_DEGREES)
    density_df["lon_bucket"] = _bucket_coordinate(density_df["lon"], DENSITY_CELL_SIZE_DEGREES)
    density_df["vertical_rate_abs"] = pd.to_numeric(
        density_df.get("vertical_rate", 0.0),
        errors="coerce",
    ).abs().fillna(0.0)
    density_df["velocity"] = pd.to_numeric(density_df.get("velocity", 0.0), errors="coerce")
    density_df["alt"] = pd.to_numeric(density_df.get("alt", 0.0), errors="coerce")

    grouped = (
        density_df.groupby(["lat_bucket", "lon_bucket"], dropna=True)
        .agg(
            flight_count=("icao24", "size"),
            average_altitude=("alt", "mean"),
            average_velocity=("velocity", "mean"),
            velocity_std=("velocity", "std"),
            altitude_std=("alt", "std"),
            average_vertical_rate=("vertical_rate_abs", "mean"),
        )
        .fillna(0.0)
        .sort_values("flight_count", ascending=False)
        .head(MAX_DENSITY_CELLS)
    )

    if grouped.empty:
        return []

    max_count = max(float(grouped["flight_count"].max()), 1.0)
    cells = []

    for (lat_bucket, lon_bucket), row in grouped.iterrows():
        context = resolve_location_context(float(lat_bucket), float(lon_bucket))
        intensity = _clamp(float(row["flight_count"]) / max_count)
        cells.append({
            "lat": round(float(lat_bucket), 2),
            "lng": round(float(lon_bucket), 2),
            "count": int(row["flight_count"]),
            "intensity": round(intensity, 3),
            "average_altitude": round(float(row["average_altitude"]), 1),
            "average_velocity": round(float(row["average_velocity"]), 1),
            "velocity_std": round(float(row["velocity_std"]), 1),
            "altitude_std": round(float(row["altitude_std"]), 1),
            "average_vertical_rate": round(float(row["average_vertical_rate"]), 1),
            "place": context["place"],
            "zone": context["zone"],
            "label": context["label"],
            "sector": context["sector"],
            "macroRegion": context["macroRegion"],
        })

    return cells


def _build_weather_zones(density_cells):
    if not density_cells:
        return []

    max_count = max(cell["count"] for cell in density_cells) or 1
    zones = []

    for index, cell in enumerate(density_cells):
        slowdown_factor = 1.0 - _clamp(cell["average_velocity"] / 260.0)
        vertical_factor = _clamp(cell["average_vertical_rate"] / 1900.0)
        congestion_factor = _clamp(cell["count"] / max_count)
        score = round(
            (slowdown_factor * 0.48)
            + (vertical_factor * 0.22)
            + (congestion_factor * 0.3),
            3,
        )

        if score < 0.34:
            continue

        severity = _severity_from_score(score)
        zones.append({
            "id": f"weather-{index}",
            "kind": "weather",
            "lat": cell["lat"],
            "lng": cell["lng"],
            "radius_km": int(260 + (score * 260)),
            "intensity": score,
            "severity": severity,
            "flight_count": cell["count"],
            "average_velocity": cell["average_velocity"],
            "average_altitude": cell["average_altitude"],
            "place": cell["place"],
            "zone": cell["zone"],
            "label": cell["label"],
            "summary": (
                f"{cell['count']} tracked aircraft near {cell['place']} are showing a compressed flow pattern "
                f"with lower average speed and route adjustments."
            ),
            "source": "telemetry-inferred",
        })

    zones.sort(key=lambda item: item["intensity"], reverse=True)
    return zones[:MAX_HAZARD_ZONES]


def _build_turbulence_zones(density_cells):
    if not density_cells:
        return []

    max_count = max(cell["count"] for cell in density_cells) or 1
    zones = []

    for index, cell in enumerate(density_cells):
        vertical_factor = _clamp(cell["average_vertical_rate"] / 2200.0)
        altitude_factor = _clamp(cell["altitude_std"] / 6500.0)
        congestion_factor = _clamp(cell["count"] / max_count)
        score = round(
            (vertical_factor * 0.5)
            + (altitude_factor * 0.32)
            + (congestion_factor * 0.18),
            3,
        )

        if score < 0.3:
            continue

        severity = _severity_from_score(score)
        zones.append({
            "id": f"turbulence-{index}",
            "kind": "turbulence",
            "lat": cell["lat"],
            "lng": cell["lng"],
            "radius_km": int(180 + (score * 240)),
            "intensity": score,
            "severity": severity,
            "flight_count": cell["count"],
            "average_vertical_rate": cell["average_vertical_rate"],
            "average_altitude": cell["average_altitude"],
            "place": cell["place"],
            "zone": cell["zone"],
            "label": cell["label"],
            "summary": (
                f"{cell['count']} aircraft near {cell['place']} are showing elevated climb and descent variance "
                f"that suggests rough-air handling in this corridor."
            ),
            "source": "telemetry-inferred",
        })

    zones.sort(key=lambda item: item["intensity"], reverse=True)
    return zones[:MAX_HAZARD_ZONES]


def _build_briefing(
    total_flights,
    conflicts_count,
    future_conflicts_count,
    average_velocity,
    efficiency_score,
    density_hotspots,
    weather_zones,
    turbulence_zones,
):
    if total_flights <= 0:
        return {
            "headline": "No live traffic available",
            "summary": "The backend did not return a usable flight snapshot, so no traffic briefing could be generated.",
            "zone_focus": [],
            "key_drivers": [],
            "recommended_actions": [],
        }

    lead_hotspot = density_hotspots[0] if density_hotspots else None
    lead_weather = weather_zones[0] if weather_zones else None
    lead_turbulence = turbulence_zones[0] if turbulence_zones else None
    conflict_pressure = (float(conflicts_count) / total_flights) if total_flights else 0.0
    future_pressure = (float(future_conflicts_count) / total_flights) if total_flights else 0.0

    if lead_hotspot:
        headline = f"Traffic pressure is centered on {lead_hotspot['zone']}"
    elif conflicts_count > 0:
        headline = "Conflict exposure is elevated across the active snapshot"
    else:
        headline = "Traffic is broadly stable across the active snapshot"

    summary_parts = []
    if lead_hotspot:
        summary_parts.append(
            f"The busiest zone is {lead_hotspot['label']} with {lead_hotspot['count']} tracked flights in the top density cell."
        )
    summary_parts.append(
        f"Current conflict exposure is {conflicts_count} pairs and the forecast engine is flagging {future_conflicts_count} additional future-path intersections."
    )
    if lead_weather:
        summary_parts.append(
            f"Flow slowdown is most visible near {lead_weather['place']}, where the weather filter is highlighting compressed movement."
        )
    if lead_turbulence:
        summary_parts.append(
            f"The strongest turbulence signature is near {lead_turbulence['place']}, where vertical motion variance is highest."
        )

    zone_focus = []
    for item in [lead_hotspot, lead_weather, lead_turbulence]:
        if item and item["label"] not in zone_focus:
            zone_focus.append(item["label"])

    key_drivers = [
        {
            "label": "Traffic flow",
            "value": f"{average_velocity:.0f} kts average",
            "impact": "Higher speeds improve throughput unless conflict density rises.",
        },
        {
            "label": "Conflict load",
            "value": f"{conflicts_count} live pairs",
            "impact": f"{conflict_pressure * 100:.1f}% of tracked traffic is inside current conflict pairings.",
        },
        {
            "label": "Future exposure",
            "value": f"{future_conflicts_count} predicted pairs",
            "impact": f"{future_pressure * 100:.1f}% of traffic is projected to intersect on the forecast horizon.",
        },
        {
            "label": "AI efficiency",
            "value": f"{efficiency_score * 100:.1f}%",
            "impact": "Blends flow continuity with current separation performance.",
        },
    ]

    recommendations = [
        "Prioritize spacing adjustments through the busiest density zone before conflict load cascades outward.",
        "Use the weather and turbulence layers as telemetry-based advisories, not as direct meteorological truth.",
        "Review yellow future-path crossings first because they surface separation risks before they become active conflicts.",
    ]

    return {
        "headline": headline,
        "summary": " ".join(summary_parts),
        "zone_focus": zone_focus,
        "key_drivers": key_drivers,
        "recommended_actions": recommendations,
    }


def run_traffic_analysis(flights_df, conflicts_count=0, future_conflicts_count=0):
    """
    Compute lightweight analytics directly from the available flight telemetry.
    """
    if flights_df is None or flights_df.empty:
        return {
            "total_flights": 0,
            "density_hotspots": [],
            "density_map": [],
            "weather_zones": [],
            "turbulence_zones": [],
            "briefing": _build_briefing(0, 0, 0, 0.0, 0.0, [], [], []),
            "efficiency_score": 0.0,
            "average_velocity": 0.0,
            "average_altitude": 0.0,
            "conflict_ratio": 0.0,
            "future_conflict_ratio": 0.0,
        }

    total_flights = int(len(flights_df))
    average_velocity = _mean_numeric(flights_df["velocity"]) if "velocity" in flights_df.columns else 0.0
    average_altitude = _mean_numeric(flights_df["alt"]) if "alt" in flights_df.columns else 0.0
    density_map = _build_density_cells(flights_df)
    density_hotspots = density_map[:5]
    weather_zones = resolve_weather_zones(
        flights_df=flights_df,
        density_cells=density_map,
        fallback_zones=_build_weather_zones(density_map),
    )
    turbulence_zones = _build_turbulence_zones(density_map)

    conflict_ratio = (float(conflicts_count) / total_flights) if total_flights else 0.0
    future_conflict_ratio = (float(future_conflicts_count) / total_flights) if total_flights else 0.0
    traffic_flow_score = min(average_velocity / 260.0, 1.0)
    separation_score = max(0.0, 1.0 - min(conflict_ratio * 4, 1.0))
    forecast_score = max(0.0, 1.0 - min(future_conflict_ratio * 5, 1.0))
    efficiency_score = round(
        (traffic_flow_score * 0.35)
        + (separation_score * 0.45)
        + (forecast_score * 0.2),
        3,
    )

    briefing = _build_briefing(
        total_flights=total_flights,
        conflicts_count=conflicts_count,
        future_conflicts_count=future_conflicts_count,
        average_velocity=average_velocity,
        efficiency_score=efficiency_score,
        density_hotspots=density_hotspots,
        weather_zones=weather_zones,
        turbulence_zones=turbulence_zones,
    )

    return {
        "total_flights": total_flights,
        "density_hotspots": density_hotspots,
        "density_map": density_map,
        "weather_zones": weather_zones,
        "turbulence_zones": turbulence_zones,
        "briefing": briefing,
        "efficiency_score": efficiency_score,
        "average_velocity": round(average_velocity, 2),
        "average_altitude": round(average_altitude, 2),
        "conflict_ratio": round(conflict_ratio, 4),
        "future_conflict_ratio": round(future_conflict_ratio, 4),
    }


if __name__ == "__main__":
    print(json.dumps({"status": "placeholder", "message": "Analysis logic not yet implemented"}))
