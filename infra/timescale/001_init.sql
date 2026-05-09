-- 001_init.sql — TimescaleDB extensions + app role.
--
-- Runs on first container start via /docker-entrypoint-initdb.d/. The official
-- timescale/timescaledb image creates the database matching $POSTGRES_DB
-- before this script runs, so we just enable extensions and provision a
-- least-privilege app role for asyncpg/pgx connections.

CREATE EXTENSION IF NOT EXISTS timescaledb;
-- pg_trgm for symbol substring search (Phase 5: dynamic market discovery).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- App role used by both gateway (pgx) and quant (asyncpg). The dev
-- compose file provisions Postgres with role 'app' / db 'finance' already
-- (POSTGRES_USER=app); this block is a safety net in case the image is
-- bootstrapped with different defaults.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'app';
  END IF;
END $$;

GRANT ALL PRIVILEGES ON DATABASE finance TO app;
