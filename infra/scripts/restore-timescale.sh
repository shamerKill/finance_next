#!/usr/bin/env bash
# restore-timescale.sh — pair of backup-timescale.sh.
#
# Usage:
#   TIMESCALE_DSN=... BUCKET=s3://my-backups RESTORE_FROM=20260101T000000Z ./restore-timescale.sh
set -euo pipefail

if [[ -z "${TIMESCALE_DSN:-}" || -z "${RESTORE_FROM:-}" ]]; then
  echo "TIMESCALE_DSN and RESTORE_FROM required" >&2
  exit 1
fi

WORK_DIR="${WORK_DIR:-/tmp/restore-ts}/${RESTORE_FROM}"
mkdir -p "${WORK_DIR}"

if [[ -n "${BUCKET:-}" ]]; then
  echo "==> aws s3 cp ${BUCKET}/timescale/${RESTORE_FROM}/finance.sql.gz"
  aws s3 cp "${BUCKET}/timescale/${RESTORE_FROM}/finance.sql.gz" "${WORK_DIR}/finance.sql.gz"
fi

if [[ ! -f "${WORK_DIR}/finance.sql.gz" ]]; then
  echo "missing ${WORK_DIR}/finance.sql.gz" >&2
  exit 2
fi

if [[ "${CONFIRM_OVERWRITE:-}" != "yes" ]]; then
  echo "Target DB will be overwritten. Set CONFIRM_OVERWRITE=yes to proceed." >&2
  exit 3
fi

echo "==> gunzip + pg_restore"
gunzip -c "${WORK_DIR}/finance.sql.gz" \
  | pg_restore --clean --if-exists --no-owner --no-privileges \
    --dbname="${TIMESCALE_DSN}"

echo "==> done"
