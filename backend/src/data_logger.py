import os
import pandas as pd

def save_data(df, file_path="data/opensky_log.csv"):
    if df is None or df.empty:
        return

    # Create folder if not exists
    os.makedirs(os.path.dirname(file_path), exist_ok=True)

    # Append mode
    if not os.path.exists(file_path):
        df.to_csv(file_path, index=False)
    else:
        df.to_csv(file_path, mode='a', header=False, index=False)
