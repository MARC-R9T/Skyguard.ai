import pandas as pd
import os

def parse_adsb_file(file_path):
    data = []

    df = pd.read_csv(
        file_path,
        header=None,
        encoding="latin1",
        on_bad_lines="skip"
    )

    for _, row in df.iterrows():
        try:
            # Extract by POSITION (based on your data pattern)
            date = str(row[0]).strip()
            time = str(row[1]).strip()
            icao24 = str(row[2]).strip()

            lat = float(row[7])
            lon = float(row[8])

            # Combine date + time
            timestamp = f"{date} {time}"

            data.append({
                "icao24": icao24,
                "lat": lat,
                "lon": lon,
                "time": timestamp
            })

        except:
            continue

    return pd.DataFrame(data)


def load_adsb_folder(folder_path):
    all_data = []

    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.endswith(".csv"):
                full_path = os.path.join(root, file)
                print(f"📂 Processing {file}")

                df = parse_adsb_file(full_path)

                if not df.empty:
                    all_data.append(df)

    if not all_data:
        return pd.DataFrame()

    return pd.concat(all_data, ignore_index=True)
