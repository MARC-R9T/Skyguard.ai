import pandas as pd


REGION_BOUNDS = {
    "india": {
        "lat_min": 5,
        "lat_max": 40,
        "lon_min": 60,
        "lon_max": 100,
    },
}


def clean_opensky(df):
    if df is None or df.empty:
        return pd.DataFrame()

    required_cols = ["lat", "lon", "alt"]

    if not all(col in df.columns for col in required_cols):
        return pd.DataFrame()

    df = df.dropna(subset=required_cols)

    if "on_ground" in df.columns:
        df = df[df["on_ground"] == False]

    return df.reset_index(drop=True)


def filter_region(df, region="global"):
    if df is None or df.empty:
        return pd.DataFrame()

    scope = str(region or "global").strip().lower()
    if scope in {"", "global", "world", "all"}:
        return df.reset_index(drop=True)

    bounds = REGION_BOUNDS.get(scope)
    if not bounds:
        return df.reset_index(drop=True)

    return df[
        (df["lat"] > bounds["lat_min"]) & (df["lat"] < bounds["lat_max"]) &
        (df["lon"] > bounds["lon_min"]) & (df["lon"] < bounds["lon_max"])
    ].reset_index(drop=True)
