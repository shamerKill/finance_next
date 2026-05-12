"""CN financial news via AKShare (Phase 8).

Endpoints (probed in order, first one available wins)
----------------------------------------------------
* ``ak.stock_news_cls()`` — original CLS (财联社) feed (removed sometime
  in 2025; AttributeError on current akshare ≥1.18).
* ``ak.stock_news_main_cx()`` — 财新 main news (fallback, similar shape).
* ``ak.news_cctv()`` — CCTV news (last-resort generic CN feed).

The endpoints return the most recent ~200 headlines with timestamps
in Beijing time. We coerce to UTC before storage. If none of the
candidates exist on the installed akshare version, the call returns
[] with a single info log and the RSS aggregator keeps working.
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from quant.data.news.cryptopanic import NewsItem

log = logging.getLogger(__name__)


_BEIJING_TZ = timezone(timedelta(hours=8))


def _normalize_ts(raw: Any) -> datetime | None:
    """Coerce an AKShare news timestamp into a UTC datetime."""
    if raw is None:
        return None
    if hasattr(raw, "to_pydatetime"):
        ts = raw.to_pydatetime()
    else:
        try:
            ts = datetime.fromisoformat(str(raw))
        except ValueError:
            return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=_BEIJING_TZ)
    return ts.astimezone(UTC)


# A short list of A-share / HK-listed tickers we extract from the title
# when a digit-string of the right length appears. This is intentionally
# conservative — tagging is a nice-to-have, not load-bearing.
_TICKER_RE = re.compile(r"\b(\d{6})\b")


class AkshareCNNews:
    """CN financial news (CLS feed) via AKShare."""

    def __init__(self, akshare_module: Any | None = None) -> None:
        if akshare_module is None:
            try:
                import akshare as akshare_module  # type: ignore
            except Exception:  # pragma: no cover
                akshare_module = None
        self._ak = akshare_module

    # Candidate akshare function names probed in priority order. The first
    # one present on the installed akshare gets used; if none exist the
    # source returns [] (the wider news ingest still has RSS).
    _CANDIDATE_FNS = (
        ("stock_news_cls", "cls"),       # CLS 财联社 — gone in akshare 1.18+
        ("stock_news_main_cx", "caixin"), # 财新 main feed — closest replacement
        ("news_cctv", "cctv"),            # CCTV news — generic CN fallback
    )

    async def fetch_cls(self) -> list[NewsItem]:
        """Return latest CN financial-news headlines.

        Despite the legacy method name, this now probes multiple akshare
        endpoints and returns the first set that works. The ``source``
        field on each NewsItem reflects which endpoint produced it (cls /
        caixin / cctv) so downstream filters can still differentiate.
        """
        if self._ak is None:
            log.warning("akshare not installed; skipping CN news")
            return []
        fn = None
        source = "akshare"
        for name, src in self._CANDIDATE_FNS:
            candidate = getattr(self._ak, name, None)
            if candidate is not None and callable(candidate):
                fn = candidate
                source = src
                break
        if fn is None:
            log.info(
                "akshare CN news: none of %s available; skipping",
                [n for n, _ in self._CANDIDATE_FNS],
            )
            return []
        try:
            df = await asyncio.get_running_loop().run_in_executor(None, fn)
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare %s failed: %s", source, exc)
            return []
        if df is None or len(df) == 0:
            return []

        cols = {str(c).lower(): str(c) for c in df.columns}
        title_col = cols.get("标题") or cols.get("title") or list(df.columns)[0]
        body_col = cols.get("内容") or cols.get("content") or ""
        date_col = (
            cols.get("发布日期")
            or cols.get("发布时间")
            or cols.get("date")
            or cols.get("ts")
            or list(df.columns)[-1]
        )
        out: list[NewsItem] = []
        for idx, row in df.iterrows():
            ts = _normalize_ts(row.get(date_col))
            if ts is None:
                continue
            title = str(row.get(title_col) or "").strip()
            body = str(row.get(body_col) or "").strip() if body_col else ""
            symbols = list(set(_TICKER_RE.findall(title + " " + body)))
            out.append(
                NewsItem(
                    id=f"{source}:{ts.isoformat()}:{idx}",
                    source=source,
                    ts=ts,
                    title=title,
                    url="",
                    body=body,
                    sentiment=0.0,
                    symbols=symbols,
                )
            )
        return out
