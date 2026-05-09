"""Runtime configuration loaded via pydantic-settings.

Read once at process start. Environment variables map 1:1 to attribute
names (case-insensitive). Defaults match the docker-compose dev stack
so `python -m quant.main` works out of the box against `infra/`.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Process-wide config. Construct lazily via :func:`get_settings`."""

    # ---- networking ---------------------------------------------------
    grpc_port: int = 50051
    http_port: int = 8000

    # ---- infra endpoints ---------------------------------------------
    redis_url: str = "redis://localhost:6379/0"
    timescale_dsn: str = "postgres://app:app@localhost:5432/finance"

    # ---- ccxt rate-limit knobs ---------------------------------------
    # See ratelimit.py for per-exchange defaults; these env vars are
    # escape-hatch overrides only.
    binance_weight_per_min: int = 1200
    okx_requests_per_2s: int = 20
    bybit_requests_per_5s: int = 600

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )


_cached: Settings | None = None


def get_settings() -> Settings:
    """Return the cached process-wide :class:`Settings` instance."""
    global _cached
    if _cached is None:
        _cached = Settings()
    return _cached
