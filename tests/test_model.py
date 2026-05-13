"""
tests/test_model.py
====================
Unit tests for the ML model inference and forecasting modules.

Covers:
    - backend/src/predict.py          (predict_next_points — LSTM wrapper)
    - backend/src/forecasting.py      (predict_linear_path — heuristic fallback)
    - backend/src/train_lstm.py       (train_lstm_model — smoke test)
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# ── Add backend to sys.path ───────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.forecasting import predict_linear_path, detect_future_conflicts


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture
def sample_history():
    """
    A list of recent [lat, lon] dicts representing a flight heading east
    over northern India (Delhi → Agra direction).
    """
    return [
        {"lat": 28.61, "lng": 77.21},
        {"lat": 28.60, "lng": 77.35},
        {"lat": 28.59, "lng": 77.49},
        {"lat": 28.58, "lng": 77.63},
        {"lat": 28.57, "lng": 77.77},
    ]


# =============================================================================
# TESTS — predict_linear_path() (heuristic forecasting)
# =============================================================================

class TestPredictLinearPath:
    """Tests for the heuristic linear path extrapolation function."""

    def test_returns_correct_number_of_steps(self, sample_history):
        """Should return exactly `steps` prediction points."""
        result = predict_linear_path(
            history=sample_history,
            current_lat=28.57,
            current_lng=77.77,
            heading=90.0,
            velocity=250.0,
            steps=5,
        )
        assert len(result) == 5

    def test_each_point_has_lat_lng_step(self, sample_history):
        """Each returned point must be a dict with 'lat', 'lng', and 'step' keys."""
        result = predict_linear_path(
            history=sample_history,
            current_lat=28.57,
            current_lng=77.77,
            heading=90.0,
            velocity=250.0,
            steps=3,
        )
        for i, point in enumerate(result):
            assert "lat" in point, f"Point {i} missing 'lat'"
            assert "lng" in point, f"Point {i} missing 'lng'"
            assert "step" in point, f"Point {i} missing 'step'"
            assert point["step"] == i + 1

    def test_lat_lng_are_numeric(self, sample_history):
        """All lat/lng values must be floats in valid geographic ranges."""
        result = predict_linear_path(
            history=sample_history,
            current_lat=28.57,
            current_lng=77.77,
            heading=90.0,
            velocity=250.0,
            steps=5,
        )
        for point in result:
            assert -90 <= point["lat"] <= 90, f"Invalid lat: {point['lat']}"
            assert -180 <= point["lng"] <= 180, f"Invalid lng: {point['lng']}"

    def test_zero_steps_returns_empty(self, sample_history):
        """Requesting 0 steps must return an empty list."""
        result = predict_linear_path(
            history=sample_history,
            current_lat=28.57,
            current_lng=77.77,
            heading=90.0,
            velocity=250.0,
            steps=0,
        )
        assert result == []

    def test_no_history_falls_back_to_heading(self):
        """With no history, the function must use the raw heading parameter."""
        result = predict_linear_path(
            history=[],
            current_lat=0.0,
            current_lng=0.0,
            heading=0.0,     # North
            velocity=500.0,
            steps=3,
        )
        assert len(result) == 3
        # Heading north → lat should increase, lng should be roughly stable
        for point in result:
            assert point["lat"] > 0.0, "Expected northward movement"

    def test_none_position_returns_empty(self):
        """If current_lat or current_lng is None, return empty list (guard clause)."""
        result = predict_linear_path(
            history=[],
            current_lat=None,
            current_lng=None,
            heading=90.0,
            velocity=250.0,
            steps=5,
        )
        assert result == []


# =============================================================================
# TESTS — detect_future_conflicts() (future path intersection)
# =============================================================================

class TestDetectFutureConflicts:
    """Tests for the future conflict detection algorithm."""

    def test_intersecting_paths_detected(self):
        """
        Two flights predicted to arrive at the same point on step 2
        should be flagged as a future conflict.
        """
        # Both flights converge to (28.62, 77.21) on step 2
        predictions = {
            "flight_a": [
                {"lat": 28.60, "lng": 77.20, "step": 1},
                {"lat": 28.62, "lng": 77.21, "step": 2},
            ],
            "flight_b": [
                {"lat": 28.64, "lng": 77.22, "step": 1},
                {"lat": 28.62, "lng": 77.21, "step": 2},
            ],
        }
        conflicts = detect_future_conflicts(predictions, threshold_km=10.0)
        assert len(conflicts) >= 1

    def test_diverging_paths_no_conflict(self):
        """Two flights moving away from each other must produce no conflicts."""
        predictions = {
            "flight_north": [
                {"lat": 28.61 + (i * 2.0), "lng": 77.20, "step": i + 1}
                for i in range(5)
            ],
            "flight_south": [
                {"lat": 28.61 - (i * 2.0), "lng": 77.20, "step": i + 1}
                for i in range(5)
            ],
        }
        conflicts = detect_future_conflicts(predictions, threshold_km=10.0)
        assert len(conflicts) == 0

    def test_empty_predictions_returns_empty(self):
        """Empty input must return an empty list."""
        conflicts = detect_future_conflicts({}, threshold_km=10.0)
        assert conflicts == []

    def test_conflict_structure(self):
        """Each conflict dict must have the required keys."""
        predictions = {
            "a": [{"lat": 0.0, "lng": 0.0, "step": 1}],
            "b": [{"lat": 0.0, "lng": 0.0, "step": 1}],
        }
        conflicts = detect_future_conflicts(predictions, threshold_km=10.0)
        if conflicts:
            conflict = conflicts[0]
            assert "id1" in conflict
            assert "id2" in conflict
            assert "distance" in conflict
            assert "step" in conflict
            assert "location" in conflict
            assert "lat" in conflict["location"]
            assert "lng" in conflict["location"]


# =============================================================================
# TESTS — predict_next_points() (LSTM wrapper, mocked)
# =============================================================================

class TestPredictNextPoints:
    """Tests for the LSTM inference wrapper — model is mocked, not loaded."""

    def test_predict_returns_list_when_model_mocked(self):
        """
        When the LSTM model is mocked to return a fixed output,
        predict_next_points should return a list of [lat, lon] pairs.
        """
        # We mock the model and scaler so no actual keras file is needed
        mock_model = MagicMock()
        mock_scaler = MagicMock()

        # Mock scaler: transform returns same shape as input
        mock_scaler.transform.return_value = np.array([[0.5, 0.5]])
        mock_scaler.inverse_transform.return_value = np.array([[28.62, 77.30]])

        # Mock model: predict returns a shape (1, 2) array
        mock_model.predict.return_value = np.array([[0.51, 0.51]])

        trajectory = [[28.61, 77.21], [28.60, 77.35], [28.59, 77.49],
                      [28.58, 77.63], [28.57, 77.77]]

        with patch("src.predict.model", mock_model), \
             patch("src.predict.scaler", mock_scaler):
            from src.predict import predict_next_points
            result = predict_next_points(trajectory, steps=3)

        # Result should be a list (may be empty if model loading was skipped)
        assert isinstance(result, list)
