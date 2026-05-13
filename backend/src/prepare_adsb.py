import pandas as pd
from src.adsb_dataprocessor import load_adsb_dataset

def prepare_adsb_data(input_folder, output_path):
    # Load from folder
    df = load_adsb_dataset(input_folder)

    if df.empty:
        print("❌ No ADS-B data loaded")
        return

    # Clean
    df = df.dropna(subset=["lat", "lon"])

    # Sort
    if "time" in df.columns:
        df = df.sort_values(by=["icao24", "time"])
    else:
        df = df.sort_values(by=["icao24"])

    # Remove duplicates
    df = df.drop_duplicates(subset=["icao24", "lat", "lon"])

    # Save clean dataset
    df.to_csv(output_path, index=False)

    print("✅ ADS-B cleaned dataset ready")
    print("Rows:", len(df))
