"""Generic RSS aggregator (Phase 8).

Uses the ``feedparser`` package to read arbitrary RSS / Atom feeds.
Default feed list focuses on financial newswires; operators add more
via the worker config.

No API key. Rate limits are per upstream; we respect ``etag`` /
``modified`` cache headers when feedparser surfaces them.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any

from quant.data.news.cryptopanic import NewsItem

log = logging.getLogger(__name__)


# Conservative, broadly trusted business / crypto feeds. Operators
# extend this list via worker config.
DEFAULT_FEEDS: list[str] = [
    "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "https://feeds.reuters.com/reuters/businessNews",
]


def _normalize_ts(entry: Any) -> datetime | None:
    """Pull the published timestamp out of a feedparser entry."""
    raw = (
        entry.get("published_parsed")
        or entry.get("updated_parsed")
        or entry.get("created_parsed")
    )
    if raw is None:
        return None
    try:
        return datetime(*raw[:6], tzinfo=UTC)
    except (TypeError, ValueError):
        return None


class RSSAggregator:
    def __init__(self, feedparser_module: Any | None = None) -> None:
        if feedparser_module is None:
            try:
                import feedparser as feedparser_module  # type: ignore
            except Exception:  # pragma: no cover
                feedparser_module = None
        self._fp = feedparser_module

    async def fetch(self, feed_urls: list[str] | None = None) -> list[NewsItem]:
        """Pull every entry from the supplied feeds (or the defaults)."""
        if self._fp is None:
            log.warning("feedparser not installed; skipping RSS")
            return []
        urls = feed_urls or DEFAULT_FEEDS
        out: list[NewsItem] = []
        for url in urls:
            try:
                parsed = await asyncio.get_running_loop().run_in_executor(
                    None, self._fp.parse, url
                )
            except Exception as exc:  # noqa: BLE001
                log.warning("rss parse failed for %s: %s", url, exc)
                continue
            for entry in parsed.get("entries") or []:
                ts = _normalize_ts(entry)
                if ts is None:
                    continue
                eid = str(entry.get("id") or entry.get("link") or "")
                if not eid:
                    continue
                title = str(entry.get("title") or "").strip()
                body = str(
                    entry.get("summary") or entry.get("description") or ""
                ).strip()
                out.append(
                    NewsItem(
                        id=f"rss:{eid}",
                        source="rss",
                        ts=ts,
                        title=title,
                        url=str(entry.get("link") or ""),
                        body=body,
                        sentiment=0.0,
                        symbols=[],
                    )
                )
        return out
