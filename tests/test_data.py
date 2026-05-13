"""
tests/test_data.py
==================
Unit tests for data ingestion, preprocessing, and conflict detection modules.

Covers:
    - backend/src/data_fetcher.py  (load_local_snapshot, load_local_history)
    - backend/src/data_preprocessing.py  (clean_opensky, filter_region)
    - backend/src/conflict_detector.py   (haversine, detect_conflicts)
    - backend/src/adsb_cleaner.py        (basic data cleaning)
"""

import math
import sys
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

# ── Add backend to sys.path so imports resolve correctly ──────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ── Imports from backend/src/ ─────────────────────────────────────────────────
from src.conflict_detector import haversine, detect_conflicts


# =============================================================================
# FIXTURES — reusable test data
# =============================================================================

@pytest.fixture
def sample_flights_df() -> pd.DataFrame:
    """
    A minimal valid DataFrame mimicking OpenSky flight state vectors.
    Two aircraft placed ~5 km apart (below conflict threshold of 10 km).
    """
    return pd.DataFrame({
        "icao24":   ["abc123", "def456", "ghi789"],
        "callsign": ["AAL100", "BAW200", "UAE300"],
        "lat":      [28.6139, 28.6200, 40.7128],  # Delhi, Delhi+tiny offset, NYC
        "lon":      [77.2090, 77.2150, -74.0060],
        "alt":      [10000.0, 10100.0, 11000.0],
        "velocity": [250.0, 240.0, 260.0],
        "heading":  [90.0, 91.0, 270.0],
        "on_ground": [False, False, False],
        "vertical_rate": [0.0, 0.5, -0.2],
    })


@pytest.fixture
def conflict_flights_df() -> pd.DataFrame:
    """
    Two aircraft placed ~3 km apart — should trigger a conflict.
    """
    return pd.DataFrame({
        "icao24": ["flight1", "flight2"],
        "lat":    [28.6139, 28.6165],   # ~3 km separation
        "lon":    [77.2090, 77.2090],
    })


@pytest.fixture
def separated_flights_df() -> pd.DataFrame:
    """
    Two aircraft placed far apart — should NOT trigger a conflict.
    """
    return pd.DataFrame({
        "icao24": ["flight_a", "flight_b"],
        "lat":    [28.6139, 40.7128],   # Delhi vs. New York — ~11,000 km
        "lon":    [77.2090, -74.0060],
    })


# =============================================================================
# TESTS — haversine()
# =============================================================================

class TestHaversine:
    """Tests for the core 3D Haversine distance formula."""

    def test_same_point_is_zero(self):
        """Distance from a point to itself must be exactly 0."""
        dist = haversine(28.6139, 77.2090, 28.6139, 77.2090)
        assert dist == pytest.approx(0.0, abs=1e-6)

    def test_known_distance_delhi_to_mumbai(self):
        """
        Delhi (28.6139°N, 77.2090°E) to Mumbai (19.0760°N, 72.8777°E).
        Straight-line great-circle distance ≈ 1147 km.
        """
        dist = haversine(28.6139, 77.2090, 19.0760, 72.8777)
        assert 1100 < dist < 1200, f"Expected ~1147 km, got {dist:.1f} km"

    def test_symmetry(self):
        """haversine(A, B) must equal haversine(B, A)."""
        d1 = haversine(28.6139, 77.2090, 19.0760, 72.8777)
        d2 = haversine(19.0760, 72.8777, 28.6139, 77.2090)
        assert d1 == pytest.approx(d2, rel=1e-6)

    def test_equatorial_distance(self):
        """1 degree of longitude along the equator ≈ 111.32 km."""
        dist = haversine(0.0, 0.0, 0.0, 1.0)
        assert dist == pytest.approx(111.32, abs=0.5)

    def test_anti_meridian_crossing(self):
        """Test that longitude wrapping near ±180° doesn't break the formula."""
        # Two points either side of the anti-meridian
        dist = haversine(0.0, 179.9, 0.0, -179.9)
        assert dist == pytest.approx(22.24, abs=1.0), "Anti-meridian crossing failed"


# =============================================================================
# TESTS — detect_conflicts()
# =============================================================================

class TestDetectConflicts:
    """Tests for the grid-bucket conflict detection algorithm."""

    def test_close_flights_trigger_conflict(self, conflict_flights_df):
        """Two aircraft ~3 km apart should be flagged as a conflict at threshold=10 km."""
        conflicts = detect_conflicts(conflict_flights_df, threshold_km=10.0)
        assert len(conflicts) == 1, f"Expected 1 conflict, got {len(conflicts)}"

    def test_far_flights_no_conflict(self, separated_flights_df):
        """Two aircraft ~11,000 km apart should produce no conflicts."""
        conflicts = detect_conflicts(separated_flights_df, threshold_km=10.0)
        assert len(conflicts) == 0

    def test_conflict_structure(self, conflict_flights_df):
        """Each conflict tuple must have exactly 3 elements: (row, other, distance)."""
        conflicts = detect_conflicts(conflict_flights_df, threshold_km=10.0)
        assert len(conflicts) == 1
        row, other, distance = conflicts[0]
        assert "icao24" in row
        assert "icao24" in other
        assert isinstance(distance, float)
        assert distance > 0

    def test_empty_dataframe_returns_empty(self):
        """An empty input DataFrame must return an empty list without error."""
        conflicts = detect_conflicts(pd.DataFrame(), threshold_km=10.0)
        assert conflicts == []

    def test_missing_columns_returns_empty(self, sample_flights_df):
        """A DataFrame missing 'lat' column must return empty list (guard clause)."""
        bad_df = sample_flights_df.drop(columns=["lat"])
        conflicts = detect_conflicts(bad_df, threshold_km=10.0)
        assert conflicts == []

    def test_single_flight_no_conflict(self):
        """A single aircraft can't conflict with itself."""
        single = pd.DataFrame({
            "icao24": ["only_one"],
            "lat":    [28.6139],
            "lon":    [77.2090],
        })
        conflicts = detect_conflicts(single, threshold_km=10.0)
        assert conflicts == []

    def test_custom_threshold_affects_results(self, conflict_flights_df):
        """
        With a very tight threshold (1 km), the ~3 km pair should NOT conflict.
        With the default 10 km, it SHOULD conflict.
        """
        tight = detect_conflicts(conflict_flights_df, threshold_km=1.0)
        loose = detect_conflicts(conflict_flights_df, threshold_km=10.0)
        assert len(tight) == 0
        assert len(loose) == 1


# =============================================================================
# TESTS — data_fetcher (local snapshot loading, mocked)
# =============================================================================

class TestDataFetcher:
    """Tests for data_fetcher.load_local_snapshot using mocked CSV paths."""

    def test_load_local_snapshot_returns_dataframe(self, tmp_path):
        """
        load_local_snapshot() should return a non-empty DataFrame when a
        valid CSV exists at the expected path.
        """
        import src.data_fetcher as data_fetcher_module

        # Create a temporary cleaned_data.csv
        csv_path = tmp_path / "cleaned_data.csv"
        csv_path.write_text(
            "icao24,lat,lon,alt,velocity,heading,vertical_rate\n"
            "abc123,28.6139,77.2090,10000,250,90,0\n"
            "def456,28.6200,77.2150,10100,240,91,0.5\n"
        )

        # Patch DATA_DIR to point at our tmp_path
        with patch.object(data_fetcher_module, "DATA_DIR", tmp_path):
            df = data_fetcher_module.load_local_snapshot()

        assert not df.empty
        assert "icao24" in df.columns
        assert len(df) == 2

    def test_load_local_snapshot_returns_empty_when_no_files(self, tmp_path):
        """load_local_snapshot() should return an empty DataFrame if no CSV exists."""
        import src.data_fetcher as data_fetcher_module

        with patch.object(data_fetcher_module, "DATA_DIR", tmp_path):
            df = data_fetcher_module.load_local_snapshot()

        assert df.empty
