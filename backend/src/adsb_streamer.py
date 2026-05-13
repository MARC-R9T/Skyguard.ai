import pandas as pd

class ADSBStreamer:
    def __init__(self, path, chunk_size=200):
        print("📥 Loading CLEAN ADS-B dataset...")

        try:
            self.df = pd.read_csv(path)

            # Normalize columns
            self.df.columns = self.df.columns.str.strip().str.lower()

            # Ensure required columns
            required = ["icao24", "lat", "lon"]
            self.df = self.df.dropna(subset=required)

            # Sort for proper simulation
            if "time" in self.df.columns:
                self.df["time"] = pd.to_datetime(self.df["time"], errors="coerce")
                self.df = self.df.sort_values(by=["icao24", "time"])

            # Limit size
            self.df = self.df.head(50000)

        except Exception as e:
            print("❌ Error loading dataset:", e)
            self.df = pd.DataFrame()

        self.chunk_size = chunk_size
        self.index = 0

        print("✅ Records loaded:", len(self.df))


    def get_next_chunk(self):
        if self.df.empty:
            print("❌ Empty dataset!")
            return self.df

        # Loop simulation
        if self.index >= len(self.df):
            self.index = 0

        chunk = self.df.iloc[self.index:self.index + self.chunk_size]

        # 🔥 YOUR LOGIC (FIXED)
        counts = chunk["icao24"].value_counts()

        # relaxed threshold (VERY IMPORTANT)
        valid_ids = counts[counts >= 2].index

        filtered_chunk = chunk[chunk["icao24"].isin(valid_ids)]

        # ⚠️ fallback if filtering kills everything
        if filtered_chunk.empty:
            filtered_chunk = chunk

        self.index += self.chunk_size

        print("📦 Chunk size:", len(filtered_chunk))

        return filtered_chunk.reset_index(drop=True)
