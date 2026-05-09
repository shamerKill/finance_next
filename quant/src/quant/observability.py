"""Phase 7 quant observability — Prometheus-compatible counters + OTel.

We deliberately skip the full ``opentelemetry-distro`` install in the
default dependency list so unit tests don't pull a sprawling tree.
Instead, this module exposes a tiny, dependency-free ``Counter`` /
``Histogram`` API that emits Prometheus exposition text via
:func:`render_text`.

To upgrade to real OTel + OTLP:

1. Install ``opentelemetry-distro`` +
   ``opentelemetry-instrumentation-grpc`` +
   ``opentelemetry-instrumentation-asyncpg``.
2. Set ``OTEL_EXPORTER_OTLP_ENDPOINT`` in the env.
3. Re-export ``Counter`` / ``Histogram`` here as wrappers around the
   OTel SDK ``meter.create_counter`` / ``meter.create_histogram``.

Default exporter is **stdout** — set ``OTEL_EXPORTER_OTLP_ENDPOINT`` to
ship to a collector. Defaulting to stdout avoids surprise data egress.
"""

from __future__ import annotations

import os
import threading
import time
from collections import defaultdict


class Counter:
    """Monotonic float counter."""

    def __init__(self, name: str, help: str, labelnames: tuple[str, ...] = ()) -> None:
        self.name = name
        self.help = help
        self.labelnames = labelnames
        self._values: dict[tuple[str, ...], float] = defaultdict(float)
        self._lock = threading.Lock()

    def inc(self, value: float = 1.0, **labels: str) -> None:
        key = tuple(labels.get(n, "") for n in self.labelnames)
        with self._lock:
            self._values[key] += value

    def render(self) -> list[str]:
        out = [f"# HELP {self.name} {self.help}", f"# TYPE {self.name} counter"]
        for key, v in sorted(self._values.items()):
            lbls = ",".join(f'{n}="{key[i]}"' for i, n in enumerate(self.labelnames))
            suffix = "{" + lbls + "}" if lbls else ""
            out.append(f"{self.name}{suffix} {v}")
        return out


class Histogram:
    """Float histogram with fixed buckets (seconds)."""

    DEFAULT_BUCKETS = (
        0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
    )

    def __init__(
        self,
        name: str,
        help: str,
        buckets: tuple[float, ...] = DEFAULT_BUCKETS,
        labelnames: tuple[str, ...] = (),
    ) -> None:
        self.name = name
        self.help = help
        self.buckets = buckets
        self.labelnames = labelnames
        self._counts: dict[tuple[str, ...], list[int]] = defaultdict(
            lambda: [0] * len(buckets)
        )
        self._sum: dict[tuple[str, ...], float] = defaultdict(float)
        self._total: dict[tuple[str, ...], int] = defaultdict(int)
        self._lock = threading.Lock()

    def observe(self, value: float, **labels: str) -> None:
        key = tuple(labels.get(n, "") for n in self.labelnames)
        with self._lock:
            self._total[key] += 1
            self._sum[key] += value
            for i, ub in enumerate(self.buckets):
                if value <= ub:
                    self._counts[key][i] += 1

    def render(self) -> list[str]:
        out = [f"# HELP {self.name} {self.help}", f"# TYPE {self.name} histogram"]
        for key, counts in sorted(self._counts.items()):
            base_lbls = ",".join(f'{n}="{key[i]}"' for i, n in enumerate(self.labelnames))
            for i, ub in enumerate(self.buckets):
                lbls = base_lbls + (",le=" if base_lbls else "le=") + f'"{ub}"'
                out.append(f"{self.name}_bucket{{{lbls}}} {counts[i]}")
            lbls_inf = base_lbls + (",le=" if base_lbls else "le=") + '"+Inf"'
            out.append(f"{self.name}_bucket{{{lbls_inf}}} {self._total[key]}")
            suffix = "{" + base_lbls + "}" if base_lbls else ""
            out.append(f"{self.name}_sum{suffix} {self._sum[key]}")
            out.append(f"{self.name}_count{suffix} {self._total[key]}")
        return out


# ---------------------------------------------------------------------------
# Module-level metrics — these are the metrics referenced by the Grafana
# dashboards in `infra/grafana/dashboards/quant.json`.
# ---------------------------------------------------------------------------

backtest_runs = Counter(
    "quant_backtest_runs_total",
    "Number of backtest runs started.",
)

optimization_runs = Counter(
    "quant_optimization_runs_total",
    "Number of optimization studies started.",
)

ai_usd_spent = Counter(
    "quant_ai_usd_spent_total",
    "Cumulative USD spent on Claude API calls.",
    labelnames=("model",),
)

ingest_duration = Histogram(
    "quant_ingest_duration_seconds",
    "Duration of OHLCV ingest jobs.",
    labelnames=("exchange",),
)


def render_text() -> str:
    """Return a Prometheus-format scrape body for /metrics endpoints."""
    lines: list[str] = []
    for m in (backtest_runs, optimization_runs, ai_usd_spent, ingest_duration):
        lines.extend(m.render())
    return "\n".join(lines) + "\n"


def time_it(metric: Histogram, **labels: str):
    """Context manager that records elapsed seconds into ``metric``."""

    class _Timer:
        def __enter__(self):
            self.t0 = time.monotonic()
            return self

        def __exit__(self, *_):
            metric.observe(time.monotonic() - self.t0, **labels)

    return _Timer()


def otlp_endpoint() -> str | None:
    """Return the configured OTLP endpoint, or None to use stdout."""
    return os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT") or None
