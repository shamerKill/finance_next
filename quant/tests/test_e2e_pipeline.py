"""End-to-end pipeline test against a running gateway+quant+stores stack.

Skipped automatically when http://localhost:3001/healthz is not 200, so this
test is opt-in and never breaks the offline pytest run.

Run explicitly:
    cd quant && uv run pytest -m integration -v tests/test_e2e_pipeline.py
"""
from __future__ import annotations

import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

GATEWAY = os.environ.get("E2E_GATEWAY_URL", "http://localhost:3001")
ADMIN_KEY_ENV_FILE = Path("/Volumes/lin/code/my/finance_next/gateway/.env")


def _resolve_admin_key() -> str | None:
    """Pull ADMIN_KEY out of gateway/.env so the test doesn't carry a secret.

    Returns None when the env file or key is missing.
    """
    if not ADMIN_KEY_ENV_FILE.exists():
        return None
    for line in ADMIN_KEY_ENV_FILE.read_text().splitlines():
        if line.startswith("ADMIN_KEY="):
            v = line.split("=", 1)[1].strip()
            return v or None
    return None


def _stack_alive() -> bool:
    try:
        r = httpx.get(f"{GATEWAY}/healthz", timeout=2.0)
        return r.status_code == 200
    except Exception:
        return False


@pytest.fixture(scope="module")
def stack():
    if not _stack_alive():
        pytest.skip("gateway not reachable at " + GATEWAY)
    admin = _resolve_admin_key()
    if not admin:
        pytest.skip("ADMIN_KEY not configured in gateway/.env")
    yield {"gateway": GATEWAY, "admin_key": admin}


@pytest.mark.integration
def test_full_pipeline(stack):
    g = stack["gateway"]
    admin = stack["admin_key"]
    user_headers = {"X-User-Id": "default"}
    admin_headers = {
        **user_headers,
        "X-Admin-Key": admin,
        "Content-Type": "application/json",
    }

    # ---- 1. ingest 30d BTCUSDT 1h ------------------------------------------
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    start = (now - timedelta(days=30)).isoformat().replace("+00:00", "Z")
    end = now.isoformat().replace("+00:00", "Z")
    r = httpx.post(
        f"{g}/api/v1/market/ingest",
        headers=admin_headers,
        json={
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start": start,
            "end": end,
        },
        timeout=120.0,
    )
    assert r.status_code == 200, r.text
    bars = r.json().get("barsIngested", 0)
    # `barsIngested` may be 0 on a re-run against an already-populated
    # Timescale (idempotent upsert returns zero new rows). The follow-up
    # /ohlcv read is the real assertion that data exists.
    assert isinstance(bars, int) and bars >= 0, f"unexpected barsIngested={bars!r}"

    # ---- 2. /market/ohlcv read returns rows -------------------------------
    r = httpx.get(
        f"{g}/api/v1/market/ohlcv",
        params={
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start": start,
            "end": end,
        },
        headers=user_headers,
        timeout=10.0,
    )
    assert r.status_code == 200, r.text
    rows = r.json()
    assert isinstance(rows, list) and len(rows) > 0, "no OHLCV rows returned"
    assert "open" in rows[0] and "close" in rows[0] and "time" in rows[0]

    # ---- 3. create a strategy ---------------------------------------------
    # `name` is validated `min=3,max=8` by CreateOptionDTO — keep the
    # uuid suffix short enough to fit ("e2" + 6 hex = 8 chars).
    name = f"e2{uuid.uuid4().hex[:6]}"
    body = {
        "name": name,
        "positionLevel": 5,
        "openPositionStopTime": 30,
        "execSymbol": "BTCUSDT",
        "orderGroupMargin": 100,
        "stopProfitRate": 0.05,
        "stopLossRate": 0.05,
        "profitRateAfterAtAddPosition": 0.02,
        "createCostOrderInProfit": False,
        "createPositions": [{"marginRate": 1.0, "lossAddRate": 0.0}],
        "userEmail": "e2e@test.local",
        "userApiKey": "placeholder",
        "userSecretKey": "placeholder",
    }
    create_r = httpx.post(
        f"{g}/api/v1/option", json=body, headers=admin_headers, timeout=10.0
    )
    # Note: option POST may not return the inserted doc id consistently — we
    # list-and-match by unique name to recover the id regardless of POST
    # response shape (tolerates known 5xx-but-inserted edge case).
    list_r = httpx.get(f"{g}/api/v1/option", headers=user_headers, timeout=10.0)
    assert list_r.status_code == 200, list_r.text
    strategies = list_r.json()
    match = [s for s in strategies if s.get("name") == name]
    assert match, (
        f"strategy {name!r} not found after POST; "
        f"create_resp={create_r.status_code}/{create_r.text[:200]}"
    )
    strategy_id = match[0].get("id") or match[0].get("_id")
    assert strategy_id, f"strategy doc missing id: {match[0]!r}"

    try:
        # ---- 4. trigger optimization --------------------------------------
        r = httpx.post(
            f"{g}/api/v1/strategies/{strategy_id}/optimize",
            json={},
            headers=admin_headers,
            timeout=15.0,
        )
        assert r.status_code == 202, r.text
        study_id = r.json()["studyId"]

        # ---- 5. poll until completed --------------------------------------
        deadline = time.monotonic() + 50.0  # 50s ceiling (typical ~30s)
        final = None
        while time.monotonic() < deadline:
            r = httpx.get(
                f"{g}/api/v1/optimizations/{study_id}",
                headers=user_headers,
                timeout=5.0,
            )
            assert r.status_code == 200, r.text
            doc = r.json()
            if doc.get("state") in ("completed", "failed"):
                final = doc
                break
            time.sleep(2.0)
        assert final is not None, "optimization did not finish within 50s"
        assert final["state"] == "completed", (
            f"state={final['state']!r} err={final.get('error')}"
        )
        assert final.get("trialsCompleted", 0) >= 1
        rec_id = final.get("recommendationId")
        assert rec_id, "no recommendationId on completed study"

        # ---- 6. recommendation exists with non-empty content --------------
        r = httpx.get(
            f"{g}/api/v1/recommendations/{rec_id}",
            headers=user_headers,
            timeout=5.0,
        )
        assert r.status_code == 200, r.text
        rec = r.json()
        assert rec["status"] == "pending_review"
        assert rec["strategyId"] == strategy_id
        assert rec["studyId"] == study_id
        assert isinstance(rec.get("proposedParams"), dict)
        assert len(rec["proposedParams"]) > 0
        assert isinstance(rec.get("rationale"), str)
        assert len(rec["rationale"]) > 20, "rationale too short to be useful"

    finally:
        # ---- 7. cleanup ----------------------------------------------------
        # Delete the strategy; optimization_runs + ai_recommendations are
        # append-only by design and remain as audit.
        try:
            httpx.delete(
                f"{g}/api/v1/option/{strategy_id}",
                headers=user_headers,
                timeout=5.0,
            )
        except Exception:
            pass
