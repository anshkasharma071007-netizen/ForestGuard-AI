# Database operations

Run these commands from the repository root. The website and mobile app use the same FastAPI URL and media paths. PostgreSQL stores application records and citizen sessions. See [local and Supabase profiles](#local-and-supabase-profiles) for startup commands and media paths.

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
psql -d forest_guard_phase2_test -c 'GRANT CONNECT, CREATE ON DATABASE forest_guard_phase2_test TO forest_guard_app'
FOREST_GUARD_DB_MODE=local \
  FOREST_GUARD_TEST_POSTGRES_URL=postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_phase2_test \
  .venv/bin/python -m pytest -q
FOREST_GUARD_DB_MODE=local \
  WORKFLOW_TEST_DATABASE_URL=postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_phase2_test \
  .venv/bin/python -m backend.tests.report_workflow
```

The default suite migrates a temporary SQLite database. The PostgreSQL suite and browser scripts reject remote URLs and use an isolated backend profile. The example assumes the local initializer has already created the `forest_guard_app` login. Configure authentication for the new test database using the local server rules and export `PGPASSFILE` with its private passfile path if needed. To use a different non-admin test login, update the grant and URLs and set `LOCAL_DATABASE_ROLE` to match. The suite creates and drops an isolated, randomly named schema and isolates uploads.

The browser workflow uses an isolated schema and upload directory, installed YOLO-World and CLIP weights, and a local Chromium-compatible browser. Set `CHROMIUM_PATH` if the existing script cannot find your browser. It runs the authority production build and Expo web export before exercising both clients.
## Local and Supabase profiles

Run backend commands from the repository root. `FOREST_GUARD_DB_MODE` selects `local` (the default) or `cloud` before dotenv loads. Local mode reads the existing `.env`; cloud mode reads `.env.cloud` and uses the `CLOUD_DATABASE_*` settings. Set `FOREST_GUARD_ENV_FILE` before the command to select another private file. A missing explicitly selected file stops startup. Shell or deployment environment values take precedence over file values. For hosted deployments, the cloud variables can come entirely from the deployment's secret store. Use `FOREST_GUARD_ENV_FILE` instead of Uvicorn's `--env-file` for the cloud profile.

### Local PostgreSQL

Start the existing server in Postgres.app and keep its current `.env` and passfile. The existing database must already be at the checkout's Alembic head. Set `LOCAL_DATABASE_ROLE` in the private local profile only if the initializer originally used a different `--app-user`.

```sh
FOREST_GUARD_DB_MODE=local SEED_ON_START=false \
  .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

To use a different existing local profile, prefix the same command with `FOREST_GUARD_ENV_FILE=/path/to/private/backend.env`. For local owner migrations use `tools.init_database` with the existing database name, owner and passfile as documented below.

### Supabase session pooler

```sh
umask 077
test -e .env.cloud || cp .env.cloud.example .env.cloud
mkdir -p .forest-guard-local
chmod 600 .env.cloud
.venv/bin/python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Edit `.env.cloud` privately. Use the hostname shown in the Supabase **Connect → Session pooler** panel and the `forest_guard_app.<project-ref>` login. Enter its password as `CLOUD_DATABASE_PASSWORD` and save a separate generated `SECRET_KEY`. A single-quoted password can contain URL punctuation and dollar signs. Download the CA certificate from **Database → Settings** and save it at `.forest-guard-local/supabase-ca.crt` or set `CLOUD_DATABASE_SSL_ROOT_CERT` to its actual path. Enable Supabase SSL enforcement for the database leg of the pooler connection and disable the Data API for this FastAPI-only project. [Supabase psql connection guide](https://supabase.com/docs/guides/database/psql) · [Supabase SSL enforcement](https://supabase.com/docs/guides/platform/ssl-enforcement) · [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)

Cloud mode fixes the database to `postgres` and pooler port to `5432`. Psycopg verifies the certificate and hostname with `verify-full`. Clear inherited `PGSERVICE`, `PGHOSTADDR`, or `PGOPTIONS` if startup reports one. PostgreSQL connections have a 5-second default connect timeout, a 5-second pool checkout timeout and a 300-second recycle interval. Each backend process holds up to three pooled connections and can open two overflow connections. Checkout checks connection health. Budget five pooler sessions per backend process when setting worker and replica counts. [SQLAlchemy connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html)

```sh
.venv/bin/alembic heads
FOREST_GUARD_DB_MODE=cloud .venv/bin/alembic current
FOREST_GUARD_DB_MODE=cloud \
  .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Run only one profile on port 8000 at a time. From a second terminal, check `curl -fsS http://127.0.0.1:8000/api/health` for `"database":"ok"`. The cloud API checks the session identity, restricted role, schema and read-only Alembic revision at startup. Its runtime role needs CRUD on Forest Guard tables, usage on their sequences, and SELECT on `public.alembic_version`. The authority site and Expo app keep using their existing FastAPI origins. Keep database credentials out of both clients and out of all `VITE_*` or `EXPO_PUBLIC_*` variables.

### Explicit development accounts and reference data

On the private cloud development instance, run the provisioning command twice to verify that each account is created once. Then start the backend with the same development flags and sign in as both demo roles. Use citizen development OTP only when a private integration test needs it. Production requires the normal authority accounts and a production citizen OTP provider.

```sh
FOREST_GUARD_DB_MODE=cloud APP_ENV=development AUTHORITY_DEMO_ACCOUNTS_ENABLED=true \
  .venv/bin/python -m tools.provision_authority_demo
FOREST_GUARD_DB_MODE=cloud APP_ENV=development AUTHORITY_DEMO_ACCOUNTS_ENABLED=true \
  .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

- With an empty village registry, select GPS for onboarding and citizen reports. Village selection and village-based proximity require verified registry rows. Use the existing local-only village demo command for fictional geography. Import verified villages as a separately approved operation keyed by village code when genuine records are available.
- An empty risk settings table uses the bundled defaults. Administrators can save settings through the existing Settings screen when they need database-persisted overrides. The species catalogue comes from the application.
- Citizen reporting requires no camera, guard roster or historical incident records. Authority camera-media ingestion needs at least one configured camera station. Use genuine station records for that workflow. Cloud mode disables bundled operational and village demo seeding.

### Owner migrations

Revision `0007` is already applied to the supplied cloud project. For a future migration, create a separate mode-0600 owner passfile at `.forest-guard-local/supabase-owner.pgpass`. Use the session-pooler hostname, port, database and project-qualified owner login in the libpq passfile entry. Escape colons and backslashes in the password. The owner command reuses the selected cloud endpoint and CA. Substitute the owner's project-qualified login from Supabase.

```sh
env -u PGPASSWORD FOREST_GUARD_DB_MODE=cloud \
  FOREST_GUARD_MIGRATION_USER='postgres.<project-ref>' \
  FOREST_GUARD_MIGRATION_PASSFILE="$PWD/.forest-guard-local/supabase-owner.pgpass" \
  .venv/bin/alembic -x owner=1 upgrade head
```

For each new application table, explicitly grant the runtime role the required table privileges and sequence usage in the owner session. Keep revision metadata read-only for the runtime role. Check `alembic current` using the runtime profile before starting the API. The local initializer is for dedicated local databases.

### Media persistence and the object storage phase

PostgreSQL stores report status, photo paths, analysis state/results and detection media references. Citizen originals are in `UPLOAD_DIR/community`. The analysis worker reads those files and writes its results to PostgreSQL. Citizen owners and authorized authorities retrieve the photos through authenticated FastAPI routes. Camera uploads and annotations live under `UPLOAD_DIR/uploads` and `UPLOAD_DIR/annotated` and are currently served through `/media`. Video analysis uses local scratch frames.

Cloud mode defaults to `.forest-guard-local/cloud-uploads`. Use a persistent private volume for a single-host pilot, and back it up alongside PostgreSQL. The API and worker must see the same files. Keep camera evidence off the public deployment until it has an authenticated delivery path.

1. Add a backend storage adapter for the filesystem and a private Supabase Storage or S3-compatible bucket. Use opaque keys and backend-only credentials scoped to the evidence bucket. Keep original evidence and derived annotations private. [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
2. Keep uploads and authorization in FastAPI. Start with authenticated streaming through the existing evidence endpoints to preserve ownership checks. If signed downloads are needed later, issue short-lived links only after the same checks and keep links out of logs. [Supabase private downloads](https://supabase.com/docs/guides/storage/serving/downloads)
3. Store object identifiers, checksums and media types in PostgreSQL. Queue analysis only after the object is durable, stage downloads in temporary worker files, and make retries and orphan cleanup idempotent.
4. Plan a dry-run-first copy of existing media, verify checksums before changing pointers, and retain filesystem reads during the rollout. Test owner isolation, worker retries and missing-object recovery before enabling multi-instance deployment.
