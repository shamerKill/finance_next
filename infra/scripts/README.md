# Backup & disaster-recovery scripts

These scripts implement Phase 7's commit-only backup story. **None of
them are auto-run** — wire them into a cron / Kubernetes CronJob /
GitHub Actions schedule when you're ready to operate the system.

## RPO / RTO targets

| Target  | Value | How we hit it                                  |
| ------- | ----- | ---------------------------------------------- |
| **RPO** | 1 h   | Hourly Mongo dumps + Timescale streaming WAL.  |
| **RTO** | 4 h   | Cold-restore from S3 + reconcile open orders.  |

Phase 7 ships only the *daily* base dump scripts; hourly oplog tailing
is a Phase 8 add-on (Mongo Atlas already provides PIT recovery, so the
self-hosted variant only matters when running locally).

## Files

| Script | Purpose |
| --- | --- |
| `backup-mongo.sh`    | `mongodump --gzip` → optional `aws s3 sync`. |
| `backup-timescale.sh`| `pg_dump --format=custom --compress=9` → optional S3 upload. |
| `restore-mongo.sh`   | Reverse of `backup-mongo.sh`; refuses to run without `CONFIRM_OVERWRITE=yes`. |
| `restore-timescale.sh` | Reverse of `backup-timescale.sh`; same safety gate. |

## Required env vars

Common to all four:

- `MONGODB_URI` (Mongo) or `TIMESCALE_DSN` (Postgres)
- `BUCKET` — `s3://...` destination. Optional; without it, scripts
  leave the dump on local disk under `/backup`.
- `RESTORE_FROM` (restore only) — UTC timestamp directory of the dump
  to restore.
- `CONFIRM_OVERWRITE=yes` (restore only) — required to actually run.

## Suggested cron

```cron
# Mongo: nightly at 02:15 UTC
15 2 * * * MONGODB_URI=$MONGODB_URI BUCKET=s3://finance-next-backups /opt/finance/infra/scripts/backup-mongo.sh

# Timescale: nightly at 02:30 UTC
30 2 * * * TIMESCALE_DSN=$TIMESCALE_DSN BUCKET=s3://finance-next-backups /opt/finance/infra/scripts/backup-timescale.sh
```

Or as Kubernetes CronJobs — see `infra/k8s/` for the ConfigMap +
Secret refs to mirror.

## Restore drill checklist

1. Spin up an empty target Mongo + Timescale.
2. `RESTORE_FROM=YYYYMMDDTHHMMSSZ CONFIRM_OVERWRITE=yes ./restore-mongo.sh`.
3. Same for `restore-timescale.sh`.
4. Bring up the gateway with `MONGODB_URI`/`TIMESCALE_DSN` pointing
   at the restored stores.
5. Verify a known-good `_id` round-trips through `/api/v1/option/:id`.
6. Verify `/api/v1/market/ohlcv?symbol=BTCUSDT&timeframe=5m` returns
   recent bars.
7. Re-enable the scheduler / order engine only after you've confirmed
   the data is fresh.
