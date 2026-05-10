"""AKShare wrapper for CN macro indicators (Phase 8).

Endpoints used (one per indicator)
----------------------------------
* CPI  → ``ak.macro_china_cpi_yearly`` (or ``macro_china_cpi``)
* PPI  → ``ak.macro_china_ppi_yearly``
* M2   → ``ak.macro_china_m2_yearly``
* GDP  → ``ak.macro_china_gdp_yearly``
* PMI  → ``ak.macro_china_pmi_yearly``

Output dataframes vary per indicator; column names are normalised
locally. AKShare's macro endpoints scrape the National Bureau of
Statistics + various data brokers, no API key needed.

Storage: ``macro_indicators(source='cn_macro', code, ts, value, unit)``.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, Literal

from quant.data.macro.fred import MacroPoint

log = logging.getLogger(__name__)


Indicator = Literal["cpi", "ppi", "m2", "gdp", "pmi"]


_AK_FUNCS: dict[Indicator, str] = {
    "cpi": "macro_china_cpi_yearly",
    "ppi": "macro_china_ppi_yearly",
    "m2": "macro_china_m2_yearly",
    "gdp": "macro_china_gdp_yearly",
    "pmi": "macro_china_pmi_yearly",
}


_UNITS: dict[Indicator, str] = {
    "cpi": "yoy_pct",
    "ppi": "yoy_pct",
    "m2": "yoy_pct",
    "gdp": "yoy_pct",
    "pmi": "index",
}


class AkshareCNMacro:
    """CN macro indicators via AKShare."""

    def __init__(self, akshare_module: Any | None = None) -> None:
        if akshare_module is None:
            try:
                import akshare as akshare_module  # type: ignore
            except Exception:  # pragma: no cover
                akshare_module = None
        self._ak = akshare_module

    async def fetch(self, indicator: Indicator) -> list[MacroPoint]:
        """Return all available observations for the indicator."""
        if self._ak is None:
            log.warning("akshare not installed; skipping macro %s", indicator)
            return []
        func_name = _AK_FUNCS.get(indicator)
        if func_name is None:
            return []
        func = getattr(self._ak, func_name, None)
        if func is None:
            log.warning("akshare missing function %s; check version", func_name)
            return []

        try:
            df = await asyncio.get_running_loop().run_in_executor(None, func)
        except Exception as exc:  # noqa: BLE001
            log.warning("akshare macro %s failed: %s", indicator, exc)
            return []
        if df is None or len(df) == 0:
            return []

        # Pick the date column + the value column heuristically.
        cols = {str(c).lower(): str(c) for c in df.columns}
        date_col = (
            cols.get("日期")
            or cols.get("月份")
            or cols.get("date")
            or cols.get("year")
            or list(df.columns)[0]
        )
        value_col_candidate: str | None = None
        for k in ("今值", "现值", "value", "今值(%)"):
            if k.lower() in cols:
                value_col_candidate = cols[k.lower()]
                break
        if value_col_candidate is None:
            # Heuristic: last numeric-looking column.
            for c in reversed(list(df.columns)):
                value_col_candidate = str(c)
                break
        if value_col_candidate is None:
            return []

        unit = _UNITS.get(indicator, "")
        out: list[MacroPoint] = []
        for _, row in df.iterrows():
            ts_raw = row[date_col]
            try:
                if hasattr(ts_raw, "to_pydatetime"):
                    ts = ts_raw.to_pydatetime()
                else:
                    s = str(ts_raw).strip()
                    # Common AKShare formats: "2024-01-02", "2024-01",
                    # "202401". We try the most specific first.
                    try:
                        ts = datetime.fromisoformat(s)
                    except ValueError:
                        if "-" in s and len(s) >= 7:
                            ts = datetime.strptime(s[:7], "%Y-%m")
                        elif s.isdigit() and len(s) >= 6:
                            ts = datetime.strptime(s[:6], "%Y%m")
                        else:
                            continue
                if ts.tzinfo is None:
                    ts = ts.replace(tzinfo=UTC)
                v = float(row[value_col_candidate])
            except (TypeError, ValueError, KeyError):
                continue
            out.append(
                MacroPoint(
                    source="cn_macro", code=indicator, ts=ts, value=v, unit=unit
                )
            )
        return out
