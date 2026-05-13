import os


# You can either set these as environment variables or replace the placeholder
# strings below directly in this file.
WEATHER_API_URL = os.getenv("SKYGUARD_WEATHER_API_URL", "PASTE_YOUR_WEATHER_API_URL_HERE")
WEATHER_API_KEY = os.getenv("SKYGUARD_WEATHER_API_KEY", "PASTE_YOUR_WEATHER_API_KEY_HERE")


def _api_is_configured():
    return (
        WEATHER_API_URL
        and WEATHER_API_KEY
        and "PASTE_YOUR_WEATHER_API_URL_HERE" not in WEATHER_API_URL
        and "PASTE_YOUR_WEATHER_API_KEY_HERE" not in WEATHER_API_KEY
    )


def resolve_weather_zones(flights_df, density_cells, fallback_zones):
    """
    Integration point for a real weather provider.

    Where to put your API:
    - Replace WEATHER_API_URL and WEATHER_API_KEY above, or
    - set SKYGUARD_WEATHER_API_URL and SKYGUARD_WEATHER_API_KEY in the shell.

    Current behavior:
    - If no API is configured, it returns the telemetry-derived fallback zones.
    - If you configure an API, the same fallback zones remain active until you map
      your provider response into the structure below.
    """
    if not fallback_zones:
        return []

    if not _api_is_configured():
        return [
            {
                **zone,
                "source": "weather-api-placeholder",
                "summary": f"{zone['summary']} Add your provider key in backend/src/weather_service.py or SKYGUARD_WEATHER_API_KEY.",
            }
            for zone in fallback_zones
        ]

    # TODO:
    # 1. Call your provider with WEATHER_API_URL and WEATHER_API_KEY.
    # 2. Map your response into the same list-of-zones shape used below:
    #    {
    #      "id": "...",
    #      "kind": "weather",
    #      "lat": 0.0,
    #      "lng": 0.0,
    #      "radius_km": 250,
    #      "intensity": 0.0-1.0,
    #      "severity": "low" | "medium" | "high",
    #      "flight_count": 0,
    #      "place": "...",
    #      "zone": "...",
    #      "label": "...",
    #      "summary": "...",
    #      "source": "your-weather-provider"
    #    }
    # 3. Return that mapped list here.
    return [
        {
            **zone,
            "source": "weather-api-configured-awaiting-mapping",
            "summary": f"{zone['summary']} Weather API key detected; map your provider response inside backend/src/weather_service.py.",
        }
        for zone in fallback_zones
    ]
