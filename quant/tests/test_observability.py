"""Phase 7 observability smoke tests."""

from __future__ import annotations

from quant.observability import (
    Counter,
    Histogram,
    ai_usd_spent,
    render_text,
)


def test_counter_inc_and_render() -> None:
    c = Counter("test_total", "test", labelnames=("kind",))
    c.inc(kind="a")
    c.inc(2.5, kind="a")
    c.inc(kind="b")
    out = "\n".join(c.render())
    assert "test_total{kind=\"a\"} 3.5" in out
    assert "test_total{kind=\"b\"} 1" in out


def test_histogram_buckets_render() -> None:
    h = Histogram("test_seconds", "test", buckets=(0.1, 1, 10))
    for v in (0.05, 0.5, 5, 100):
        h.observe(v)
    out = "\n".join(h.render())
    # 0.05 lands in <=0.1; 0.5 lands in <=1; 5 in <=10; 100 in +Inf only.
    assert "test_seconds_bucket{le=\"0.1\"} 1" in out
    assert "test_seconds_bucket{le=\"1\"} 2" in out
    assert "test_seconds_bucket{le=\"10\"} 3" in out
    assert "test_seconds_bucket{le=\"+Inf\"} 4" in out
    assert "test_seconds_count 4" in out


def test_render_text_is_well_formed() -> None:
    ai_usd_spent.inc(0.05, model="haiku")
    body = render_text()
    assert body.startswith("# HELP")
    assert body.endswith("\n")
    assert "quant_ai_usd_spent_total" in body
