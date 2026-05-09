#!/usr/bin/env bash
# backup-timescale.sh — Phase 7 nightly Timescale backup.
#
# Usage:
#   TIMESCALE_DSN=postgres://... BUCKET=s3://my-backups ./backup-timescale.sh
#
# Behaviour:
#   - pg_dumps the configured database (compressed, custom format)
#   - if BUCKET is set, uploads to S3 under /timescale/<UTC stamp>/
#
# Notes:
#   - Hypertables back up cleanly via pg_dump's standard logic; no special
#     timescaledb-tune required.
#   - Continuous aggregates (ohlcv_5m, ohlcv_1h) are stored as views — pg_dump
#     emits the definition; the data rebuilds itself on restore via the
#     refresh policies.
set -euo pipefail

if [[ -z "${TIMESCALE_DSN:-}" ]]; then
  echo "TIMESCALE_DSN not set" >&2
  exit 1
fi

DATE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-/backup}/timescale/${DATE_STAMP}"
mkdir -p "${OUT_DIR}"
OUT_FILE="${OUT_DIR}/finance.sql.gz"

echo "==> pg_dump → ${OUT_FILE}"
pg_dump "${TIMESCALE_DSN}" \
  --no-owner --no-privileges \
  --format=custom \
  --compress=9 \
  --file="${OUT_FILE%.gz}"
gzip -f "${OUT_FILE%.gz}"

if [[ -n "${BUCKET:-}" ]]; then
  echo "==> aws s3 cp → ${BUCKET}/timescale/${DATE_STAMP}/"
  aws s3 cp "${OUT_FILE}" "${BUCKET}/timescale/${DATE_STAMP}/" \
    --storage-class STANDARD_IA
  echo "==> uploaded; pruning local copy"
  rm -rf "${OUT_DIR}"
else
  echo "==> BUCKET unset; leaving local backup at ${OUT_FILE}"
fi

echo "==> done"
