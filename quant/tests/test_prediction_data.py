"""Phase 9 — Polymarket data + strategy unit tests.

All offline. Gamma + CLOB clients use respx; WS uses a fake connect
factory.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx

from quant.data.prediction import (
    PolymarketCLOBClient,
    PolymarketGammaClient,
    PolymarketWS,
)
from quant.strategies.polymarket_event import (
    PolymarketEventStrategy,
    realised_pnl_at_resolve,
)


@pytest.mark.asyncio
@respx.mock
async def test_gamma_fetch_markets():
    body = [
        {
            "id": "0xabc",
            "slug": "trump-2028",
            "question": "Will Trump run in 2028?",
            "endDate": "2028-11-01T00:00:00Z",
            "category": "Politics",
            "tags": ["election", "us"],
            "clobTokenIds": json.dumps(["t-yes-1", "t-no-1"]),
            "conditionId": "0xcond1",
        }
    ]
    respx.get("https://gamma-api.polymarket.com/markets").mock(
        return_value=httpx.Response(200, json=body)
    )
    cli = PolymarketGammaClient()
    try:
        rows = await cli.fetch_markets(limit=10)
    finally:
        await cli.aclose()
    assert len(rows) == 1
    m = rows[0]
    assert m.market_id == "0xabc"
    assert m.condition_id == "0xcond1"
    assert m.tags == ["election", "us"]
    assert m.token_ids == ["t-yes-1", "t-no-1"]
    assert m.category == "Politics"


@pytest.mark.asyncio
@respx.mock
async def test_gamma_fetch_market_handles_envelope():
    body = {"markets": [{"id": "x", "question": "Q", "slug": "x"}]}
    respx.get("https://gamma-api.polymarket.com/markets").mock(
        return_value=httpx.Response(200, json=body)
    )
    cli = PolymarketGammaClient()
    try:
        rows = await cli.fetch_markets()
    finally:
        await cli.aclose()
    assert len(rows) == 1
    assert rows[0].market_id == "x"


@pytest.mark.asyncio
@respx.mock
async def test_gamma_handles_failure():
    respx.get("https://gamma-api.polymarket.com/markets").mock(
        return_value=httpx.Response(500, text="boom")
    )
    cli = PolymarketGammaClient()
    try:
        rows = await cli.fetch_markets()
    finally:
        await cli.aclose()
    # Errors return empty list (warning logged).
    assert rows == []


@pytest.mark.asyncio
@respx.mock
async def test_clob_fetch_orderbook():
    body = {
        "market": "0xmkt",
        "token_id": "tok1",
        "timestamp": "2025-01-01T00:00:00Z",
        "bids": [{"price": "0.40", "size": "100"}, {"price": "0.39", "size": "50"}],
        "asks": [{"price": "0.42", "size": "200"}],
    }
    respx.get("https://clob.polymarket.com/book").mock(
        return_value=httpx.Response(200, json=body)
    )
    cli = PolymarketCLOBClient()
    try:
        ob = await cli.fetch_orderbook("tok1")
    finally:
        await cli.aclose()
    assert ob is not None
    assert ob.token_id == "tok1"
    assert len(ob.bids) == 2
    assert ob.bids[0].price == 0.40
    assert ob.asks[0].size == 200.0
    assert ob.mid == pytest.approx(0.41)


@pytest.mark.asyncio
@respx.mock
async def test_clob_fetch_trades_array_top_level():
    body = [
        {
            "id": "trade-1",
            "market": "0xmkt",
            "asset_id": "tok1",
            "side": "BUY",
            "price": "0.41",
            "size": "5",
            "match_time": "2025-01-01T00:00:00Z",
            "transaction_hash": "0xtx1",
        }
    ]
    respx.get("https://clob.polymarket.com/trades").mock(
        return_value=httpx.Response(200, json=body)
    )
    cli = PolymarketCLOBClient()
    try:
        rows = await cli.fetch_trades("0xmkt")
    finally:
        await cli.aclose()
    assert len(rows) == 1
    assert rows[0].side == "BUY"
    assert rows[0].tx_hash == "0xtx1"


@pytest.mark.asyncio
@respx.mock
async def test_clob_fetch_price_history():
    body = {
        "history": [
            {"t": 1700000000, "p": 0.40},
            {"t": 1700000600, "p": 0.42},
        ]
    }
    respx.get("https://clob.polymarket.com/prices-history").mock(
        return_value=httpx.Response(200, json=body)
    )
    cli = PolymarketCLOBClient()
    try:
        rows = await cli.fetch_price_history(
            "tok1", "1m",
            datetime(2023, 11, 14, tzinfo=UTC),
            datetime(2023, 11, 15, tzinfo=UTC),
        )
    finally:
        await cli.aclose()
    assert len(rows) == 2
    assert rows[0].price == 0.40
    assert rows[1].price == 0.42


@pytest.mark.asyncio
async def test_ws_subscribe_with_fake_factory():
    sent: list[str] = []

    class FakeWS:
        def __init__(self) -> None:
            self.frames = [
                json.dumps({"event_type": "book", "asset_id": "t1"}),
                "not-json",
                json.dumps({"event_type": "price_change"}),
            ]

        async def send(self, msg: str) -> None:
            sent.append(msg)

        def __aiter__(self):
            return self._iter()

        async def _iter(self):
            for f in self.frames:
                yield f

    fake = FakeWS()

    async def factory(url: str):
        return fake

    ws = PolymarketWS(connect_factory=factory)
    received = []
    async for msg in ws.subscribe(["t1"]):
        received.append(msg)
    assert len(received) == 2
    assert received[0]["event_type"] == "book"
    # Subscribe envelope shape per Polymarket spec: type="Market" +
    # ``assets_ids`` (note the plural prefix — the typo is server-side).
    assert sent
    parsed = json.loads(sent[0])
    assert parsed["type"] == "Market"
    assert parsed["assets_ids"] == ["t1"]


@pytest.mark.asyncio
async def test_ws_default_factory_present():
    """Phase 9 wires a default `websockets`-backed factory; instantiating
    PolymarketWS() with no factory MUST NOT raise. The actual network
    connect is not exercised here (no real I/O leaves this test)."""
    ws = PolymarketWS()
    # Sanity: factory is bound (not None) — the dial only happens when
    # the caller iterates subscribe(), which we don't do here.
    assert ws._connect_factory is not None  # noqa: SLF001 — internal seam check


def test_event_strategy_signals():
    s = PolymarketEventStrategy(prior=0.50, threshold=0.05)
    sigs = s.signals([0.40, 0.50, 0.60, 0.0, 1.0])
    assert sigs == ["BUY", "", "SELL", "", ""]


def test_realised_pnl_buy_yes_wins():
    pnl = realised_pnl_at_resolve(
        side="BUY", entry_price=0.40, size=100.0, outcome_yes=True,
    )
    # 100 USDC / 0.40 = 250 shares; pays $250; net = 150 USDC.
    assert pnl == pytest.approx(150.0)


def test_realised_pnl_buy_yes_loses():
    pnl = realised_pnl_at_resolve(
        side="BUY", entry_price=0.40, size=100.0, outcome_yes=False,
    )
    assert pnl == pytest.approx(-100.0)


def test_realised_pnl_sell_no_wins():
    # Short YES = buy NO at 0.60. 100/0.60 = 166.66 shares of NO; pays $166.66.
    pnl = realised_pnl_at_resolve(
        side="SELL", entry_price=0.40, size=100.0, outcome_yes=False,
    )
    assert pnl == pytest.approx(100.0 * (1.0 / 0.60 - 1.0))


def test_realised_pnl_sell_no_loses():
    pnl = realised_pnl_at_resolve(
        side="SELL", entry_price=0.40, size=100.0, outcome_yes=True,
    )
    assert pnl == pytest.approx(-100.0)


def test_realised_pnl_invalid_inputs():
    assert realised_pnl_at_resolve(side="BUY", entry_price=0, size=1, outcome_yes=True) == 0
    assert realised_pnl_at_resolve(side="BUY", entry_price=1, size=1, outcome_yes=True) == 0
    assert realised_pnl_at_resolve(side="HOLD", entry_price=0.5, size=1, outcome_yes=True) == 0


def test_event_strategy_skips_extreme_prices():
    # Boundary prices (<=0, >=1) → no signal.
    sigs = PolymarketEventStrategy().signals([-0.1, 0.0, 1.0, 1.1])
    assert sigs == ["", "", "", ""]


@pytest.mark.asyncio
async def test_clob_default_url_env(monkeypatch):
    monkeypatch.setenv("POLYMARKET_CLOB_URL", "http://override.test")
    cli = PolymarketCLOBClient()
    try:
        assert cli._base_url == "http://override.test"  # noqa: SLF001
    finally:
        await cli.aclose()


def test_gamma_default_url_env(monkeypatch):
    monkeypatch.setenv("POLYMARKET_GAMMA_URL", "http://gamma.override")
    cli = PolymarketGammaClient()
    assert cli._base_url == "http://gamma.override"  # noqa: SLF001


def test_recent_window_helpers():
    # Sanity: PricePoint dataclass round-trips datetime.
    from quant.data.prediction.types import PricePoint

    now = datetime.now(tz=UTC)
    p = PricePoint(ts=now, price=0.5)
    assert p.ts == now
    assert p.price == 0.5


def test_orderbook_mid_when_one_side_empty():
    from quant.data.prediction.types import Orderbook

    ob = Orderbook(market_id="m", token_id="t", ts=datetime.now(tz=UTC))
    assert ob.mid is None
    ob.bids.append(__import__("quant.data.prediction.types", fromlist=["OrderbookLevel"]).OrderbookLevel(price=0.4, size=1))
    assert ob.mid is None  # asks empty


def test_clob_default_ts_safe_when_missing():
    # Ensure the fallback path doesn't crash.
    from quant.data.prediction.polymarket_clob import _parse_ts

    dt = _parse_ts("not-a-date")
    assert isinstance(dt, datetime)


def test_lookahead_prior_unused_at_far_future():
    s = PolymarketEventStrategy(prior=0.30, threshold=0.05)
    sigs = s.signals([0.20, 0.30, 0.40])
    # 0.20 < 0.30-0.05=0.25 → BUY; 0.30 within band → ""; 0.40 > 0.35 → SELL.
    assert sigs == ["BUY", "", "SELL"]


def test_recent_event_window():
    # Smoke: future-dated end_date parses cleanly.
    cli = PolymarketGammaClient()
    one_year = datetime.now(tz=UTC) + timedelta(days=365)
    row = cli._row_to_market(  # noqa: SLF001
        {
            "id": "m1",
            "question": "?",
            "endDate": one_year.isoformat(),
            "tags": ["x"],
        }
    )
    assert row.market_id == "m1"
    assert row.end_date is not None
    assert row.end_date.year == one_year.year
