import os
import glob
import pandas as pd



def discover_files(folder_path):
    # 🔥 Force deeper matching
    files = glob.glob(os.path.join(folder_path, "**/*.csv"), recursive=True)

    # ✅ Keep ONLY real files
    files = [f for f in files if os.path.isfile(f)]

    print(f" Total VALID files found: {len(files)}")
    print(files[:5])

    return files


def read_file(file):
    try:
        df = pd.read_csv(file, header=None)

        # Assign temporary column names
        df.columns = [f"col_{i}" for i in range(len(df.columns))]

        return df

    except Exception as e:
        print(f"❌ Skipping {file}: {e}")
        return None


def normalize_columns(df):
    if df is None or df.empty:
        return None

    try:
        # ⚠️ Based on your screenshot column positions
        lat = df["col_6"]
        lon = df["col_7"]
        alt_raw = df["col_8"]

        # Clean altitude (remove "ft")
        alt = alt_raw.astype(str).str.replace("ft", "").str.strip()
        alt = pd.to_numeric(alt, errors="coerce")

        cleaned = pd.DataFrame({
            "lat": pd.to_numeric(lat, errors="coerce"),
            "lon": pd.to_numeric(lon, errors="coerce"),
            "alt": alt,
            "icao24": df["col_1"],
            "time": df["col_0"]
        })

        cleaned = cleaned.dropna(subset=["lat", "lon"])

        return cleaned

    except Exception as e:
        print("❌ Parsing failed:", e)
        return None


def load_adsb_dataset(folder_path, limit=50000):
    files = discover_files(folder_path)

    dataframes = []

    for file in files:
        df = read_file(file)

        df = normalize_columns(df)

        if df is not None and not df.empty:
            dataframes.append(df)

        if df is not None:
            dataframes.append(df)

    if len(dataframes) == 0:
        print("❌ No usable ADS-B data found!")
        return pd.DataFrame()

    df = pd.concat(dataframes, ignore_index=True)

    print("✅ Total combined rows:", len(df))

    # Limit size
    df = df.head(limit)

    # Sort if time exists
    if "time" in df.columns:
        df = df.sort_values(by="time")

    return df
