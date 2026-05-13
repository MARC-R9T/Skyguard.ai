import sys, os

# Fix path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

if ROOT_DIR not in sys.path:
    sys.path.append(ROOT_DIR)

import time
import streamlit as st
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# VERY IMPORTANT (CORS fix)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"status": "Backend running"}

@app.post("/predict")
def predict(data: dict):
    result = predict_function(data)
    return {"result": result}

from src.data_logger import save_data
from src.data_fetcher import fetch_opensky_data
from src.data_preprocessing import clean_opensky, filter_region
from src.adsb_streamer import ADSBStreamer
from src.conflict_detector import detect_conflicts
from src.visualization import plot_with_conflicts
from src.predict import predict_next_points
from src.future_conflict_detector import detect_future_conflicts


# UI
st.set_page_config(layout="wide")
st.title("✈️ AI Air Traffic Monitoring System")

# Sidebar
mode = st.sidebar.radio("Data Source",
    ["Live (OpenSky)", "Simulation (ADS-B)"])

if "last_mode" not in st.session_state:
    st.session_state.last_mode = mode

if st.session_state.last_mode != mode:
    st.session_state.current_df = None
    st.session_state.trajectory_dict = {}
    st.session_state.last_mode = mode

    st.warning("🔄 Mode changed — resetting data")

st.write("Current Mode:", mode)
st.write("Data Source:", "OpenSky" if mode == "Live (OpenSky)" else "ADS-B Simulation")


refresh_rate = st.sidebar.slider("Refresh rate", 5, 30, 10)
max_trail = st.sidebar.slider("Trail length", 5, 50, 20)
conflict_threshold = st.sidebar.slider("Conflict distance", 5, 20, 10)

# Session state
if "trajectory_dict" not in st.session_state:
    st.session_state.trajectory_dict = {}

if "streamer" not in st.session_state or st.session_state.streamer.df.empty:
    st.session_state.streamer = ADSBStreamer("data/adsb_cleaned.csv")
    st.write("Dataset size:", len(st.session_state.streamer.df))

if "last_valid_df" not in st.session_state:
    st.session_state.last_valid_df = pd.DataFrame()

def update_trajectories(df):
    traj = st.session_state.trajectory_dict

    for _, row in df.iterrows():
        f = row["icao24"]

        if pd.isna(f):
            continue

        if f not in traj:
            traj[f] = []

        traj[f].append((row["lat"], row["lon"]))

        # keep last N points
        if len(traj[f]) > max_trail:
            traj[f] = traj[f][-max_trail:]

    return traj

# Main loop
placeholder = st.empty()

st.write("Tracked aircraft:", len(st.session_state.trajectory_dict))

# ✅ Initialize
if "last_run" not in st.session_state:
    st.session_state.last_run = 0

if "current_df" not in st.session_state:
    st.session_state.current_df = None

# ✅ Check if update needed
if time.time() - st.session_state.last_run > refresh_rate:
    st.session_state.last_run = time.time()

    try:
        if mode == "Live (OpenSky)":
            df = fetch_opensky_data()
        else:
            df = st.session_state.streamer.get_next_chunk()

        df = clean_opensky(df)

        if not df.empty:
            df = filter_region(df)
            save_data(df)

            st.session_state.current_df = df

            # 🔥 THIS BUILDS MEMORY
            st.session_state.trajectory_dict = update_trajectories(df)

    except Exception as e:
        st.error(f"Error: {e}")

# ✅ ALWAYS render UI (important)
df = st.session_state.current_df

if df is not None and not df.empty:
    conflicts = detect_conflicts(df, conflict_threshold)
    future_conflicts = detect_future_conflicts(
        st.session_state.trajectory_dict,
        predict_next_points,
        conflict_threshold
    )

    with placeholder.container():
        st.subheader(f"Flights: {len(df)}")

        fig = plot_with_conflicts(
            df,
            st.session_state.trajectory_dict,
            conflicts,
            future_conflicts
            
        )
        

        st.plotly_chart(fig, width="stretch")

        if conflicts:
            st.error(f"{len(conflicts)} conflicts detected")
        else:
            st.success("No conflicts")
        if future_conflicts:
            st.warning(f" {len(future_conflicts)} FUTURE conflicts predicted")
        else:
            st.success("No future conflicts predicted")

else:
    st.warning("Waiting for data...")

if st.sidebar.button("🔄 Refresh Now"):
    st.session_state.last_run = 0
