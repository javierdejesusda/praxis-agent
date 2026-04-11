#!/usr/bin/env bash
# Start both the FastAPI backend and the live trading orchestrator.
# Used by the Railway backend service Dockerfile.

set -e

echo "Starting Praxis Agent backend..."

# Start the orchestrator in the background
python -m src.orchestrator &
ORCH_PID=$!

# Start the API server in the foreground
exec uvicorn src.api:app \
  --host 0.0.0.0 \
  --port "${PORT:-8001}" \
  --log-level info
