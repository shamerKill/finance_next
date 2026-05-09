"""Symbol universe — Phase 5 canonical form.

Internal representation is the ccxt unified market id (e.g.
``BTC/USDT:USDT`` for USDT-margined perpetuals). The per-venue native
forms used at the upstream call boundary are derived from ``CANONICAL``
via :func:`to_native`.

Phase 3+ may replace the hardcoded list with dynamic discovery via
ccxt's ``markets`` endpoint; for now this keeps the top-10 list explicit
so local dev runs without an extra HTTP round-trip.
"""

from __future__ import annotations

# Canonical (ccxt-unified) USDT-perp top-10. The Go gateway and the
# quant worker both round-trip through this form when crossing
# inter-service boundaries (gRPC / Redis events).
CANONICAL_TOP10_USDT_PERP: list[str] = [
    "BTC/USDT:USDT", "ETH/USDT:USDT", "BNB/USDT:USDT", "SOL/USDT:USDT",
    "XRP/USDT:USDT", "DOGE/USDT:USDT", "ADA/USDT:USDT", "TRX/USDT:USDT",
    "AVAX/USDT:USDT", "LINK/USDT:USDT",
]


def to_native(canonical: str, exchange: str) -> str:
    """Convert a canonical symbol to the venue-native wire shape.

    Mirrors the Go ``gateway/internal/exchange/symbol`` package; the two
    must stay in lock-step (the property tests in
    ``normalize_test.go`` are the source of truth).
    """
    base, rest = canonical.split("/")
    if ":" in rest:
        quote, settle = rest.split(":")
        if exchange == "binance":
            return base + quote
        if exchange == "okx":
            return f"{base}-{quote}-SWAP"
        if exchange == "bybit":
            return base + quote
        raise ValueError(f"unknown exchange {exchange!r}")
    quote = rest
    if exchange == "binance":
        return base + quote
    if exchange == "okx":
        return f"{base}-{quote}"
    if exchange == "bybit":
        return base + quote
    raise ValueError(f"unknown exchange {exchange!r}")


# Backwards-compatible legacy mapping. Existing Phase 2 callers (the
# Arq ingest worker) still expect this dict-of-lists shape; we derive
# it from the canonical list on import so adding a new top-10 entry
# only requires editing one place.
CRYPTO_TOP10_USDT_PERP: dict[str, list[str]] = {
    venue: [to_native(c, venue) for c in CANONICAL_TOP10_USDT_PERP]
    for venue in ("binance", "okx", "bybit")
}

# CSI300 daily index code for AKShare (`stock_zh_index_daily`).
ASHARE_INDEX_DAILY: list[str] = ["sh000300"]
