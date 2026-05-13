import pandas as pd
import numpy as np
from sklearn.preprocessing import MinMaxScaler
from keras.models import Sequential
from keras.layers import LSTM, Dense, Input
import joblib
import os

def train_lstm_model(data_path, model_save_path, scaler_save_path):
    print("📥 Loading data...")
    df = pd.read_csv(data_path)

    # Ensure proper sorting
    df["time"] = pd.to_datetime(df["time"], errors="coerce")
    df = df.sort_values(by=["icao24", "time"])

    # Use only required features
    features = ["lat", "lon"]
    sequence_length = 5

    X, y = [], []

    print("🔄 Creating sequences...")

    for icao in df["icao24"].unique():
        temp = df[df["icao24"] == icao]

        values = temp[features].dropna().values

        if len(values) <= sequence_length:
            continue

        for i in range(len(values) - sequence_length):
            X.append(values[i:i+sequence_length])
            y.append(values[i+sequence_length])

    X = np.array(X)
    y = np.array(y)

    print("✅ Sequences shape:", X.shape)

    if len(X) == 0:
        print("❌ No sequences generated")
        return

    # Scale data
    print("⚙️ Scaling...")
    scaler = MinMaxScaler()

    X_flat = X.reshape(-1, 2)
    X_scaled = scaler.fit_transform(X_flat).reshape(X.shape)
    y_scaled = scaler.transform(y)

    # Save scaler
    joblib.dump(scaler, scaler_save_path)

    # Model
    print("🧠 Building LSTM...")

    model = Sequential([
        Input(shape=(sequence_length, 2)),
        LSTM(64, return_sequences=True),
        LSTM(32),
        Dense(16, activation="relu"),
        Dense(2)
    ])

    model.compile(optimizer="adam", loss="mse")

    # Train
    print("🚀 Training...")
    model.fit(X_scaled, y_scaled, epochs=5, batch_size=32)

    # Save model
    model.save(model_save_path)

    print("✅ Model trained and saved")
