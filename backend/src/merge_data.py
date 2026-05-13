import pandas as pd

def merge_datasets(trajectory_path, registry_path, output_path):
    print("🔄 Loading datasets...")

    trajectory_df = pd.read_csv(trajectory_path)
    registry_df = pd.read_csv(registry_path)

    print("📊 Trajectory rows:", len(trajectory_df))
    print("📊 Registry rows:", len(registry_df))

    # Merge on aircraft ID
    merged_df = trajectory_df.merge(
        registry_df,
        on="icao24",
        how="left"
    )

    print("✅ Merged rows:", len(merged_df))

    # Save final dataset
    merged_df.to_csv(output_path, index=False)

    print(f"💾 Saved as {output_path}")
