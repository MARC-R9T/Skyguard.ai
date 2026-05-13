import os
from pathlib import Path

import joblib
import numpy as np

# Keep the heavy ML predictor opt-in so the dashboard process stays stable.
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("TF_ENABLE_ONEDNN_OPTS", "0")

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MODEL_PATH = DATA_DIR / "lstm_model.keras"
SCALER_PATH = DATA_DIR / "scaler.save"
ENABLE_ML_PREDICTOR = str(os.getenv("SKYGUARD_ENABLE_ML_PREDICTOR", "0")).strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

model = None
scaler = None
assets_loaded = False
sequence_length = 5


def _ensure_assets_loaded():
    global model
    global scaler
    global assets_loaded

    if not ENABLE_ML_PREDICTOR:
        return None, None

    if assets_loaded:
        return model, scaler

    assets_loaded = True

    if MODEL_PATH.exists():
        from keras.models import load_model

        model = load_model(MODEL_PATH)

    if SCALER_PATH.exists():
        scaler = joblib.load(SCALER_PATH)

    return model, scaler


def predict_next_points(trajectory, steps=5):
    """
    trajectory: list of last N points [(lat, lon), ...]
    """
    current_model, current_scaler = _ensure_assets_loaded()

    if current_model is None or current_scaler is None:
        return []

    if len(trajectory) < sequence_length:
        return []

    traj = np.array(trajectory[-sequence_length:])

    traj_scaled = current_scaler.transform(traj)
    traj_scaled = traj_scaled.reshape(1, sequence_length, 2)

    predictions = []
    current_seq = traj_scaled.copy()

    for _ in range(steps):
        pred = current_model.predict(current_seq, verbose=0)[0]
        pred_real = current_scaler.inverse_transform([pred])[0]

        predictions.append(pred_real)

        current_seq = np.roll(current_seq, -1, axis=1)
        current_seq[0, -1] = pred

    return predictions
