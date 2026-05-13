import math
from collections import defaultdict


EARTH_RADIUS_KM = 6371.0
KM_PER_DEGREE = 111.0


def haversine(lat1, lon1, lat2, lon2):
    lat1 = math.radians(float(lat1))
    lon1 = math.radians(float(lon1))
    lat2 = math.radians(float(lat2))
    lon2 = math.radians(float(lon2))

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.asin(math.sqrt(a))

    return EARTH_RADIUS_KM * c


def _normalize_longitude(lon):
    return ((float(lon) + 180.0) % 360.0) - 180.0


def detect_conflicts(df, threshold_km=10):
    if df is None or df.empty or not {"icao24", "lat", "lon"}.issubset(df.columns):
        return []

    threshold_km = max(float(threshold_km), 0.1)
    cell_size_deg = max(threshold_km / KM_PER_DEGREE, 0.05)
    longitude_cells = max(int(math.ceil(360.0 / cell_size_deg)), 1)

    conflicts = []
    grid = defaultdict(list)

    for row in df[["icao24", "lat", "lon"]].to_dict("records"):
        lat = float(row["lat"])
        lon = _normalize_longitude(row["lon"])
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
                    distance = haversine(lat, lon, other["lat"], other["lon"])
                    if distance < threshold_km:
                        conflicts.append((row, other, distance))

        grid[(lat_bucket, lon_bucket)].append({
            "icao24": str(row["icao24"]).strip(),
            "lat": lat,
            "lon": lon,
        })

    return conflicts
