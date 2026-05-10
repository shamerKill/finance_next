"""News + sentiment sources (Phase 8).

Free / no-key sources:

* :class:`CryptoPanicClient` — crypto-specific news aggregator.
  ``CRYPTOPANIC_TOKEN`` is optional (free tier works without).
* :class:`AkshareCNNews`     — CN financial news (cls / eastmoney) via AKShare.
* :class:`RSSAggregator`     — generic RSS via the ``feedparser`` package.

Sentiment: a tiny lexicon-based scorer (:class:`LexiconSentiment`) that
returns -1..+1. This is a deliberate placeholder — production should
swap to FinBERT or a hosted classifier.

Storage: ``news_events`` table (NOT a hypertable; PK is text id).
"""

from quant.data.news.akshare_cn import AkshareCNNews  # noqa: F401
from quant.data.news.cryptopanic import CryptoPanicClient, NewsItem  # noqa: F401
from quant.data.news.rss_aggregator import RSSAggregator  # noqa: F401
from quant.data.news.sentiment import LexiconSentiment  # noqa: F401
