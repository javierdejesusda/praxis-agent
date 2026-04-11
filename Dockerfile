FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

# Install dependencies first (cached layer)
COPY pyproject.toml .
COPY src/ src/
RUN pip install --no-cache-dir .

COPY scripts/ scripts/
RUN chmod +x scripts/start.sh

# Copy state/artifacts if they exist (seed data)
COPY state/ state/
COPY artifacts/ artifacts/

RUN mkdir -p state artifacts logs

EXPOSE 8001

CMD ["bash", "scripts/start.sh"]
