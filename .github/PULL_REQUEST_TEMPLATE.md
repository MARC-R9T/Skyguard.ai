## 📋 Pull Request Summary

<!-- Provide a concise description of what this PR does and WHY. -->

Closes # <!-- Link to issue: e.g., Closes #42 -->

---

## 🔀 Type of Change

<!-- Check all that apply -->
- [ ] 🐛 Bug fix (non-breaking change which fixes an issue)
- [ ] ✨ New feature (non-breaking change which adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] 🧹 Refactor (code quality improvement, no functional change)
- [ ] 📝 Documentation update
- [ ] 🧪 Test addition or fix
- [ ] 🔧 CI/CD or tooling change

---

## 🔍 Component(s) Changed

- [ ] FastAPI Backend (`backend/app.py`, `backend/src/`)
- [ ] LSTM / ML Models (`backend/src/predict.py`, `backend/src/train_lstm.py`)
- [ ] Conflict Detection (`backend/src/conflict_detector.py`)
- [ ] Delay Propagation (`backend/src/delay_propagation.py`)
- [ ] State Bridge (`backend/bridge.py`)
- [ ] React Frontend (`src/`)
- [ ] 3D Globe (`src/components/Globe.tsx`)
- [ ] Streamlit Dashboard (`backend/streamlit_app.py`)
- [ ] Tests (`tests/`)
- [ ] Documentation (`docs/`, `README.md`)
- [ ] Config / DevOps

---

## 🧪 How Has This Been Tested?

<!-- Describe the tests you ran to verify your changes. -->

- [ ] Ran `make test` (pytest) — all tests pass
- [ ] Ran `make lint` (flake8 + mypy) — no errors
- [ ] Manually tested the FastAPI backend (`http://localhost:8000/docs`)
- [ ] Manually tested the React frontend (`http://localhost:5173`)
- [ ] Manually tested the Streamlit dashboard
- [ ] Tested with live OpenSky data
- [ ] Tested with local ADS-B CSV simulation

---

## 📸 Screenshots (if applicable)

<!-- Before/After screenshots for UI changes. -->

| Before | After |
|---|---|
| ![before]() | ![after]() |

---

## ✅ Checklist

- [ ] My code follows the PEP8 style guide (verified with `make lint`)
- [ ] I have added/updated comments and docstrings
- [ ] I have updated `README.md` / `docs/` if needed
- [ ] My changes don't break any existing functionality
- [ ] I have not committed secrets, API keys, or `.env` files
- [ ] I have not committed large data files (>10MB) — use `.gitignore`
