# 📚 SkyGuard AI — API Reference

Complete documentation for all FastAPI REST endpoints and key Python module functions.

---

## FastAPI REST Endpoints

**Base URL:** `http://localhost:8000`

**Interactive Docs:** `http://localhost:8000/docs` (Swagger UI)

---

### `GET /`
Health check endpoint.

**Response:**
```json
{ "status": "Backend running" }
```

---

### `GET /flights`
Returns all currently tracked flight state vectors.

**Response:** Streaming JSON array of flight state objects.

```json
[
  {
    "icao24": "abc123",
    "callsign": "AAL100",
    "origin_country": "United States",
    "lat": 28.6139,
    "lon": 77.2090,
    "alt": 10000.5,
    "velocity": 250.3,
    "heading": 90.0,
    "vertical_rate": 0.0,
    "on_ground": false,
    "geo_altitude": 10200.0
  }
]
```

**Headers:** `Cache-Control: no-store`, `Connection: close`

---

### `GET /conflicts`
Returns currently detected and predicted airspace conflicts.

**Response:**
```json
{
  "conflicts": [
    {
      "icao24_a": "abc123",
      "icao24_b": "def456",
      "distance_km": 4.7,
      "lat": 28.615,
      "lon": 77.210
    }
  ],
  "future_conflicts": [
    {
      "id1": "ghi789",
      "id2": "jkl012",
      "distance": 3.2,
      "step": 2,
      "location": { "lat": 28.620, "lng": 77.215 }
    }
  ]
}
```

---

### `GET /dashboard`
Returns the full system state snapshot (flights + analytics + conflicts + briefing).

**Response:** Complete state dict. See `bridge.py::get_complete_state()` for full schema.

---

### `POST /predict`
Predict the next N spatial coordinates for a flight given its recent trajectory.

**Request Body:**
```json
{
  "trajectory": [
    [28.61, 77.21],
    [28.60, 77.35],
    [28.59, 77.49],
    [28.58, 77.63],
    [28.57, 77.77]
  ],
  "steps": 5
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `trajectory` | `list[[lat, lon]]` | ✅ | Ordered list of recent `[lat, lon]` pairs |
| `steps` | `int` | ❌ (default: 5) | Number of future points to predict |

**Response:**
```json
{
  "result": [
    { "lat": 28.56, "lng": 77.91 },
    { "lat": 28.55, "lng": 78.05 },
    { "lat": 28.54, "lng": 78.19 },
    { "lat": 28.53, "lng": 78.33 },
    { "lat": 28.52, "lng": 78.47 }
  ]
}
```

**Prediction mode** is controlled by `SKYGUARD_PREDICTION_MODE` env var:
- `"heuristic"` → Linear bearing extrapolation only
- `"ml"` → LSTM model only
- `"hybrid"` → LSTM first, heuristic fallback if result is empty

---

### `GET /delay-propagation/meta`
Get available dataset modes and aircraft tails for the delay simulation.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `mode` | `string` | `"demo"` | Dataset to use: `"demo"` or `"full"` |

**Response:**
```json
{
  "modes": [
    { "value": "demo", "label": "Demo Dataset" },
    { "value": "full", "label": "Full Dataset" }
  ],
  "mode": "demo",
  "tails": [
    { "value": "0", "label": "N12345" },
    { "value": "1", "label": "N67890" }
  ],
  "default_tail": "0"
}
```

---

### `GET /delay-propagation/dates`
Get available simulation dates for a specific aircraft tail.

**Query Parameters:**

| Param | Type | Description |
|---|---|---|
| `mode` | `string` | Dataset mode (`demo` or `full`) |
| `tail` | `string` | Aircraft tail identifier value |

**Response:**
```json
{
  "mode": "demo",
  "tail": "0",
  "tail_label": "N12345",
  "dates": ["2024-01-15", "2024-01-16", "2024-01-17"],
  "default_date": "2024-01-15",
  "defaults": {
    "wind_speed_kmh": 15.0,
    "precipitation_mm": 0.0,
    "visibility_m": 8000.0
  }
}
```

---

### `POST /delay-propagation/simulate`
Run the full cascade delay propagation simulation for a specific aircraft and date.

**Request Body:**
```json
{
  "mode": "demo",
  "tail": "0",
  "date": "2024-01-15",
  "overrides": {
    "wind_speed_kmh": 45.0,
    "precipitation_mm": 12.0,
    "visibility_m": 3000.0
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | `string` | ❌ | Dataset: `"demo"` or `"full"` |
| `tail` | `string` | ❌ | Aircraft tail identifier |
| `date` | `string` | ❌ | Simulation date (`YYYY-MM-DD`) |
| `overrides` | `object` | ❌ | Override weather for the first flight only |

**Response:**
```json
{
  "engine_mode": "ml",
  "mode": "demo",
  "tail": "0",
  "tail_label": "N12345",
  "selected_date": "2024-01-15",
  "summary": {
    "total_flights": 4,
    "cumulative_delay": 87.4,
    "max_delay": 34.2,
    "average_delay": 21.8
  },
  "timeline": [...],
  "flights": [
    {
      "id": "delay-flight-1",
      "sequence": 1,
      "route": "DEL -> BOM",
      "base_delay": 12.3,
      "propagation_delay": 5.4,
      "spill_delay": 0.0,
      "final_delay": 17.7,
      "cumulative_delay": 17.7,
      "drivers": [
        {
          "feature": "dep_wind_speed_kmh",
          "label": "Wind speed",
          "impact": 6.2,
          "direction": "increase",
          "value": "45.0"
        }
      ]
    }
  ]
}
```

---

## Key Python Module Functions

### `backend/src/conflict_detector.py`

#### `haversine(lat1, lon1, lat2, lon2) → float`
Compute great-circle distance between two geographic coordinates.

| Param | Type | Description |
|---|---|---|
| `lat1, lon1` | `float` | First point coordinates (degrees) |
| `lat2, lon2` | `float` | Second point coordinates (degrees) |

**Returns:** Distance in kilometres.

#### `detect_conflicts(df, threshold_km=10) → list[tuple]`
Detect all conflicting flight pairs using grid-bucket spatial indexing.

| Param | Type | Description |
|---|---|---|
| `df` | `pd.DataFrame` | Must have columns: `icao24`, `lat`, `lon` |
| `threshold_km` | `float` | Distance threshold for conflict classification |

**Returns:** List of `(row_dict, other_dict, distance_km)` tuples.

---

### `backend/src/forecasting.py`

#### `predict_linear_path(history, current_lat, current_lng, heading, velocity, steps=5, step_minutes=6) → list[dict]`
Heuristic trajectory extrapolation using bearing and speed.

**Returns:** List of `{"lat": float, "lng": float, "step": int}` dicts.

#### `detect_future_conflicts(predictions_by_id, threshold_km=10) → list[dict]`
Detect predicted path intersections across multiple future steps.

**Returns:** List of conflict dicts with `id1`, `id2`, `distance`, `step`, `location`.

---

### `backend/src/analysis.py`

#### `run_traffic_analysis(flights_df, conflicts_count=0, future_conflicts_count=0) → dict`
Compute all traffic analytics from a flight state DataFrame.

**Returns:** Dict with `total_flights`, `density_map`, `weather_zones`, `turbulence_zones`, `briefing`, `efficiency_score`, `average_velocity`, `average_altitude`, `conflict_ratio`, `future_conflict_ratio`.

---

### `backend/src/delay_propagation.py`

#### `get_delay_metadata(mode=None) → dict`
Load dataset metadata (available modes, aircraft tails).

#### `get_delay_tail_dates(mode, tail_value) → dict`
Get simulation dates for a specific aircraft tail.

#### `simulate_delay_propagation(mode, tail_value, date_value, overrides) → dict`
Run the full cascade delay simulation. Returns `timeline`, `flights`, and `summary`.
