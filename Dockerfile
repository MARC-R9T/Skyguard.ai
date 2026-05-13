# ============================================================
#  SkyGuard AI — Dockerfile
#  Builds a single container running the FastAPI backend.
#  The React frontend is served separately (Vite dev server
#  or as static files via `npm run build`).
# ============================================================

# ── Stage 1: Python base ──────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# Set working directory inside the container
WORKDIR /app

# Prevents Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
# Ensures Python output is flushed immediately (good for Docker logs)
ENV PYTHONUNBUFFERED=1

# ── Stage 2: Install dependencies ────────────────────────────────────────────
FROM base AS builder

# Install system dependencies required for some Python packages
RUN apt-get update && apt-get install -y \
    build-essential \
    libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt .

# Install Python dependencies (no cache to keep image small)
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ── Stage 3: Application image ───────────────────────────────────────────────
FROM base AS app

# Copy installed Python packages from builder stage
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy the backend application code
COPY backend/ ./backend/
COPY external/ ./external/

# Copy configuration file
COPY config.yaml .

# Expose the FastAPI port
EXPOSE 8000

# Set the working directory to the backend
WORKDIR /app/backend

# Default command: start the FastAPI server with Uvicorn
# Override with docker run --env-file .env ... for secrets
CMD ["uvicorn", "app:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--limit-concurrency", "40", \
     "--timeout-keep-alive", "5"]
