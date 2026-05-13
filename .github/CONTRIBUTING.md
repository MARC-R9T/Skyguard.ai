# 🤝 Contributing to SkyGuard AI

Thank you for your interest in contributing! This document explains how to set up your development environment, follow our standards, and submit a pull request.

---

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Submitting a PR](#submitting-a-pr)
- [Commit Message Format](#commit-message-format)

---

## 📜 Code of Conduct

By participating, you agree to treat all contributors with respect. Be constructive, inclusive, and professional in all project communications.

---

## 🚀 Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/skyguard-ai.git
   cd skyguard-ai
   ```
3. **Install all dependencies:**
   ```bash
   make install
   ```
4. **Copy the environment file:**
   ```bash
   cp .env.example .env
   # Fill in your OpenSky + WeatherAPI credentials
   ```
5. **Create a new branch** for your work:
   ```bash
   git checkout -b feat/your-feature-name
   ```

---

## 🔄 Development Workflow

### Running the Full Stack

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — Backend API
cd backend
uvicorn app:app --reload --port 8000

# Terminal 3 — Streamlit (optional)
cd backend
streamlit run streamlit_app.py
```

### Project-Specific Notes

- **Backend state** flows through `backend/bridge.py`. Any new analytics module must publish its results to the central state dictionary via `get_complete_state()`.
- **LSTM inference** is wrapped in `backend/src/predict.py`. If you modify the model architecture in `train_lstm.py`, retrain and replace `backend/data/lstm_model.keras`.
- **Delay propagation** uses an external package in `external/delay_propagation/`. Do not modify files there directly.
- **Frontend polling** happens in `src/services/flightEngine.ts`. Adjust `POLL_INTERVAL_MS` in `src/constants.ts`.

---

## 🎨 Coding Standards

### Python (Backend)

- **Style:** PEP8 compliant, max line length 100.
- **Formatter:** `black` (`make format`)
- **Import order:** `isort` (`make format`)
- **Type hints:** Required for all public functions.
- **Docstrings:** Google-style docstrings for all public functions and classes.
- **No bare `except:`** — always catch specific exceptions.

```python
# ✅ Good
def detect_conflicts(df: pd.DataFrame, threshold_km: float = 10.0) -> list[dict]:
    """
    Detect airspace conflicts between all tracked flights.

    Args:
        df: DataFrame with columns [icao24, lat, lon].
        threshold_km: Distance threshold in kilometres for conflict classification.

    Returns:
        List of conflict dictionaries with keys [row, other, distance].
    """
    ...
```

### TypeScript (Frontend)

- **Style:** Follow existing `tsconfig.json` strictness settings.
- **Lint:** `npm run lint` (runs `tsc --noEmit`)
- **No `any` types** unless absolutely necessary (add a comment explaining why).
- **Components:** Functional components with typed props.

---

## 🧪 Testing

All contributions **must** include tests.

```bash
# Run all tests
make test

# Run a specific test file
python -m pytest tests/test_data.py -v

# Run with coverage
python -m pytest tests/ --cov=backend/src --cov-report=term-missing
```

**Test file conventions:**
- Place tests in `tests/`
- Name files `test_<module>.py`
- Name functions `test_<what_is_being_tested>`
- Mock all external API calls (OpenSky, WeatherAPI) — never hit real APIs in tests

---

## 📬 Submitting a PR

1. Ensure `make test` and `make lint` both pass.
2. Push your branch: `git push origin feat/your-feature-name`
3. Open a Pull Request on GitHub against the `main` branch.
4. Fill in the PR template completely.
5. Wait for review — we aim to respond within 2–3 days.

---

## 💬 Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

| Type | When to use |
|---|---|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation change |
| `refactor` | Code refactor (no feature/fix) |
| `test` | Adding or fixing tests |
| `chore` | Tooling, CI, dependency updates |
| `perf` | Performance improvement |

**Examples:**
```
feat(conflict): add altitude-aware 3D Haversine separation check
fix(data_fetcher): handle 503 responses from OpenSky gracefully
docs(readme): add delay propagation model performance table
test(model): add LSTM trajectory prediction unit tests
```
