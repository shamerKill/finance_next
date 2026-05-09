"""Hardcoded symbol universe for Phase 2.

Phase 3+ replaces this with dynamic discovery via ccxt's ``markets`` endpoint.
For now we keep a deterministic top-10 USDT-perp list per crypto venue +
the CSI300 reference for AKShare.
"""

from __future__ import annotations

CRYPTO_TOP10_USDT_PERP: dict[str, list[str]] = {
    # Binance USDT-M perpetuals.
    "binance": [
        "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
        "DOGEUSDT", "ADAUSDT", "TRXUSDT", "AVAXUSDT", "LINKUSDT",
    ],
    # OKX swap symbols use "BTC-USDT-SWAP" form — Phase 5 will normalize.
    "okx": [
        "BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP", "XRP-USDT-SWAP",
        "DOGE-USDT-SWAP", "ADA-USDT-SWAP", "TRX-USDT-SWAP", "AVAX-USDT-SWAP",
        "LINK-USDT-SWAP", "BNB-USDT-SWAP",
    ],
    # Bybit linear perps.
    "bybit": [
        "BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
        "ADAUSDT", "AVAXUSDT", "LINKUSDT", "TRXUSDT", "BNBUSDT",
    ],
}

# CSI300 daily index code for AKShare (`stock_zh_index_daily`).
ASHARE_INDEX_DAILY: list[str] = ["sh000300"]
