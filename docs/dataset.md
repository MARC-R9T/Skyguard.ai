# 📊 SkyGuard AI — Dataset Documentation

Detailed description of all data sources, schemas, and preprocessing steps.

---

## 1. OpenSky Network — Live Flight States

**Source:** [https://opensky-network.org](https://opensky-network.org)
**Endpoint:** `GET https://opensky-network.org/api/states/all`

### Schema (17 columns)

| Column | Type | Description |
|---|---|---|
| `icao24` | string | Unique ICAO 24-bit hex address |
| `callsign` | string | Flight callsign |
| `origin_country` | string | Country of registration |
| `lat` | float | WGS84 latitude (degrees) |
| `lon` | float | WGS84 longitude (degrees) |
| `alt` | float | Barometric altitude (metres) |
| `velocity` | float | Ground speed (m/s) |
| `heading` | float | True track (degrees from north) |
| `vertical_rate` | float | Vertical rate (m/s) |
| `on_ground` | bool | True if on ground |
| `geo_altitude` | float | GPS altitude (metres) |

---

## 2. Local ADS-B Files (`backend/data/`)

| File | Size | Description |
|---|---|---|
| `raw_adsb.csv` | ~56 MB | Raw decoded 1090 MHz ADS-B messages |
| `adsb_cleaned.csv` | ~2.5 MB | Noise-filtered, NaN-dropped ADS-B records |
| `cleaned_data.csv` | ~64 KB | OpenSky snapshot after `clean_opensky()` + `filter_region()` |
| `opensky_log.csv` | ~586 KB | Timestamped API fetch log for trajectory replay |

---

## 3. Aircraft Registry

**Source:** [OpenSky Aircraft Database](https://opensky-network.org/aircraft-database)
**File:** `backend/data/basic-ac-db (1).json.gz` (~15 MB compressed)

Used to append aircraft type, registration, and manufacturer metadata to each ICAO24.

---

## 4. Delay Propagation Dataset

**Demo CSV:** `external/delay_propagation/Delay_Propagation/aviation_industry_demo_dataset.csv`

| Column | Description |
|---|---|
| `aircraft_tail` | Aircraft identifier (label-encoded) |
| `scheduled_departure` | Scheduled takeoff datetime |
| `scheduled_arrival` | Scheduled landing datetime |
| `origin_iata` | Origin airport (label-encoded) |
| `destination_iata` | Destination airport (label-encoded) |
| `distance_km` | Route distance |
| `dep_wind_speed_kmh` | Departure wind speed |
| `dep_precipitation_mm` | Precipitation at departure |
| `dep_visibility_m` | Visibility at departure |
| `dep_congestion_ratio` | Airport congestion [0, 1] |
| `turnaround_time_min` | Ground time between flights |

---

## 5. Pre-trained Models

| File | Description |
|---|---|
| `backend/data/lstm_model.keras` | LSTM trajectory predictor |
| `backend/data/scaler.pkl` | MinMaxScaler for lat/lon |
| `external/.../xgb_base.json` | XGBoost base delay model |
| `external/.../lstm_prop.keras` | LSTM delay propagation model |
| `external/.../meta_model.pkl` | Stacked ensemble combiner |

---

## 6. Preprocessing Pipeline

```
raw_adsb.csv → adsb_cleaner.py → adsb_cleaned.csv
                                        │
                          data_preprocessing.py (filter_region, clean)
                                        │
                              merge_data.py ←── weather + registry
                                        │
                               FlightState DataFrame
                              /         |         \
                       analysis.py  conflict.py  predict.py
```
