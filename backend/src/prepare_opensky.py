import pandas as pd

def prepare_opensky_data(input_path, output_path):
    df = pd.read_csv(input_path)

    # 🔍 Detect time column
    if "time" in df.columns:
        time_col = "time"
    elif "time_position" in df.columns:
        time_col = "time_position"
    elif "last_contact" in df.columns:
        time_col = "last_contact"
    else:
        time_col = None

    # Drop invalid rows
    df = df.dropna(subset=["lat", "lon"])

    # Remove duplicates safely
    subset_cols = ["icao24", "lat", "lon"]
    if time_col:
        subset_cols.append(time_col)

    df = df.drop_duplicates(subset=subset_cols)

    # Sort if time exists
    if time_col:
        df = df.sort_values(by=["icao24", time_col])
    else:
        df = df.sort_values(by=["icao24"])

    df.to_csv(output_path, index=False)

    print("✅ Clean dataset ready")
    print("Columns used:", df.columns)
