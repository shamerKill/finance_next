# quant — finance_next Python worker

Phase 2 deliverable: OHLCV ingestion (ccxt + AKShare) over gRPC, with
TimescaleDB persistence and Redis Stream event emission. Backtests
(Phase 3) and Optuna+Claude optimization (Phase 6) build on this.

## Quickstart

```bash
cd quant

# Install deps (uv reads pyproject.toml).
uv sync

# Run the FastAPI healthz + grpc.aio server.
uv run python -m quant.main

# Run the Arq worker (separate process).
uv run arq quant.workers.settings.WorkerSettings

# Tests (offline; no real exchange or DB calls).
uv run pytest -q
```

## Layout

```
src/quant/
├── main.py            # FastAPI + gRPC bootstrap (lifespan)
├── grpc_server.py     # QuantServicer — implements quant.v1.Quant
├── config.py          # pydantic-settings env loader
├── ratelimit.py       # async TokenBucket + per-exchange registry
├── data/
│   ├── ccxt_source.py    # ccxt-async wrapper, paginated OHLCV
│   ├── akshare_source.py # AKShare wrapper (CSI300 daily)
│   ├── timescale.py      # asyncpg pool + upsert/query
│   └── symbols.py        # hardcoded Phase-2 symbol universe
├── events/redis_stream.py  # OhlcvIngested producer
└── workers/
    ├── ingest.py      # run_ingest() — used by RPC + Arq alike
    └── settings.py    # Arq WorkerSettings
```

## Generated stubs

The committed proto stubs at `shared-proto/gen/python/` are added to
`PYTHONPATH` automatically by `quant.main` and `tests/conftest.py`.
