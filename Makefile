# ============================================================
#  SkyGuard AI — Makefile
#  Provides shortcut commands for common developer tasks.
#  Usage:  make <target>
#  Note:   On Windows, install 'make' via: choco install make
#          Or use Git Bash / WSL to run these commands.
# ============================================================

# Variables
PYTHON      = python
PIP         = pip
VENV        = venv
VENV_ACT    = $(VENV)/Scripts/activate   # Windows path (Scripts vs bin on Unix)
BACKEND_DIR = backend
PORT        = 8000
FRONTEND_PORT = 5173

.PHONY: help install install-frontend install-backend \
        run run-backend run-frontend run-streamlit \
        train test lint format clean docker-build docker-up docker-down

# ============================================================
# HELP — Print available targets
# ============================================================
help:
	@echo ""
	@echo "  SkyGuard AI — Makefile Commands"
	@echo "  ================================"
	@echo "  make install         Install all frontend + backend dependencies"
	@echo "  make run             Start frontend + backend (sequential, use tmux/parallel for true parallel)"
	@echo "  make run-backend     Start the FastAPI backend on port $(PORT)"
	@echo "  make run-frontend    Start the Vite frontend on port $(FRONTEND_PORT)"
	@echo "  make run-streamlit   Start the Streamlit dashboard"
	@echo "  make train           Train the LSTM trajectory prediction model"
	@echo "  make test            Run all pytest unit tests"
	@echo "  make lint            Run flake8 linter on backend/src/"
	@echo "  make format          Format code with black + isort"
	@echo "  make clean           Remove build artifacts and caches"
	@echo "  make docker-build    Build the Docker image"
	@echo "  make docker-up       Start all services via docker-compose"
	@echo "  make docker-down     Stop all docker-compose services"
	@echo ""

# ============================================================
# INSTALL — Set up all dependencies
# ============================================================
install: install-backend install-frontend
	@echo "✅ All dependencies installed."

install-backend:
	@echo "🐍 Setting up Python virtual environment..."
	$(PYTHON) -m venv $(VENV)
	@echo "📦 Installing Python requirements..."
	$(VENV)/Scripts/pip install -r requirements.txt
	@echo "✅ Backend dependencies installed."

install-frontend:
	@echo "📦 Installing Node.js dependencies..."
	npm install
	@echo "✅ Frontend dependencies installed."

# ============================================================
# RUN — Start services
# ============================================================
run: run-backend
	@echo "⚠️  Frontend not started. Run 'make run-frontend' in a separate terminal."

run-backend:
	@echo "🚀 Starting FastAPI backend on http://localhost:$(PORT) ..."
	cd $(BACKEND_DIR) && uvicorn app:app --reload --host 0.0.0.0 --port $(PORT) \
		--limit-concurrency 40 \
		--timeout-keep-alive 5

run-frontend:
	@echo "🌐 Starting Vite frontend on http://localhost:$(FRONTEND_PORT) ..."
	npm run dev

run-streamlit:
	@echo "📊 Starting Streamlit dashboard on http://localhost:8501 ..."
	cd $(BACKEND_DIR) && streamlit run streamlit_app.py

# ============================================================
# TRAIN — Train the LSTM model
# ============================================================
train:
	@echo "🧠 Training LSTM trajectory prediction model..."
	cd $(BACKEND_DIR) && $(PYTHON) -c "\
from src.train_lstm import train_lstm_model; \
train_lstm_model( \
    data_path='data/adsb_cleaned.csv', \
    model_save_path='data/lstm_model.keras', \
    scaler_save_path='data/scaler.pkl' \
)"
	@echo "✅ Model training complete. Saved to backend/data/lstm_model.keras"

# ============================================================
# TEST — Run unit tests
# ============================================================
test:
	@echo "🧪 Running unit tests..."
	$(PYTHON) -m pytest tests/ -v --tb=short
	@echo "✅ Tests complete."

# ============================================================
# LINT — Check code style
# ============================================================
lint:
	@echo "🔍 Running flake8 linter..."
	$(PYTHON) -m flake8 $(BACKEND_DIR)/src/ --max-line-length=100 --ignore=E203,W503
	@echo "🔍 Running mypy type checker..."
	$(PYTHON) -m mypy $(BACKEND_DIR)/src/ --ignore-missing-imports
	@echo "✅ Lint complete."

# ============================================================
# FORMAT — Auto-format code
# ============================================================
format:
	@echo "✨ Formatting with black..."
	$(PYTHON) -m black $(BACKEND_DIR)/src/ --line-length=100
	@echo "✨ Sorting imports with isort..."
	$(PYTHON) -m isort $(BACKEND_DIR)/src/
	@echo "✅ Formatting complete."

# ============================================================
# CLEAN — Remove generated artifacts
# ============================================================
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf build/
	rm -rf *.egg-info/
	rm -rf .pytest_cache/
	rm -rf htmlcov/
	rm -rf .coverage
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	find . -type f -name "*.pyo" -delete 2>/dev/null || true
	@echo "✅ Clean complete."

# ============================================================
# DOCKER — Container management
# ============================================================
docker-build:
	@echo "🐳 Building Docker image..."
	docker build -t skyguard-ai:latest .
	@echo "✅ Docker image built."

docker-up:
	@echo "🐳 Starting services with docker-compose..."
	docker-compose up --build -d
	@echo "✅ Services started. Frontend: http://localhost:$(FRONTEND_PORT) | API: http://localhost:$(PORT)"

docker-down:
	@echo "🐳 Stopping docker-compose services..."
	docker-compose down
	@echo "✅ Services stopped."
