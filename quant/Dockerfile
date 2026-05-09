# uv-based Python build for the quant worker.
#
# Build context is the REPO ROOT (see infra/docker-compose.yml) so we can
# COPY both quant/ and shared-proto/ in one go (the runtime expects the
# generated proto stubs at shared-proto/gen/python/ relative to repo root).

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# System packages required by ccxt/akshare/asyncpg compilation paths. We
# install the minimum and clean up the apt cache to keep the image small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# ---- dependency install (cacheable) ---------------------------------------
COPY quant/pyproject.toml ./quant/
WORKDIR /workspace/quant
RUN uv sync --no-install-project --no-dev || uv sync --no-dev

# ---- copy sources ---------------------------------------------------------
WORKDIR /workspace
COPY quant/ ./quant/
COPY shared-proto/ ./shared-proto/

WORKDIR /workspace/quant
# Re-sync to install our own package now that source is present.
RUN uv sync --no-dev

EXPOSE 8000 50051

# Bind PYTHONPATH so the committed proto stubs resolve as `quant.v1`,
# `events.v1` — same as in tests.
ENV PYTHONPATH=/workspace/shared-proto/gen/python

CMD ["uv", "run", "python", "-m", "quant.main"]
