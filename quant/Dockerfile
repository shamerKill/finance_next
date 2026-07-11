# uv-based Python build for the quant worker.
#
# Build context is the REPO ROOT (see infra/docker-compose.yml) so we can
# COPY both quant/ and shared-proto/ in one go (the runtime expects the
# generated proto stubs at shared-proto/gen/python/ relative to repo root).

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
ARG APT_MIRROR=
ARG UV_INDEX_URL=https://pypi.org/simple
ENV UV_INDEX_URL=${UV_INDEX_URL}
ENV UV_HTTP_TIMEOUT=300
ENV UV_CONCURRENT_DOWNLOADS=4

# `wget` is used by the docker-compose healthcheck against /readyz. Python
# deps are installed from wheels; add compiler packages only if a pinned dep
# starts requiring source builds.
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt/lists \
    if [ -n "$APT_MIRROR" ]; then \
        sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g; s|http://deb.debian.org/debian-security|$APT_MIRROR-security|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

# ---- dependency install (cacheable) ---------------------------------------
COPY quant/pyproject.toml ./quant/
WORKDIR /workspace/quant
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-project --no-dev || uv sync --no-dev

# ---- copy sources ---------------------------------------------------------
WORKDIR /workspace
COPY quant/ ./quant/
COPY shared-proto/ ./shared-proto/

WORKDIR /workspace/quant
# Re-sync to install our own package now that source is present.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-dev

EXPOSE 8000 50051

# Bind PYTHONPATH so the committed proto stubs resolve as `quant.v1`,
# `events.v1` — same as in tests.
ENV PYTHONPATH=/workspace/shared-proto/gen/python

CMD ["uv", "run", "python", "-m", "quant.main"]
