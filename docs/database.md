# Database operations

Run these commands from the repository root. The website and mobile app use the same FastAPI URL and media paths. PostgreSQL stores application records and citizen sessions. See [local and Supabase profiles](#local-and-supabase-profiles) for startup commands and media paths.

## Initialize or upgrade a local database

Follow the [macOS or Windows setup commands](setup.md#1-backend-and-local-database). Re-run `python -m tools.init_database` with the same options to apply new Alembic revisions and check for model drift. It uses the provisioning login for migrations, then connects through the backend's SQLAlchemy engine factory as the restricted application role and checks all model tables. Re-running against the same target preserves existing application records, passwords, and the local environment file.

The default loopback server is `127.0.0.1:5432`, maintenance database `postgres`, target database `forest_guard_ai`, and runtime role `forest_guard_app`. Use `--host`, `--port`, `--maintenance-db`, `--database`, or `--app-user` to select a different local target. Use `--use-libpq` to skip the admin password prompt when credentials are already configured. `--no-env` prints the backend settings without creating an environment file. `--passfile` overrides the default ignored passfile path.

The provisioning account owns the database and applies DDL. FastAPI uses the restricted runtime login with CONNECT, schema USAGE, application-table SELECT/INSERT/UPDATE/DELETE, sequence USAGE/SELECT, and read access to the Alembic revision. The initializer uses the server's current authentication rules and does not edit service configuration. Revision `0008` requires PostGIS. Install the extension package for your local PostgreSQL version. The initializer enables it on the dedicated database when needed.

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

Revision `0008` adds jurisdiction polygons and assignments, indexed incident points and approximate alert points, a saved citizen alert radius, and camera upload references. It preserves report ownership and risk decisions. Existing alerts linked to verified incidents receive an approximate point. Reports stay in central review until an applicable jurisdiction is configured.

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
psql -d forest_guard_phase2_test -c 'CREATE EXTENSION postgis'
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

- Citizen onboarding and reporting accept GPS, address search, or a map pin with an empty village registry. Village-based proximity calculations use verified registry rows. Use the existing local-only village demo command for fictional geography. Import verified villages as a separately approved operation keyed by village code when genuine records are available.
- An empty risk settings table uses the bundled defaults. Administrators can save settings through the existing Settings screen when they need database-persisted overrides. The species catalogue comes from the application.
- Citizen reporting requires no camera, guard roster or historical incident records. Authority camera-media ingestion needs at least one configured camera station. Use genuine station records for that workflow. Cloud mode disables bundled operational and village demo seeding.

### Owner migrations

Use a separate mode-0600 owner passfile at `.forest-guard-local/supabase-owner.pgpass` to apply cloud migrations. Use the session-pooler hostname, port, database and project-qualified owner login in the libpq passfile entry. Escape colons and backslashes in the password. The owner command reuses the selected cloud endpoint and CA. Substitute the owner's project-qualified login from Supabase.

```sh
env -u PGPASSWORD FOREST_GUARD_DB_MODE=cloud \
  FOREST_GUARD_MIGRATION_USER='postgres.<project-ref>' \
  FOREST_GUARD_MIGRATION_PASSFILE="$PWD/.forest-guard-local/supabase-owner.pgpass" \
  .venv/bin/alembic -x owner=1 upgrade head
```

If you are upgrading from before `0008`, execute the following in the Supabase SQL Editor as the database owner after Alembic finishes.

```sql
BEGIN;
REVOKE ALL ON public.jurisdictions, public.authority_jurisdictions, public.camera_uploads
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.jurisdictions_id_seq, public.camera_uploads_id_seq
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.jurisdictions, public.camera_uploads TO forest_guard_app;
GRANT SELECT, INSERT, DELETE ON public.authority_jurisdictions TO forest_guard_app;
GRANT USAGE ON SEQUENCE public.jurisdictions_id_seq, public.camera_uploads_id_seq TO forest_guard_app;

DO $$
DECLARE spatial_schema text;
BEGIN
  SELECT n.nspname INTO STRICT spatial_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'postgis';
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO forest_guard_app', spatial_schema);
END $$;
COMMIT;
```

Revision `0009` separates the saved alert-search location from the onboarding location. It copies existing coordinates or village IDs into the new preferences once. On a database already at `0008`, run the same owner migration command above to advance to `0009`. The existing table-level grants already cover the new columns on `citizens`. If the deployment uses column-level grants, run the following as owner:

```sql
GRANT SELECT (alert_village_id, alert_lat, alert_lon),
      INSERT (alert_village_id, alert_lat, alert_lon),
      UPDATE (alert_village_id, alert_lat, alert_lon)
ON public.citizens TO forest_guard_app;
```

The runtime role retains read-only Alembic metadata access. Apply [revision `0010` and its runtime grants](citizen-services.md#migration-and-runtime-grants) before starting the current cloud API. For local PostgreSQL, apply migrations and runtime grants with `.venv/bin/python -m tools.init_database --admin-user <owner>`.

### Enable private Supabase Storage

1. In Supabase **Storage → New bucket**, create `forest-guard-evidence` with **Public bucket** off. Set the bucket and global file size limits to at least the API's `MAX_UPLOAD_MB` (25 MB by default). If you restrict MIME types, allow `image/jpeg`, `image/png`, `image/webp`, `video/mp4`, `video/quicktime`, `video/webm` and `video/x-msvideo`. Leave client access policies absent for this bucket. [Creating buckets](https://supabase.com/docs/guides/storage/buckets/creating-buckets) · [Storage permissions](https://supabase.com/docs/guides/storage/security/access-control)
2. Under **Settings → API Keys**, create a backend secret key. Add these fields to the existing ignored `.env.cloud` or server secret store on every API instance. Use the same project, bucket and application signing key on all instances. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

   ```dotenv
   MEDIA_STORAGE=supabase
   SUPABASE_STORAGE_URL=https://<project-ref>.supabase.co
   SUPABASE_STORAGE_BUCKET=forest-guard-evidence
   SUPABASE_STORAGE_KEY=<backend-secret-key>
   ```

3. Start the backend with the cloud profile. Use the existing Vite and Expo API origins. For a private development instance that needs citizen sign-in, enable `APP_ENV=development CITIZEN_DEV_OTP_ENABLED=true` explicitly.

   ```sh
   FOREST_GUARD_DB_MODE=cloud SEED_ON_START=false \
     .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
   # Run the clients in separate terminals.
   npm --prefix frontend run dev
   npm --prefix mobile run dev
   ```

Citizen originals, camera uploads and generated camera annotations are stored under opaque keys. FastAPI checks ownership or jurisdiction on each download and refuses uploads to a public bucket. The analysis worker stages remote inputs in temporary files. Existing local references remain readable on hosts with the original private uploads. Keep the existing private volume for those records until they are copied and verified separately. Leave `MEDIA_STORAGE=local` for filesystem development.

### Jurisdictions and nearby alerts

In authority **Settings**, add a GeoJSON Polygon or MultiPolygon in longitude/latitude order, create a range officer or forest guard, and select their jurisdictions. Lower priority numbers win overlaps. Identical priorities use the older jurisdiction ID. New reports use the incident GPS location, or the selected report village center. Creating a boundary also routes existing unassigned reports that it covers. Saved assignments stay attached to their reports. Central administrators can open **Reports → Central review queue** for pending reports outside configured boundaries.

The authenticated `POST /api/citizen/nearby-alerts` endpoint takes `source` (`saved` or `gps`), `lat` and `lon` for GPS, optional `radius_km` (5, 10, 20 or 25), `sort` (`time`, `risk`, or `distance`), `limit` and `offset`. Without a radius override it uses the saved preference. Distance is measured in metres to the same approximate coordinate returned to mobile. Only approved, active warnings appear. Incident resolution removes the warning and preserves citizen history and notifications.

On the intended **private development** database, run the following using its existing runtime connection profile. The command prompts for a new password on the first run and prints the development officer's sign-in email. Use `FOREST_GUARD_DB_MODE=local` for local PostgreSQL or `FOREST_GUARD_DB_MODE=cloud` for a private cloud development project.

```sh
APP_ENV=development DEMO_MODE=false SEED_ON_START=false \
  .venv/bin/python -m tools.provision_greater_noida
```

The Greater Noida polygon provides approximate development coverage. The provisioner stores the polygon and officer assignment through the same routing service as Settings. Existing assigned reports retain their assignments. An officer signs in and opens **Map** to view their assigned polygon. Central administrators can switch jurisdictions from the map.

Profile **Saved location** can store GPS or a registered village. Removing it clears the saved preference. Home and Map share the current search location and radius, while each new report requires its own incident location. GPS warning zones use an 8 km uncertainty radius around coarse grid centers. Village zones use a 1 km radius around the approximate registered center. The circles illustrate location uncertainty.

After deploying the new citizen risk policy, review candidate historical corrections with the runtime profile for the intended database:

```sh
.venv/bin/python -m tools.correct_citizen_risk
# Run only after reviewing the dry-run output and receiving approval.
.venv/bin/python -m tools.correct_citizen_risk --apply
```

The correction updates automatic citizen incident and alert assessments together and retains the previous assessment in the incident audit record. Manual decisions, incident status, saved locations and notification read receipts are preserved.

To provision two fictional boundaries and range officers, select an isolated, migrated local database with `test` in its name and no reports or jurisdictions. Keep bundled seeding disabled. The command prompts for a demo password. Use these flags on the private test server as well:

```sh
FOREST_GUARD_DB_MODE=local FOREST_GUARD_ENV_FILE=/path/to/ignored/test.env \
  APP_ENV=development DEMO_MODE=true DEMO_JURISDICTIONS_ENABLED=true SEED_ON_START=false \
  .venv/bin/python -m tools.seed_jurisdictions
```

The demo zones span longitude 79.10–79.20 and 79.20–79.30 at latitudes 21.65–21.85. Reports created in this test mode are labeled simulated.
