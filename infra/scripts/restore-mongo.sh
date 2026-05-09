#!/usr/bin/env bash
# restore-mongo.sh — pair of backup-mongo.sh.
#
# Usage:
#   MONGODB_URI=... BUCKET=s3://my-backups RESTORE_FROM=20260101T000000Z ./restore-mongo.sh
#
# Steps:
#   1. Pull the dump from S3 (or read locally if BUCKET unset and OUT_DIR set)
#   2. Validate the dump structure (expects /<db>/<col>.bson.gz)
#   3. mongorestore --gzip
#
# Safety: by default this REFUSES to run when the target DB already has
# documents. Set CONFIRM_OVERWRITE=yes to override.
set -euo pipefail

if [[ -z "${MONGODB_URI:-}" || -z "${RESTORE_FROM:-}" ]]; then
  echo "MONGODB_URI and RESTORE_FROM (timestamp dir) required" >&2
  exit 1
fi

WORK_DIR="${WORK_DIR:-/tmp/restore}/${RESTORE_FROM}"
mkdir -p "${WORK_DIR}"

if [[ -n "${BUCKET:-}" ]]; then
  echo "==> aws s3 sync ${BUCKET}/${RESTORE_FROM}/ → ${WORK_DIR}"
  aws s3 sync "${BUCKET}/${RESTORE_FROM}/" "${WORK_DIR}/"
fi

echo "==> validating dump shape"
if ! ls "${WORK_DIR}"/*/*.bson.gz >/dev/null 2>&1; then
  echo "no .bson.gz files under ${WORK_DIR}" >&2
  exit 2
fi

if [[ "${CONFIRM_OVERWRITE:-}" != "yes" ]]; then
  echo "Target DB will be overwritten. Set CONFIRM_OVERWRITE=yes to proceed." >&2
  exit 3
fi

echo "==> mongorestore"
mongorestore --uri="${MONGODB_URI}" --gzip --drop "${WORK_DIR}"

echo "==> done"
