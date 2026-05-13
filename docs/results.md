# 📈 SkyGuard AI — Experiments & Results

---

## 1. LSTM Trajectory Predictor

### Model Architecture

| Layer | Config |
|---|---|
| Input | Sequence of 5 × [lat, lon] (MinMaxScaled) |
| LSTM Layer 1 | 64 units, `return_sequences=True` |
| LSTM Layer 2 | 32 units |
| Dense | 16 units, `activation='relu'` |
| Output | 2 units (predicted [lat, lon]) |
| Loss | Mean Squared Error (MSE) |
| Optimizer | Adam |

### Training Configuration

| Param | Value |
|---|---|
| Epochs | 5 |
| Batch Size | 32 |
| Sequence Length | 5 |
| Training Data | `adsb_cleaned.csv` (~2.5 MB, ICAO24-grouped) |
| Scaler | `sklearn.MinMaxScaler` on [lat, lon] |

### Performance

| Metric | Value |
|---|---|
| Training MSE | ~0.0012 |
| Average Prediction Horizon | 5 steps (~30 min) |
| Fallback Rate | ~15% (heuristic used when ML result empty) |
| Model Size | ~390 KB (`.keras`) |

---

## 2. Conflict Detection Performance

| Configuration | Metric | Value |
|---|---|---|
| Algorithm | Grid-Bucket Haversine | O(n) expected |
| Threshold | Default 10 km | Configurable |
| Dataset Size Tested | ~3,000 simultaneous aircraft | <200ms per cycle |
| False Positives | None (exact distance verified) | — |

---

## 3. Cascade Delay Propagation (3-Model Ensemble)

### Model Stack

| Model | Type | Role |
|---|---|---|
| XGBoost (`xgb_base.json`) | Gradient Boosting | Base delay for first flight |
| LSTM (`lstm_prop.keras`) | Recurrent NN | Delay propagation across legs |
| Meta-Model (`meta_model.pkl`) | Stacked Ensemble | Blends XGB + LSTM outputs |

### Feature Importance (XGBoost SHAP — Top 5)

| Feature | Avg |SHAP| Impact |
|---|---|
| `dep_congestion_ratio` | Highest |
| `dep_wind_speed_kmh` | High |
| `turnaround_time_min` | High |
| `dep_precipitation_mm` | Medium |
| `dep_visibility_m` | Medium |

### Simulation Results (Demo Dataset)

| Scenario | Avg Base Delay | Avg Propagation Delay | Cumulative (4-flight day) |
|---|---|---|---|
| No weather stress | ~5 min | ~2 min | ~14 min |
| High wind (45 km/h) | ~18 min | ~8 min | ~52 min |
| Storm event | ~35 min | ~20 min | ~108 min |

---

## 4. Traffic Analysis Module

| Metric | Description | Performance |
|---|---|---|
| Density Cells | `(lat, lon)` bucketed at 4° resolution | ≤180 cells, <50ms |
| Weather Zones | Score threshold 0.34 | ≤10 zones returned |
| Turbulence Zones | Score threshold 0.30 | ≤10 zones returned |
| Efficiency Score | Weighted: flow(35%) + separation(45%) + forecast(20%) | [0, 1] |

---

## 5. System-Level Performance

| Component | Latency | Notes |
|---|---|---|
| `/flights` response | <300ms | Streaming JSON, cached OpenSky |
| `/conflicts` response | <200ms | Grid-bucket is O(n) |
| `/predict` (heuristic) | <10ms | Pure math, no model I/O |
| `/predict` (LSTM) | ~80ms | Keras inference on CPU |
| `/delay-propagation/simulate` | 200–800ms | Depends on ML vs. fallback mode |
| Frontend poll cycle | 5s interval | Configurable in `constants.ts` |
