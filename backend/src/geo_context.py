import math


HUBS = [
    {"name": "Delhi NCR", "country": "India", "zone": "North India corridor", "lat": 28.5562, "lng": 77.1},
    {"name": "Mumbai", "country": "India", "zone": "West India corridor", "lat": 19.0896, "lng": 72.8656},
    {"name": "Bengaluru", "country": "India", "zone": "South India corridor", "lat": 13.1986, "lng": 77.7066},
    {"name": "Hyderabad", "country": "India", "zone": "Deccan corridor", "lat": 17.2403, "lng": 78.4294},
    {"name": "Chennai", "country": "India", "zone": "Bay of Bengal corridor", "lat": 12.9941, "lng": 80.1709},
    {"name": "Kolkata", "country": "India", "zone": "East India corridor", "lat": 22.6547, "lng": 88.4467},
    {"name": "Dubai", "country": "United Arab Emirates", "zone": "Gulf corridor", "lat": 25.2532, "lng": 55.3657},
    {"name": "Doha", "country": "Qatar", "zone": "Gulf corridor", "lat": 25.2731, "lng": 51.6081},
    {"name": "Istanbul", "country": "Turkey", "zone": "Europe-Asia connector", "lat": 41.2753, "lng": 28.7519},
    {"name": "Singapore", "country": "Singapore", "zone": "Southeast Asia connector", "lat": 1.3644, "lng": 103.9915},
    {"name": "Bangkok", "country": "Thailand", "zone": "Southeast Asia connector", "lat": 13.69, "lng": 100.7501},
    {"name": "Hong Kong", "country": "China", "zone": "South China corridor", "lat": 22.308, "lng": 113.9185},
    {"name": "Tokyo", "country": "Japan", "zone": "Japan corridor", "lat": 35.5494, "lng": 139.7798},
    {"name": "London", "country": "United Kingdom", "zone": "Western Europe corridor", "lat": 51.47, "lng": -0.4543},
    {"name": "Paris", "country": "France", "zone": "Western Europe corridor", "lat": 49.0097, "lng": 2.5479},
    {"name": "New York", "country": "United States", "zone": "North Atlantic connector", "lat": 40.6413, "lng": -73.7781},
    {"name": "Los Angeles", "country": "United States", "zone": "Pacific coast corridor", "lat": 33.9416, "lng": -118.4085},
    {"name": "Sydney", "country": "Australia", "zone": "Australia east corridor", "lat": -33.9399, "lng": 151.1753},
]


def haversine_km(lat1, lon1, lat2, lon2):
    radius_km = 6371.0
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
    return radius_km * c


def _sector_label(lat, lng):
    lat_suffix = "N" if lat >= 0 else "S"
    lng_suffix = "E" if lng >= 0 else "W"
    return f"{abs(lat):.0f}{lat_suffix} / {abs(lng):.0f}{lng_suffix}"


def infer_macro_region(lat, lng):
    if -10 <= lat <= 38 and 60 <= lng <= 100:
        return "India and Bay of Bengal"
    if 10 <= lat <= 35 and 40 <= lng <= 60:
        return "Arabian Gulf"
    if -10 <= lat <= 30 and 95 <= lng <= 130:
        return "Southeast Asia"
    if 20 <= lat <= 55 and 95 <= lng <= 150:
        return "East Asia"
    if 35 <= lat <= 65 and -10 <= lng <= 40:
        return "Europe"
    if 10 <= lat <= 45 and -130 <= lng <= -60:
        return "North America"
    if -45 <= lat <= 15 and -85 <= lng <= -35:
        return "South America"
    if -40 <= lat <= 35 and -20 <= lng <= 55:
        return "Africa"
    if -50 <= lat <= -5 and 110 <= lng <= 180:
        return "Australia and Oceania"
    return "Open ocean corridor"


def resolve_location_context(lat, lng, country_hint=None):
    closest_hub = None
    closest_distance = float("inf")

    for hub in HUBS:
        distance = haversine_km(lat, lng, hub["lat"], hub["lng"])
        if distance < closest_distance:
            closest_distance = distance
            closest_hub = hub

    sector = _sector_label(lat, lng)
    macro_region = infer_macro_region(lat, lng)

    if closest_hub and closest_distance <= 420:
        place = f"{closest_hub['name']}, {closest_hub['country']}"
        zone = closest_hub["zone"]
    elif country_hint:
        place = f"{country_hint} airspace"
        zone = macro_region
    else:
        place = macro_region
        zone = macro_region

    return {
        "place": place,
        "zone": zone,
        "sector": sector,
        "label": f"{place} ({sector})",
        "macroRegion": macro_region,
    }
