FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev curl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install official Kraken CLI (Rust binary, v0.3.0)
RUN curl -LsSf https://github.com/krakenfx/kraken-cli/releases/download/v0.3.0/kraken-cli-x86_64-unknown-linux-gnu.tar.gz \
    -o /tmp/kraken-cli.tar.gz && \
    tar -xzf /tmp/kraken-cli.tar.gz -C /tmp && \
    find /tmp -name "kraken" -type f -executable -exec cp {} /usr/local/bin/kraken \; && \
    chmod +x /usr/local/bin/kraken && \
    rm -rf /tmp/kraken-cli* && \
    kraken --version

# Install dependencies first (cached layer)
COPY pyproject.toml .
COPY src/ src/
RUN pip install --no-cache-dir .

COPY scripts/ scripts/
COPY data/ data/
COPY state/ state/
COPY artifacts/ artifacts/
RUN chmod +x scripts/start.sh

RUN mkdir -p state artifacts logs

EXPOSE 8001

CMD ["bash", "scripts/start.sh"]
