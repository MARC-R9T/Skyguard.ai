import os
import time
from pathlib import Path

import pandas as pd
import requests

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
LOCAL_CSV_CACHE = {}
LIVE_FETCH_CACHE = {
    "expires_at": 0.0,
    "df": pd.DataFrame(),
    "backoff_until": 0.0,
    "last_error": None,
    "last_log": None,
}


def _normalize_columns(df):
    if df is None or df.empty:
        return pd.DataFrame()

    df = df.copy()
    df.rename(columns={
        "longitude": "lon",
        "latitude": "lat",
        "alt.1": "geo_altitude",
    }, inplace=True)
    return df


def _read_cached_csv(path):
    cache_key = str(path.resolve())
    stat = path.stat()
    stamp = (stat.st_mtime_ns, stat.st_size)
    cached = LOCAL_CSV_CACHE.get(cache_key)

    if cached and cached["stamp"] == stamp:
        return cached["df"].copy()

    df = _normalize_columns(pd.read_csv(path))
    LOCAL_CSV_CACHE[cache_key] = {
        "stamp": stamp,
        "df": df,
    }
    return df.copy()


def _log_fetch_event(message):
    if LIVE_FETCH_CACHE.get("last_log") == message:
        return

    LIVE_FETCH_CACHE["last_log"] = message
    print(message)


def load_local_snapshot():
    candidates = [
        DATA_DIR / "cleaned_data.csv",
        DATA_DIR / "opensky_log.csv",
    ]

    for path in candidates:
        if not path.exists():
            continue

        df = _read_cached_csv(path)
        if df.empty:
            continue

        sort_cols = [col for col in ("last_contact", "time_position") if col in df.columns]
        if sort_cols:
            df = df.sort_values(sort_cols)

        if "icao24" in df.columns:
            df = df.groupby("icao24", as_index=False).tail(1)

        return df.reset_index(drop=True)

    return pd.DataFrame()


def load_local_history(max_points=20, flight_ids=None):
    path = DATA_DIR / "opensky_log.csv"
    if not path.exists():
        return {}

    df = _read_cached_csv(path)
    if df.empty or "icao24" not in df.columns:
        return {}

    if flight_ids:
        allowed_ids = {str(flight_id).strip() for flight_id in flight_ids}
        df = df[df["icao24"].astype(str).str.strip().isin(allowed_ids)]

    sort_cols = [col for col in ("last_contact", "time_position") if col in df.columns]
    if sort_cols:
        df = df.sort_values(sort_cols)

    history_lookup = {}
    for icao24, group in df.groupby("icao24"):
        history = []

        for _, row in group.tail(max_points).iterrows():
            lat = row.get("lat")
            lon = row.get("lon")
            if pd.isna(lat) or pd.isna(lon):
                continue

            history.append({
                "lat": float(lat),
                "lng": float(lon),
            })

        if history:
            history_lookup[str(icao24).strip()] = history

    return history_lookup


def fetch_opensky_data(use_local_fallback=True):
    url = "https://opensky-network.org/api/states/all"
    cache_seconds = float(os.getenv("SKYGUARD_OPENSKY_CACHE_SECONDS", "30"))
    timeout_seconds = float(os.getenv("SKYGUARD_OPENSKY_TIMEOUT_SECONDS", "8"))
    failure_backoff_seconds = float(os.getenv("SKYGUARD_OPENSKY_FAILURE_BACKOFF_SECONDS", "120"))
    rate_limit_backoff_seconds = float(os.getenv("SKYGUARD_OPENSKY_RATE_LIMIT_BACKOFF_SECONDS", "600"))
    opensky_username = str(os.getenv("SKYGUARD_OPENSKY_USERNAME", "")).strip()
    opensky_password = str(os.getenv("SKYGUARD_OPENSKY_PASSWORD", "")).strip()
    now = time.time()
    cached_df = LIVE_FETCH_CACHE.get("df")

    if cache_seconds > 0 and cached_df is not None and not cached_df.empty:
        if now < LIVE_FETCH_CACHE["expires_at"]:
            return cached_df.copy()

    if now < LIVE_FETCH_CACHE.get("backoff_until", 0.0):
        _log_fetch_event("OpenSky cooldown active; serving cached/local snapshot.")
        if cached_df is not None and not cached_df.empty:
            return cached_df.copy()
        return load_local_snapshot() if use_local_fallback else pd.DataFrame()

    try:
        auth = (opensky_username, opensky_password) if opensky_username and opensky_password else None
        response = requests.get(
            url,
            timeout=timeout_seconds,
            headers={"User-Agent": "SkyGuardAI/1.0"},
            auth=auth,
        )

        if response.status_code != 200:
            retry_after = response.headers.get("Retry-After")
            retry_after_seconds = rate_limit_backoff_seconds if response.status_code == 429 else failure_backoff_seconds
            if retry_after:
                try:
                    retry_after_seconds = max(float(retry_after), retry_after_seconds)
                except ValueError:
                    pass
            LIVE_FETCH_CACHE["backoff_until"] = now + retry_after_seconds
            LIVE_FETCH_CACHE["last_error"] = f"status:{response.status_code}"
            if response.status_code == 429:
                auth_hint = " with OpenSky auth" if auth else " without OpenSky auth"
                _log_fetch_event(
                    f"OpenSky rate limited request{auth_hint}; using cached/local snapshot for {int(retry_after_seconds)}s."
                )
            else:
                _log_fetch_event(
                    f"OpenSky request failed with status {response.status_code}; using cached/local snapshot for {int(retry_after_seconds)}s."
                )
            if cached_df is not None and not cached_df.empty:
                return cached_df.copy()
            return load_local_snapshot() if use_local_fallback else pd.DataFrame()

        try:
            data = response.json()
        except Exception:
            LIVE_FETCH_CACHE["backoff_until"] = now + failure_backoff_seconds
            LIVE_FETCH_CACHE["last_error"] = "invalid-json"
            _log_fetch_event(
                f"OpenSky returned invalid JSON; using cached/local snapshot for {int(failure_backoff_seconds)}s."
            )
            if cached_df is not None and not cached_df.empty:
                return cached_df.copy()
            return load_local_snapshot() if use_local_fallback else pd.DataFrame()

        states = data.get("states", None)

        if states is None:
            LIVE_FETCH_CACHE["backoff_until"] = now + failure_backoff_seconds
            LIVE_FETCH_CACHE["last_error"] = "no-data"
            _log_fetch_event(
                f"OpenSky returned no state data; using cached/local snapshot for {int(failure_backoff_seconds)}s."
            )
            if cached_df is not None and not cached_df.empty:
                return cached_df.copy()
            return load_local_snapshot() if use_local_fallback else pd.DataFrame()

        columns = [
            "icao24", "callsign", "origin_country",
            "time_position", "last_contact",
            "lon", "lat", "alt",
            "on_ground", "velocity", "heading",
            "vertical_rate", "sensors",
            "geo_altitude", "squawk", "spi", "position_source",
        ]

        df = pd.DataFrame(states, columns=columns)
        normalized_df = _normalize_columns(df)

        if cache_seconds > 0 and not normalized_df.empty:
            LIVE_FETCH_CACHE["df"] = normalized_df.copy()
            LIVE_FETCH_CACHE["expires_at"] = now + cache_seconds
            LIVE_FETCH_CACHE["backoff_until"] = 0.0
            LIVE_FETCH_CACHE["last_error"] = None
            LIVE_FETCH_CACHE["last_log"] = None

        return normalized_df
    except Exception as e:
        LIVE_FETCH_CACHE["backoff_until"] = now + failure_backoff_seconds
        LIVE_FETCH_CACHE["last_error"] = str(e)
        _log_fetch_event(
            f"OpenSky fetch failed; using cached/local snapshot for {int(failure_backoff_seconds)}s."
        )
        if cached_df is not None and not cached_df.empty:
            return cached_df.copy()
        return load_local_snapshot() if use_local_fallback else pd.DataFrame()
