# Local database operations

Run these commands from the repository root. The website and mobile app use the same FastAPI URL and media paths. PostgreSQL holds the ten application tables. Uploaded files live under `backend/uploads` unless `UPLOAD_DIR` specifies another directory.

## Start the configured Mac

```sh
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"
pgdata="$HOME/Library/Application Support/Postgres/var-18"
pg_ctl -D "$pgdata" status || pg_ctl -D "$pgdata" -l "$pgdata/postgresql.log" start
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

The runtime reads `DATABASE_URL` and `PGPASSFILE` from the ignored `.env`. The local passfile lives in `.forest-guard-local/pgpass` with mode 0600. Its libpq entry uses the host, port, database, login and password fields in that order. Keep `SEED_ON_START=false` for the shared database.

## Database ownership and access

The local owner connects through the Unix socket using the macOS account. It owns `forest_guard_ai`, applies DDL, and runs the initial import. FastAPI connects over loopback as `forest_guard_app`. This login has CONNECT, schema USAGE, application-table SELECT/INSERT/UPDATE/DELETE and sequence USAGE/SELECT. It can read the migration revision. It has no schema creation, database creation, role management, replication, row-security bypass or superuser privileges.

In this cluster, role-specific entries at the top of `pg_hba.conf` require SCRAM for this login on the target database and reject its connections to other databases. The service listens on localhost. The existing authentication rules for other logins follow these entries. The previous HBA file and pre-cutover environment are stored privately in `.forest-guard-local/`.

## Version the schema

The baseline is revision `0001`. Revisions live under `backend/migrations/versions`. Use the owner URL only for administrative commands. On this Mac the following URL selects the local Unix socket and OS account.

```sh
owner_url=postgresql+psycopg:///forest_guard_ai
DATABASE_URL="$owner_url" .venv/bin/alembic current
DATABASE_URL="$owner_url" .venv/bin/alembic upgrade head
DATABASE_URL="$owner_url" .venv/bin/alembic check
```

For model changes, generate a revision against a development database at the previous head with `alembic revision --autogenerate -m "describe change"`. Review types, constraints, data transformations and downgrade behavior, exercise it on both database engines, then commit the revision. The configured owner's default privileges grant runtime access to new application tables and sequences. If rebuilding the baseline in a fresh database, revoke INSERT, UPDATE and DELETE on `alembic_version` from the runtime role after upgrade.

## Back up and transfer an existing SQLite database

Quiesce the FastAPI writers for the final backup and keep them quiescent through cutover. This includes clients requesting detection detail, which recalculates a stored risk score. SQLite's backup API reads committed pages including the WAL. Media files are copied separately. Choose a fresh private directory outside the uploads tree.

```sh
snapshot="backups/phase1-$(date +%Y%m%d-%H%M%S)"
.venv/bin/python -m tools.backup_sqlite backup backend/database/forest_guard.db backend/uploads "$snapshot"
.venv/bin/python -m tools.backup_sqlite verify "$snapshot"
```

The snapshot contains a self-contained `forest_guard.db`, the entire `uploads/` tree and `sha256.json`. Verification checks SHA-256 for the database and every media file, SQLite integrity, foreign keys, and every stored media reference. Keep the source database and its SQLite-managed sidecars together.

Use an empty, migrated `forest_guard_ai` target at revision `0001`. Import using the database owner, then compare responses using the runtime login. For a pre-cutover comparison, supply the PostgreSQL URL and passfile in the command environment. The API check logs in using the configured admin account and exercises existing data in read-only transactions.

```sh
owner_url=postgresql+psycopg:///forest_guard_ai
DATABASE_URL="$owner_url" .venv/bin/python -m tools.migrate_sqlite "$snapshot/forest_guard.db"
DATABASE_URL="$owner_url" .venv/bin/python -m tools.migrate_sqlite "$snapshot/forest_guard.db" --verify-only
PGPASSFILE="$PWD/.forest-guard-local/pgpass" \
  DATABASE_URL=postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_ai \
  .venv/bin/python -m tools.compare_database_api "$snapshot/forest_guard.db"
```

The importer checks both schemas, locks the target tables, and refuses a populated destination. In one transaction it copies typed rows in foreign-key order, compares counts and every column in primary-key order, checks for orphaned keys and restarts each ID sequence above its largest imported ID. A failed import rolls back its inserts and sequence restarts. Use `--verify-only` to compare again. The parity check excludes token bytes and request-time timestamps. Detection detail and other write paths run in the isolated test suite.

After successful verification, configure the runtime URL, passfile and disabled seeding in the private environment. Restart the API and check `/api/health`. Resume clients after confirming the connection as `forest_guard_app` in `pg_stat_activity`.

## Restore and rollback

For a pre-cutover recovery point, verify the saved directory, restore into a **new** directory, and start an independent API on port 8001. Set `snapshot` to the chosen backup directory. These commands leave the backup and original SQLite files intact.

```sh
.venv/bin/python -m tools.backup_sqlite verify "$snapshot"
restore_dir=$(mktemp -d)
cp -R "$snapshot/." "$restore_dir/"
.venv/bin/python -m tools.backup_sqlite verify "$restore_dir"
DATABASE_URL="sqlite:///$restore_dir/forest_guard.db" UPLOAD_DIR="$restore_dir/uploads" \
  SEED_ON_START=false .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8001
```

The legacy snapshot already has the application tables. For future migrations on a restored working copy, compare its schema with baseline `0001` first. The import verifier compares both schemas to the models. For an independent schema-only check on a legacy copy, use `tools.migrate_sqlite.checked_schema(connection)` with a SQLAlchemy connection to the copy. At the Phase 1 checkout, run `DATABASE_URL="sqlite:///$restore_dir/forest_guard.db" .venv/bin/alembic stamp 0001` on that copy, then run `alembic check` with the same URL to confirm there is no model drift.

For a full rollback, quiesce clients, retain PostgreSQL and current media, and reconcile any reports, status changes or uploads accepted after cutover. The SQLite recovery point contains only pre-cutover records. Once reconciled, point the private `DATABASE_URL` and `UPLOAD_DIR` at the chosen working copy and restart the usual API on port 8000. The original SQLite and uploads are also available at their pre-cutover paths.

## Tests

```sh
.venv/bin/python -m pytest -q
FOREST_GUARD_TEST_POSTGRES_URL=postgresql+psycopg:///forest_guard_ai .venv/bin/python -m pytest -q
```

The default suite migrates a temporary SQLite database. The PostgreSQL run needs an owner with schema creation rights. It creates an isolated, randomly named schema, restricts the search path to that schema, and drops it on teardown. Both runs isolate uploads and enable seeding only for the test dataset.
