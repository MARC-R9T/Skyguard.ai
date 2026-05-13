import time
from src.data_fetcher import fetch_opensky_data
from src.data_preprocessing import clean_opensky, filter_region
from src.visualization import plot_flights_with_trails

trajectory_dict = {}

def update_trajectories(df, trajectory_dict):
    for _, row in df.iterrows():
        flight = row["icao24"]

        if flight not in trajectory_dict:
            trajectory_dict[flight] = []

        trajectory_dict[flight].append((row["lat"], row["lon"]))

        # Limit trail length (important for performance)
        if len(trajectory_dict[flight]) > 20:
            trajectory_dict[flight].pop(0)

    return trajectory_dict
    
    
def run_loop():
    global trajectory_dict
    while True:
        df = fetch_opensky_data()
        df = clean_opensky(df)
        df = filter_region(df)

        trajectory_dict = update_trajectories(df, trajectory_dict)

        print("Flights:", len(df))

        # Note: This might not work as expected in a headless environment
        # plot_flights_with_trails(df, trajectory_dict)

        time.sleep(10)
