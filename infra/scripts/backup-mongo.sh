#!/usr/bin/env bash
# backup-mongo.sh — Phase 7 nightly Mongo backup.
#
# Usage:
#   MONGODB_URI=mongodb+srv://... BUCKET=s3://my-backups ./backup-mongo.sh
#
# Behaviour:
#   - dumps every database under MONGODB_URI to /backup/<UTC date>/
#   - gzips each collection
#   - if BUCKET is set, runs `aws s3 sync` to upload
#   - if BUCKET is unset, leaves the dump on local disk
#
# RPO/RTO note: see infra/scripts/README.md.
set -euo pipefail

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI not set" >&2
  exit 1
fi

DATE_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT_DIR="${OUT_DIR:-/backup}/${DATE_STAMP}"
mkdir -p "${OUT_DIR}"

echo "==> mongodump → ${OUT_DIR}"
mongodump --uri="${MONGODB_URI}" --gzip --out="${OUT_DIR}"

if [[ -n "${BUCKET:-}" ]]; then
  echo "==> aws s3 sync → ${BUCKET}/${DATE_STAMP}/"
  aws s3 sync "${OUT_DIR}" "${BUCKET}/${DATE_STAMP}/" \
    --storage-class STANDARD_IA \
    --exclude "*.tmp"
  echo "==> uploaded; pruning local copy"
  rm -rf "${OUT_DIR}"
else
  echo "==> BUCKET unset; leaving local backup at ${OUT_DIR}"
fi

echo "==> done"
