# 🏗️ SkyGuard AI — System Architecture

This document provides a deep-dive into the technical design, module interactions, and data flow of the SkyGuard AI platform.

---

## 1. High-Level Architecture

SkyGuard AI is a **5-layer pipeline system**:

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1: Data Ingestion          (OpenSky, ADS-B, WX)   │
│  Layer 2: Preprocessing & Fusion  (Clean → Merge → Tag)  │
│  Layer 3: AI Analytics Engine     (LSTM, XGB, Conflict)  │
│  Layer 4: Application Bridge      (State Dict + FastAPI) │
│  Layer 5: User Interfaces         (3D Globe, Streamlit)  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Layer 1 — Data Ingestion

### OpenSky Network API
- **Module:** `backend/src/data_fetcher.py`
- **Endpoint:** `https://opensky-network.org/api/states/all`
- **Output:** 17-column state vector per aircraft: `[icao24, callsign, origin_country, time_position, last_contact, lon, lat, alt, on_ground, velocity, heading, vertical_rate, sensors, geo_altitude, squawk, spi, position_source]`
- **Resilience Features:**
  - In-memory cache (configurable TTL via `SKYGUARD_OPENSKY_CACHE_SECONDS`)
  - Automatic backoff on 429 (rate-limit) and 5xx responses
  - Falls back to local CSV snapshot if API is unavailable

### ADS-B Stream Simulation
- **Module:** `backend/src/adsb_streamer.py`
- **Data:** `backend/data/adsb_cleaned.csv` (~2.5 MB, pre-cleaned ADS-B records)
- **Mechanism:** Streams the CSV in time-ordered chunks to simulate live ADS-B reception

### Weather Service
- **Module:** `backend/src/weather_service.py`
- **Source:** WeatherAPI.com (key: `SKYGUARD_WEATHER_API_KEY`)
- **Output:** Wind speed, precipitation, visibility, humidity per geographic zone

---

## 3. Layer 2 — Preprocessing & Fusion

### Cleaning (`data_preprocessing.py`)
- Drops rows with null `lat`/`lon`/`icao24`
- Applies `filter_region()` to restrict data to configured bounding box
- Normalizes column names (`longitude → lon`, `latitude → lat`)

### Registry Lookup (`registry_cleaner.py`)
- Joins ICAO24 codes against `basic-ac-db.json.gz` to append aircraft metadata (type, wake turbulence category)

### Geographic Context (`geo_context.py`)
- Maps a `(lat, lon)` point to human-readable zone labels (e.g., "North Atlantic Ocean", "South Asia")
- Powers the density cell `place`, `zone`, `label`, `sector`, `macroRegion` fields

### Data Fusion (`merge_data.py`)
- Aligns flight state vectors with weather zone data and registry metadata
- Produces a unified `FlightState` object consumed by all analytics modules

---

## 4. Layer 3 — AI Analytics Engine

### 4a. LSTM Trajectory Predictor

**Files:** `backend/src/train_lstm.py`, `backend/src/predict.py`

**Architecture:**
```
Input: Sequence of 5 × [lat, lon] points
  → MinMaxScaler normalization
  → LSTM(64, return_sequences=True)
  → LSTM(32)
  → Dense(16, activation='relu')
  → Dense(2)              ← Output: next [lat, lon]
Output: N predicted [lat, lon] points (iterative multi-step)
```

**Fallback:** If model confidence is low or model is unavailable, `forecasting.py::predict_linear_path()` uses a heuristic bearing+distance extrapolation from the last 2 known positions.

### 4b. Cascade Delay Propagation

**File:** `backend/src/delay_propagation.py`

**Engine:** `external/delay_propagation/Delay_Propagation/simulation/engine.py`

**Three-model ensemble:**
| Step | Model | Input | Output |
|---|---|---|---|
| 1 | XGBoost (`xgb_base.json`) | 16 weather+traffic features | Base delay (minutes) for first flight |
| 2 | LSTM (`lstm_prop.keras`) | Historical delay sequence | Propagation delay for subsequent flights |
| 3 | Meta-Model (`meta_model.pkl`) | XGB + LSTM outputs | Blended final delay |

**Fallback:** `_simulate_delay_chain_fallback()` — pure heuristic math (wind, precipitation, congestion, turnaround).

**Explainability:** SHAP contributions via `xgb.Booster.predict(pred_contribs=True)`.

### 4c. Conflict Detection

**File:** `backend/src/conflict_detector.py`

**Algorithm:** Grid-bucket Haversine
1. Divide airspace into `(threshold_km / 111 km/deg)` degree cells
2. For each flight, check its cell and 8 adjacent cells
3. Compute full Haversine for all candidate pairs
4. Flag pairs with distance < `threshold_km` (default: 10 km)

**Complexity:** O(n) expected (grid reduces brute-force O(n²) to amortized O(n))

### 4d. Future Conflict Detection

**File:** `backend/src/future_conflict_detector.py`

- Extrapolates each flight's trajectory for N steps using the LSTM/heuristic predictor
- Applies the grid-bucket Haversine at each future step
- Returns predicted conflict pairs with step number and midpoint location

---

## 5. Layer 4 — Application Bridge

### State Manager (`bridge.py`)

- A singleton Python `dict` holding the complete current system state
- `get_complete_state()` is the single source of truth for all endpoints
- Updated continuously by `main_loop.py` in a background thread
- State keys: `states`, `conflicts`, `future_conflicts`, `analysis`, `history`

### FastAPI REST Server (`app.py`)

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Health check |
| `/flights` | GET | All current flight state vectors |
| `/conflicts` | GET | Current + future conflict pairs |
| `/dashboard` | GET | Complete state (flights + analysis + conflicts) |
| `/predict` | POST | Trajectory prediction for given lat/lon history |
| `/delay-propagation/meta` | GET | Available datasets and aircraft tails |
| `/delay-propagation/dates` | GET | Available simulation dates for a tail |
| `/delay-propagation/simulate` | POST | Run cascade delay simulation |

All `GET` data endpoints use `StreamingResponse` for low-latency chunked JSON.

---

## 6. Layer 5 — User Interfaces

### React 3D Globe (`src/components/Globe.tsx` / `GlobeOptimized.tsx`)

- Built with **Three.js** + **@react-three/fiber** + **@react-three/drei**
- Globe sphere rendered as a WebGL `SphereGeometry` with custom Earth texture
- Aircraft positions mapped from `[lat, lon]` → 3D Cartesian using D3-Geo
- Trajectory arcs drawn using `THREE.CatmullRomCurve3`
- Conflict zones rendered as pulsing sphere overlays
- Polls `/flights` every 5 seconds via `src/services/flightEngine.ts`

### Streamlit Analytics Dashboard (`backend/streamlit_app.py`)

- Connects directly to the backend bridge (no HTTP overhead)
- Renders Plotly geographic scatter maps with conflict overlays
- Session-state-based trajectory memory (accumulates N points per ICAO24)
- Live-refresh timer with user-adjustable rate slider

---

## 7. Data Flow Summary (Sequence Diagram)

```
User Browser          React Frontend        FastAPI Backend       Bridge/ML Engine
     │                      │                     │                      │
     │  Open http://localhost:5173                 │                      │
     │──────────────────────►│                     │                      │
     │                       │  GET /flights       │                      │
     │                       │────────────────────►│                      │
     │                       │                     │  get_complete_state()│
     │                       │                     │─────────────────────►│
     │                       │                     │  {states, conflicts} │
     │                       │                     │◄─────────────────────│
     │                       │◄────────────────────│                      │
     │                       │  Render Globe        │                      │
     │◄──────────────────────│                     │                      │
     │                       │                     │                      │
     │  Click flight         │                     │                      │
     │──────────────────────►│  POST /predict      │                      │
     │                       │────────────────────►│                      │
     │                       │                     │  LSTM/heuristic()    │
     │                       │                     │─────────────────────►│
     │                       │                     │  predicted points    │
     │                       │                     │◄─────────────────────│
     │                       │◄────────────────────│                      │
     │  Draw trajectory arc  │                     │                      │
     │◄──────────────────────│                     │                      │
```
