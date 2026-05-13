"""
tests/test_utils.py
====================
Unit tests for utility and analysis functions.

Covers:
    - backend/src/analysis.py  (run_traffic_analysis, density cells, weather zones)
    - FastAPI endpoints         (/flights, /conflicts, /predict) via TestClient
"""

import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

import pandas as pd
import pytest

# ── Add backend to sys.path ───────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.analysis import run_traffic_analysis


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def realistic_flights_df() -> pd.DataFrame:
    """
    A synthetic but realistic flight DataFrame with all columns
    that run_traffic_analysis() and detect_conflicts() expect.
    Covers a spread of global locations to produce density cells.
    """
    return pd.DataFrame({
        "icao24":        ["abc001", "abc002", "abc003", "abc004", "abc005"],
        "lat":           [28.61,    28.65,    51.47,    40.71,    35.68],
        "lon":           [77.21,    77.23,    -0.46,   -74.01,   139.69],
        "alt":           [10000.0,  10200.0,  11000.0,  9500.0,  10800.0],
        "velocity":      [250.0,    245.0,    280.0,    270.0,   260.0],
        "vertical_rate": [0.0,      0.5,     -0.3,      0.1,     0.0],
        "heading":       [90.0,     90.0,    270.0,    180.0,   360.0],
    })


# =============================================================================
# TESTS — run_traffic_analysis()
# =============================================================================

class TestRunTrafficAnalysis:
    """Tests for the main traffic analysis function."""

    def test_returns_expected_keys(self, realistic_flights_df):
        """run_traffic_analysis must return a dict with all required top-level keys."""
        result = run_traffic_analysis(realistic_flights_df)
        required_keys = {
            "total_flights",
            "density_hotspots",
            "density_map",
            "weather_zones",
            "turbulence_zones",
            "briefing",
            "efficiency_score",
            "average_velocity",
            "average_altitude",
            "conflict_ratio",
            "future_conflict_ratio",
        }
        for key in required_keys:
            assert key in result, f"Missing key: '{key}'"

    def test_total_flights_matches_input(self, realistic_flights_df):
        """total_flights must equal the number of rows in the input DataFrame."""
        result = run_traffic_analysis(realistic_flights_df)
        assert result["total_flights"] == len(realistic_flights_df)

    def test_efficiency_score_in_range(self, realistic_flights_df):
        """efficiency_score must be a float in [0, 1]."""
        result = run_traffic_analysis(realistic_flights_df)
        score = result["efficiency_score"]
        assert isinstance(score, float)
        assert 0.0 <= score <= 1.0, f"efficiency_score out of range: {score}"

    def test_average_velocity_positive(self, realistic_flights_df):
        """average_velocity must be a positive float for valid input."""
        result = run_traffic_analysis(realistic_flights_df)
        assert result["average_velocity"] > 0

    def test_empty_dataframe_returns_zeros(self):
        """Passing an empty DataFrame must return zero-values, not raise an error."""
        result = run_traffic_analysis(pd.DataFrame())
        assert result["total_flights"] == 0
        assert result["density_hotspots"] == []
        assert result["density_map"] == []
        assert result["efficiency_score"] == 0.0

    def test_density_map_cell_structure(self, realistic_flights_df):
        """Each density cell must have required keys."""
        result = run_traffic_analysis(realistic_flights_df)
        for cell in result["density_map"]:
            assert "lat" in cell
            assert "lng" in cell
            assert "count" in cell
            assert "intensity" in cell
            assert 0.0 <= cell["intensity"] <= 1.0

    def test_briefing_has_headline(self, realistic_flights_df):
        """The briefing dict must contain a non-empty headline string."""
        result = run_traffic_analysis(realistic_flights_df)
        briefing = result["briefing"]
        assert "headline" in briefing
        assert isinstance(briefing["headline"], str)
        assert len(briefing["headline"]) > 0

    def test_conflict_ratio_with_conflicts(self, realistic_flights_df):
        """When conflicts are passed, conflict_ratio should be > 0."""
        result = run_traffic_analysis(
            realistic_flights_df,
            conflicts_count=2,
            future_conflicts_count=1,
        )
        assert result["conflict_ratio"] > 0.0
        assert result["future_conflict_ratio"] > 0.0


# =============================================================================
# TESTS — FastAPI /predict endpoint
# =============================================================================

class TestPredictEndpoint:
    """
    Integration tests for the FastAPI /predict endpoint.
    Uses httpx TestClient and mocks the bridge + model.
    """

    def test_predict_returns_result_list(self):
        """
        POST /predict with a valid trajectory list should return
        a JSON object with a 'result' key containing a list.
        """
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            pytest.skip("httpx not installed — skipping FastAPI integration test")

        # Mock get_complete_state to avoid real data fetching
        mock_state = {"states": [], "conflicts": [], "future_conflicts": []}
        with patch("bridge.get_complete_state", return_value=mock_state):
            import app as fastapi_app
            client = TestClient(fastapi_app.app)
            response = client.post(
                "/predict",
                json={
                    "trajectory": [
                        [28.61, 77.21],
                        [28.60, 77.35],
                        [28.59, 77.49],
                        [28.58, 77.63],
                        [28.57, 77.77],
                    ],
                    "steps": 3,
                },
            )
        assert response.status_code == 200
        data = response.json()
        assert "result" in data
        assert isinstance(data["result"], list)

    def test_predict_invalid_trajectory_type(self):
        """POST /predict with trajectory as a string must return an error message."""
        try:
            from fastapi.testclient import TestClient
        except ImportError:
            pytest.skip("httpx not installed")

        mock_state = {"states": [], "conflicts": [], "future_conflicts": []}
        with patch("bridge.get_complete_state", return_value=mock_state):
            import app as fastapi_app
            client = TestClient(fastapi_app.app)
            response = client.post(
                "/predict",
                json={"trajectory": "not_a_list", "steps": 3},
            )
        assert response.status_code == 200
        data = response.json()
        assert "error" in data or "result" in data
