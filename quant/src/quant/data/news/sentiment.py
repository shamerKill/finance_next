"""Lightweight lexicon-based sentiment (Phase 8 placeholder).

This is intentionally simple: count positive and negative tokens against
two short word lists, return ``(pos - neg) / (pos + neg + eps)`` clipped
to ``[-1, +1]``. It exists so the ``news_events.sentiment`` column has
*something* meaningful at insert time.

PRODUCTION should swap to a finance-tuned classifier (FinBERT, ProsusAI,
or a hosted API). The :class:`LexiconSentiment` class implements one
public method (``score``); any drop-in replacement only needs to match
that signature.
"""

from __future__ import annotations

import re

# Short, deliberately-conservative wordlists. Misses most slang; biased
# toward English. The point is "is the headline obviously good/bad" —
# anything ambiguous lands at ~0 and the human reviewer decides.
_POSITIVE = {
    "surge", "rally", "gain", "gains", "jump", "soar", "soared", "boost",
    "bullish", "upgrade", "beat", "beats", "growth", "strong", "approval",
    "approved", "record", "rose", "rises", "outperform", "buy",
    "breakthrough", "tailwind", "tailwinds",
}
_NEGATIVE = {
    "drop", "fall", "fell", "plunge", "plunges", "crash", "slump", "loss",
    "losses", "bearish", "downgrade", "miss", "missed", "decline", "weak",
    "warning", "fraud", "lawsuit", "probe", "halt", "halted", "ban",
    "banned", "bankruptcy", "delist", "delisted", "headwind", "headwinds",
}

_WORD_RE = re.compile(r"[A-Za-z']+")


class LexiconSentiment:
    """Tiny placeholder sentiment scorer."""

    def score(self, text: str) -> float:
        if not text:
            return 0.0
        tokens = [t.lower() for t in _WORD_RE.findall(text)]
        if not tokens:
            return 0.0
        pos = sum(1 for t in tokens if t in _POSITIVE)
        neg = sum(1 for t in tokens if t in _NEGATIVE)
        if pos == 0 and neg == 0:
            return 0.0
        return max(-1.0, min(1.0, (pos - neg) / (pos + neg)))
