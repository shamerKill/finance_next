"""Redis-Streams consumer for Phase 8 admin-triggered ingest commands.

The Go gateway's admin endpoints (``POST /api/v1/admin/ingest/{kind}``)
XADD a payload onto ``command.ingest.<kind>`` instead of going through
the gRPC ``IngestNow`` path — this keeps the proto stable while still
giving operators a way to kick a one-off ingest from the dashboard.

Stream layout (one stream per kind so consumers don't have to filter):

    command.ingest.equities  → run_equities_ingest(**kwargs)
    command.ingest.futures   → run_futures_ingest(**kwargs)
    command.ingest.macro     → run_macro_ingest(**kwargs)
    command.ingest.onchain   → run_onchain_ingest(**kwargs)
    command.ingest.news      → run_news_ingest(**kwargs)

Payload is JSON in the ``data`` field, decoded into kwargs for the
matching ``run_*_ingest`` function. Unknown keys are dropped silently.

Consumer-group semantics: we use a single consumer group
(``quant-ingest``) so multi-replica deploys don't double-process. New
streams are auto-created on first XADD; the group is created lazily on
first attempt.

This consumer is NOT load-bearing — the cron schedule does the
periodic ingest. It's purely a developer / ops convenience for
backfills.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
from typing import Any

from quant.workers import extended_ingest

log = logging.getLogger(__name__)


COMMAND_INGEST_STREAMS = {
    "equities": "command.ingest.equities",
    "futures": "command.ingest.futures",
    "macro": "command.ingest.macro",
    "onchain": "command.ingest.onchain",
    "news": "command.ingest.news",
}

CONSUMER_GROUP = "quant-ingest"
CONSUMER_NAME = "quant-1"


_DISPATCH = {
    "equities": extended_ingest.run_equities_ingest,
    "futures": extended_ingest.run_futures_ingest,
    "macro": extended_ingest.run_macro_ingest,
    "onchain": extended_ingest.run_onchain_ingest,
    "news": extended_ingest.run_news_ingest,
}


async def _ensure_group(redis_client: Any, stream: str) -> None:
    """Create the consumer group if it doesn't exist. Idempotent."""
    try:
        await redis_client.xgroup_create(
            stream, CONSUMER_GROUP, id="0", mkstream=True
        )
    except Exception as exc:  # noqa: BLE001
        # BUSYGROUP from Redis is the expected "already exists".
        if "BUSYGROUP" not in str(exc):
            log.warning("xgroup_create %s failed: %s", stream, exc)


async def _process_one(kind: str, payload: dict[str, Any]) -> None:
    handler = _DISPATCH.get(kind)
    if handler is None:
        log.warning("no handler for ingest kind=%s", kind)
        return
    # Filter kwargs to ones the handler actually accepts so admin
    # callers can't crash the worker by passing junk fields.
    sig = inspect.signature(handler)
    kwargs = {k: v for k, v in payload.items() if k in sig.parameters}
    try:
        await handler(**kwargs)
    except Exception as exc:  # noqa: BLE001
        log.exception("ingest %s handler failed: %s", kind, exc)


async def consume_loop(redis_client: Any) -> None:  # pragma: no cover — run loop
    """Long-lived consumer. Cancelled via task.cancel() at shutdown."""
    streams = list(COMMAND_INGEST_STREAMS.values())
    for s in streams:
        await _ensure_group(redis_client, s)

    while True:
        try:
            resp = await redis_client.xreadgroup(
                CONSUMER_GROUP,
                CONSUMER_NAME,
                {s: ">" for s in streams},
                count=4,
                block=5_000,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("xreadgroup failed: %s", exc)
            await asyncio.sleep(1.0)
            continue

        for stream_name, entries in resp or []:
            kind = next(
                (k for k, v in COMMAND_INGEST_STREAMS.items() if v == stream_name),
                None,
            )
            for entry_id, fields in entries:
                raw = (
                    fields.get("data")
                    if isinstance(fields, dict)
                    else fields.get(b"data")
                )
                if isinstance(raw, bytes):
                    raw = raw.decode("utf-8")
                payload: dict[str, Any] = {}
                if raw:
                    try:
                        payload = json.loads(raw) or {}
                    except json.JSONDecodeError:
                        log.warning("invalid JSON on %s entry %s", stream_name, entry_id)
                if kind is not None:
                    await _process_one(kind, payload)
                try:
                    await redis_client.xack(stream_name, CONSUMER_GROUP, entry_id)
                except Exception as exc:  # noqa: BLE001
                    log.warning("xack failed for %s/%s: %s", stream_name, entry_id, exc)
