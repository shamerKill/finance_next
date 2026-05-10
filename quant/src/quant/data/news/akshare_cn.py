"""CN financial news via AKShare (Phase 8).

Endpoints
---------
* ``ak.stock_news_cls()`` — CLS (财联社) realtime news flow.

The cls endpoint returns the most recent ~200 headlines with timestamps
in Beijing time. We coerce to UTC before storage.
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

    async def fetch_cls(self) -> list[NewsItem]:
        """Return latest CLS headlines."""
        if self._ak is None:
            log.warning("akshare not installed; skipping CLS news")
            return []
        try:
            df = await asyncio.get_running_loop().run_in_executor(
                None, self._ak.stock_news_cls
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare stock_news_cls failed: %s", exc)
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
                    id=f"cls:{ts.isoformat()}:{idx}",
                    source="cls",
                    ts=ts,
                    title=title,
                    url="",
                    body=body,
                    sentiment=0.0,
                    symbols=symbols,
                )
            )
        return out
