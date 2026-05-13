import pandas as pd

columns = [
    "icao24",
    "registration",
    "manufacturer_icao",
    "manufacturer_name",
    "model",
    "typecode",
    "serial_number",
    "line_number",
    "icao_aircraft_type",
    "operator_name",
    "operator_callsign",
    "operator_icao",
    "operator_iata",
    "owner_name",
    "weight_class"
]

def clean_registry(input_path, output_path):
    df = pd.read_csv(
        input_path,
        names=columns,
        encoding="latin1",
        on_bad_lines="skip",
        low_memory=False
    )

    # Strip spaces
    df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

    # Replace empty strings with NaN
    df.replace("", pd.NA, inplace=True)

    # Clean weird characters
    df = df.replace(r'[^\x00-\x7F]+', '', regex=True)

    # Remove empty ICAO rows
    df = df.dropna(subset=["icao24"])

    print(df.head())
    print("✅ Cleaned rows:", len(df))

    # Save cleaned version
    df.to_csv(output_path, index=False)
