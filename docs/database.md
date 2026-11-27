# Local database operations

Run these commands from the repository root. The website and mobile app use the same FastAPI URL and media paths. PostgreSQL stores the application records and citizen sessions. Uploaded files live under `backend/uploads` unless `UPLOAD_DIR` specifies another directory.

## Initialize or upgrade a local database

Follow the [macOS or Windows setup commands](setup.md#1-backend-and-local-database). Re-run `python -m tools.init_database` with the same options to apply new Alembic revisions and check for model drift. It uses the provisioning login for migrations, then connects through the backend's SQLAlchemy engine factory as the restricted application role and checks all model tables. Re-running against the same target preserves existing application records, passwords, and the local environment file.

The default loopback server is `127.0.0.1:5432`, maintenance database `postgres`, target database `forest_guard_ai`, and runtime role `forest_guard_app`. Use `--host`, `--port`, `--maintenance-db`, `--database`, or `--app-user` to select a different local target. Use `--use-libpq` to skip the admin password prompt when credentials are already configured. `--no-env` prints the backend settings without creating an environment file. `--passfile` overrides the default ignored passfile path.

The provisioning account owns the database and applies DDL. FastAPI uses the restricted runtime login with CONNECT, schema USAGE, application-table SELECT/INSERT/UPDATE/DELETE, sequence USAGE/SELECT, and read access to the Alembic revision. The initializer uses the server's current authentication rules and does not edit service configuration. A fresh database requires only repository files and local PostgreSQL credentials.

Run `python -m tools.seed_demo` separately for the bundled demo. The command checks all app tables before copying media or inserting data and serializes concurrent attempts. Choose a separate database and `UPLOAD_DIR` if you want an independent demo beside your usual development database.

## Version the schema

The baseline is revision `0001`. Revision `0003` adds citizen accounts, hashed sessions, and nullable ownership and title fields for reports. Legacy reports retain their existing references and ownership. Revision `0004` indexes normalized Indian mobile numbers, canonicalizes unambiguous matches in place, and preserves foreign or otherwise unsupported historical numbers. If multiple historical accounts map to a single supported number, sign-in returns a conflict until those accounts are reviewed. Their IDs, phone records, and report ownership are preserved. Revisions live under `backend/migrations/versions`. Use the owner URL only for administrative commands. For routine local upgrades use the initializer. The following owner URL example uses the Unix socket and OS account of the original migration host.

```sh
owner_url=postgresql+psycopg:///forest_guard_ai
DATABASE_URL="$owner_url" .venv/bin/alembic current
DATABASE_URL="$owner_url" .venv/bin/alembic upgrade head
DATABASE_URL="$owner_url" .venv/bin/alembic check
```

For model changes, generate a revision against a development database at the previous head with `alembic revision --autogenerate -m "describe change"`. Review types, constraints, data transformations and downgrade behavior, exercise it on both database engines, then commit the revision. When running Alembic manually, run the initializer afterwards to grant runtime access to new application objects and check effective connectivity.

## Phase 2 settings and historical repair

Revision `0005` adds the `risk_configuration` table and resolution actor and notes to incidents. The existing unique foreign keys from incident to report and alert to incident continue to enforce one linked record at each step. The migration leaves historical report, incident and alert rows in place. On the first settings save, existing values from `demo_data/risk_config.json` or the configured `RISK_CONFIG_PATH` are carried into the database along with the changes. Future saves and resets use the database.

Revision `0006` records when photo analysis finishes for the authority report history. Existing reports keep their analysis results. Completion times are available after a new analysis run.

Revision `0007` adds persisted citizen notifications, authority alert read receipts, and a separate citizen-visible resolution note. The owner initializer applies the revision and grants access to the restricted runtime role. Existing citizen incidents keep their recorded risk, including after routine risk recalculation. The notification inbox starts with lifecycle actions recorded after the migration.

After applying the migrations with the owner account, use the runtime environment to preview historical corrections. The command lists candidates by report ID and action. It considers real authenticated citizen reports with preserved approval history. It can publish a missing alert for a verified, unresolved incident and repair clearly documented mismatches between incident and alert resolution. Records requiring judgment appear as `manual_review`. For an alert resolved in the old workflow, the repair copies the recorded timestamp, actor and note where available.

```sh
.venv/bin/dotenv -f .forest-guard-local/backend.env run -- \
  .venv/bin/python -m tools.reconcile_citizen_incidents
```

Review the preview and take a database backup before applying. Run the following command only after explicit approval for that database. Re-run the preview afterwards to confirm the repairable counts are zero and review any remaining `manual_review` records.

```sh
.venv/bin/dotenv -f .forest-guard-local/backend.env run -- \
  .venv/bin/python -m tools.reconcile_citizen_incidents --apply
```

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
createdb forest_guard_phase2_test
FOREST_GUARD_TEST_POSTGRES_URL=postgresql+psycopg:///forest_guard_phase2_test .venv/bin/python -m pytest -q
WORKFLOW_TEST_DATABASE_URL=postgresql+psycopg:///forest_guard_phase2_test .venv/bin/python -m backend.tests.report_workflow
```

The default suite migrates a temporary SQLite database. The PostgreSQL run needs an owner with schema creation rights. It creates an isolated, randomly named schema, restricts the search path to that schema, and drops it on teardown. Both runs isolate uploads and enable seeding only for the test dataset.

The browser workflow uses an isolated schema and upload directory, installed YOLO-World and CLIP weights, and a local Chromium-compatible browser. Set `CHROMIUM_PATH` if the existing script cannot find your browser. It runs the authority production build and Expo web export before exercising both clients.
