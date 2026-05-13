import math
from collections import defaultdict

from src.conflict_detector import haversine

EARTH_RADIUS_KM = 6371.0
KM_PER_DEGREE = 111.0


def _normalize_longitude(lon):
    return ((float(lon) + 180.0) % 360.0) - 180.0


def _bearing_from_points(start, end):
    lat1 = math.radians(start["lat"])
    lat2 = math.radians(end["lat"])
    lon1 = math.radians(start["lng"])
    lon2 = math.radians(end["lng"])
    dlon = lon2 - lon1

    x = math.sin(dlon) * math.cos(lat2)
    y = (
        math.cos(lat1) * math.sin(lat2)
        - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    )
    if abs(x) < 1e-9 and abs(y) < 1e-9:
        return None

    return (math.degrees(math.atan2(x, y)) + 360.0) % 360.0


def _project_point(lat, lng, bearing_deg, distance_km):
    if distance_km <= 0:
        return {"lat": lat, "lng": lng}

    bearing = math.radians(float(bearing_deg))
    angular_distance = distance_km / EARTH_RADIUS_KM
    lat1 = math.radians(float(lat))
    lon1 = math.radians(float(lng))

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


def predict_linear_path(history, current_lat, current_lng, heading, velocity, steps=5, step_minutes=6):
    if current_lat is None or current_lng is None:
        return []

    steps = max(int(steps), 0)
    if steps == 0:
        return []

    speed_kmh = max(float(velocity or 0.0) * 1.852, 120.0)
    base_step_distance = max(speed_kmh * (step_minutes / 60.0), 18.0)
    path = []

    recent_points = [point for point in (history or []) if "lat" in point and "lng" in point]
    current_point = {"lat": float(current_lat), "lng": _normalize_longitude(current_lng)}

    inferred_bearing = None
    inferred_distance = None
    if len(recent_points) >= 2:
        start = recent_points[-2]
        end = recent_points[-1]
        inferred_bearing = _bearing_from_points(start, end)
        observed_distance = haversine(start["lat"], start["lng"], end["lat"], end["lng"])
        if observed_distance > 0.1:
            inferred_distance = min(max(observed_distance * 0.9, base_step_distance * 0.55), base_step_distance * 1.35)

    active_bearing = inferred_bearing if inferred_bearing is not None else float(heading or 90.0)
    active_distance = inferred_distance if inferred_distance is not None else base_step_distance

    for step_index in range(steps):
        predicted = _project_point(
            current_point["lat"],
            current_point["lng"],
            active_bearing,
            active_distance,
        )
        path.append({
            "lat": round(predicted["lat"], 5),
            "lng": round(predicted["lng"], 5),
            "step": step_index + 1,
        })
        current_point = predicted
        active_distance = max(active_distance * 0.985, base_step_distance * 0.72)

    return path


def detect_future_conflicts(predictions_by_id, threshold_km=10):
    if not predictions_by_id:
        return []

    threshold_km = max(float(threshold_km), 0.1)
    cell_size_deg = max(threshold_km / KM_PER_DEGREE, 0.05)
    longitude_cells = max(int(math.ceil(360.0 / cell_size_deg)), 1)
    max_steps = max(len(path) for path in predictions_by_id.values())
    seen_pairs = set()
    future_conflicts = []

    for step_index in range(max_steps):
        grid = defaultdict(list)

        for flight_id, path in predictions_by_id.items():
            if step_index >= len(path):
                continue

            point = path[step_index]
            lat = float(point["lat"])
            lon = _normalize_longitude(point["lng"])
            lat_bucket = int(math.floor((lat + 90.0) / cell_size_deg))
            lon_bucket = int(math.floor((lon + 180.0) / cell_size_deg)) % longitude_cells

            for lat_offset in (-1, 0, 1):
                candidate_lat_bucket = lat_bucket + lat_offset
                if candidate_lat_bucket < 0:
                    continue

                for lon_offset in (-1, 0, 1):
                    bucket_key = (
                        candidate_lat_bucket,
                        (lon_bucket + lon_offset) % longitude_cells,
                    )
                    for other in grid.get(bucket_key, []):
                        pair_key = tuple(sorted((flight_id, other["id"])))
                        if pair_key in seen_pairs:
                            continue

                        distance = haversine(lat, lon, other["lat"], other["lon"])
                        if distance < threshold_km:
                            seen_pairs.add(pair_key)
                            future_conflicts.append({
                                "id1": pair_key[0],
                                "id2": pair_key[1],
                                "distance": round(distance, 3),
                                "step": step_index + 1,
                                "location": {
                                    "lat": round((lat + other["lat"]) / 2, 5),
                                    "lng": round((lon + other["lon"]) / 2, 5),
                                },
                            })

            grid[(lat_bucket, lon_bucket)].append({
                "id": flight_id,
                "lat": lat,
                "lon": lon,
            })

    return future_conflicts
