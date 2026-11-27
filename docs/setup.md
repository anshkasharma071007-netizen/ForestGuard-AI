# Setup and configuration

## Prerequisites

| Requirement | Version used | Notes |
| --- | --- | --- |
| Python | 3.11+ (built and tested on 3.14.7) | 64-bit, with `pip` |
| Node.js + npm | Node 20+ (tested on 24) | Vite 6 build/dev server |
| Disk | ~1.5 GB free | PyTorch, YOLO-World weights, CLIP weights |
| RAM | 6 GB recommended | Inference is CPU-only |

No GPU is required. Optional: Microsoft Edge (or Chrome) if you want to re-run the screenshot
and diagram scripts in `frontend/scripts/`.

## 1. Backend and local database

Run these commands from a fresh clone. Start your installed PostgreSQL server and use its local provisioning login. The login needs permission to create databases and roles on first setup and must own the database for updates. The initializer creates an empty, migrated database, generates a runtime password and creates a private `.env` when one is absent.

### macOS

Start the server in Postgres.app, or use `brew services start` with your installed Homebrew PostgreSQL formula. Postgres.app and many Homebrew installations create a role named after your macOS login. Substitute your provisioning login if yours differs.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-core.txt
.venv/bin/python -m tools.init_database --admin-user "$(id -un)"
.venv/bin/python -m tools.seed_demo  # optional
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

#### Existing macOS checkout and physical-phone testing

Start in the repository root. Use the same database owner and passfile as the original provisioning. The initializer applies revision `0005`, verifies the schema and checks that the runtime role can read the new objects.

```sh
brew services start postgresql@17  # only if PostgreSQL is stopped
.venv/bin/python -m tools.init_database --admin-user "$(id -un)" --use-libpq --no-env
DATABASE_URL=postgresql+psycopg:///forest_guard_ai .venv/bin/alembic current
APP_ENV=development AUTHORITY_DEMO_ACCOUNTS_ENABLED=true CITIZEN_DEV_OTP_ENABLED=true \
  AI_MODE=auto DEMO_MODE=false SEED_ON_START=false \
  .venv/bin/python -m uvicorn backend.main:app --reload --reload-dir backend --host 0.0.0.0 --port 8000 \
  --env-file .forest-guard-local/backend.env
```

Run the website and the native Expo dev server in two other terminals.

```sh
cd frontend
npm run dev
```

```sh
cd mobile
npm run dev -- --lan
```

Open the authority site on port 5173. On the phone, use a compatible Expo client on the same trusted LAN. Keep the existing ignored `mobile/.env`. Update `EXPO_PUBLIC_API_URL` only if the Mac's LAN address changed. Check `http://127.0.0.1:8000/api/health` on the Mac and open the same path at the LAN API origin on the phone to confirm connectivity. Use the existing dependencies for this upgrade.

### Windows PowerShell

Start your installed PostgreSQL service from **Services**. A typical installer-created provisioning login is `postgres`. Use the password chosen for that login during installation.

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-core.txt
.\.venv\Scripts\python.exe -m tools.init_database --admin-user postgres
.\.venv\Scripts\python.exe -m tools.seed_demo  # optional
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Enter the local PostgreSQL password at the hidden prompt. Press Enter when your installation already authenticates through libpq defaults. If another project uses either default name, pass both `--database forest_guard_dev` and `--app-user forest_guard_dev_app`. Use `--port` if your server uses a different port.

If `.env` already exists, setup prints the verified `DATABASE_URL` and `PGPASSFILE` entries. Apply them to your own development environment before starting or seeding. Keep the passfile private. On macOS use mode 0600. On Windows keep the checkout or a custom `--passfile` path in a directory accessible only to your account. Setup uses the server's existing TCP authentication rules. If the local connection is refused, check the service, port and authentication with the PostgreSQL administrator.

Open [API health](http://127.0.0.1:8000/api/health) and check for `"database": "ok"`. See [database operations](database.md) for reruns, advanced flags, and recovery.

The core install uses `AI_MODE=demo` and needs no inference weights. For upload inference install `requirements.txt` and set `AI_MODE=auto`.

### Authority demo sign-in

From the repository root, start the current backend with authority demos and citizen development OTP enabled. Stop a previous Uvicorn instance on port 8000 first so Vite connects to the current API.

```sh
APP_ENV=development AUTHORITY_DEMO_ACCOUNTS_ENABLED=true CITIZEN_DEV_OTP_ENABLED=true \
  AI_MODE=auto DEMO_MODE=false SEED_ON_START=false \
  .venv/bin/python -m uvicorn backend.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000 \
  --env-file .forest-guard-local/backend.env
```

Startup provisions the Range Officer (`admin@forestguard.ai`, role `admin`) and Forest Guard (`guard@forestguard.ai`, role `guard`). Use `AI_MODE=demo` with the core-only Python install. Open the Vite site and select **Use a demo account**. The buttons remain disabled while the site checks availability or if the request fails. If the page reports that demo accounts are unavailable, check the backend startup log and select **retry** after the backend is ready.

To provision just the authority accounts without starting the API, run from the repository root:

```sh
APP_ENV=development AUTHORITY_DEMO_ACCOUNTS_ENABLED=true \
  .venv/bin/python -m tools.provision_authority_demo --env-file .forest-guard-local/backend.env
```

Omit `--env-file` if the repository's ignored `.env` already points to the development database. The command uses the restricted runtime login and can be rerun safely. It reports an existing email with different credentials or role and preserves that account. This includes accounts from an earlier synthetic dataset seed. Sign in to those accounts with their existing credentials. After startup, the sign-in page offers matching demo accounts, and each button fills the form for the normal **Sign in** action. Disabling the flag or running outside development hides the buttons and rejects the provided demo credentials and their sessions.

### Model weights

The AI engine expects two artefacts:

| Artefact | Where | How to obtain |
| --- | --- | --- |
| `yolov8s-worldv2.pt` | repository root (path configurable via `YOLO_WORLD_WEIGHTS`) | Ultralytics YOLO-World v2 weights. Ultralytics will download it on first use if the file is absent and network access is available |
| CLIP `ViT-B-32.pt` | PyTorch cache (`weights/clip/` in this workspace) | Downloaded automatically by `clip.load("ViT-B/32")` on first run |

Both are excluded from git by `*.pt`. Air-gapped installs must copy these files in manually.
With `AI_MODE=demo`, standalone detection uploads return HTTP 503. Citizen photo reports still persist and show that analysis is unavailable. Authorities can review them manually.

## 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://127.0.0.1:5173>. Vite proxies `/api` and `/media` to `http://127.0.0.1:8000`
(see `frontend/vite.config.js`), so no CORS configuration is needed in development.

Production build:

```bash
npm run build          # frontend/dist
```

If `frontend/dist` exists when the backend starts, FastAPI mounts it at `/` and serves the SPA
alongside the API. That gives a single-origin deployment without a separate web server.

## 3. Environment variables

Copy `.env.example` to `.env` and edit as needed. `.env` is git-ignored. The database initializer generates a random authority signing secret for a new environment. To set one in an existing environment, run `python -c "import secrets; print(secrets.token_urlsafe(32))"` and save the output privately as `SECRET_KEY`. Outside development, the API refuses startup if the value is missing, too short, or a shipped placeholder. Local development can use an ephemeral key, which resets authority sessions after a restart.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_MODE` | `false` | Enables demo labeling and allows opt-in startup seeding |
| `SECRET_KEY` | Required outside development | Signs authority tokens. Generate a private random value of at least 32 characters |
| `DATABASE_URL` | `postgresql+psycopg://forest_guard_app@127.0.0.1:5432/forest_guard_ai` | Runtime login. Tests override it |
| `SEED_ON_START` | `false` | Startup seeding requires both this flag and `DEMO_MODE=true`. Use the explicit seed command for setup |
| `APP_ENV` | `production` | Set `development` only for local development sessions |
| `CITIZEN_DEV_OTP_ENABLED` | `false` | Set `true` together with `APP_ENV=development` to allow the local OTP `1234` |
| `AUTHORITY_DEMO_ACCOUNTS_ENABLED` | `false` | Set `true` together with `APP_ENV=development` to provision and enable the authority demo sign-ins |
| `PGPASSFILE` | Set by the initializer | Path to the private runtime libpq passfile |
| `AI_MODE` | `demo` in the generated environment | `auto` = load YOLO-World + CLIP; `demo` = no model loading, uploads 503 |
| `YOLO_WORLD_WEIGHTS` | `yolov8s-worldv2.pt` | Detector weights path (relative to repo root or absolute) |
| `RISK_CONFIG_PATH` | `demo_data/risk_config.json` | Initial risk settings from the existing file before the first database save |
| `CLIP_MODEL` | `ViT-B/32` | CLIP backbone |
| `AI_CONFIDENCE_THRESHOLD` | `0.55` | Reported/stored detection confidence floor used by the engine facade |
| `MAX_UPLOAD_MB` | `25` | Upload size limit for images and videos |
| `CORS_ORIGINS` | localhost:5173/4173/3000 | Comma-separated allowed origins |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | `admin@forestguard.ai` / `forest123` | Seeded admin credentials |
| `DEMO_GUARD_EMAIL` / `DEMO_GUARD_PASSWORD` | `guard@forestguard.ai` / `guard123` | Seeded guard credentials |
| `VITE_API_BASE_URL` | unset | Optional absolute API base for a split-origin frontend build |

## 4. Demonstration data

Run `python -m tools.seed_demo` with the backend virtual environment and your local settings to opt in to synthetic data. Set `DEMO_MODE=true` in that demo environment to display demo labeling. It seeds only when all application tables are empty. Repeating the command on a populated database skips seeding. A seed failure rolls back the database changes. Demo image copies can remain in `backend/uploads/demo` and are reused on retry.

Administrators can restore risk defaults in **Settings → Risk configuration → Restore defaults**, or run the API operation below.

```bash
curl -X POST http://127.0.0.1:8000/api/risk/config/reset -H "Authorization: Bearer <admin-token>"
```

## 5. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Upload returns 503 `AI engine unavailable` | `AI_MODE=demo`, or torch/ultralytics/clip not installed. Install the AI dependencies or keep demo mode knowingly |
| First upload stalls for seconds | Normal — models load once per process (≈5 s on CPU in the recorded smoke check) |
| Grey map tiles | OSM tiles require internet. The app uses a single `tile.openstreetmap.org` host; a proxy or offline tile cache is needed in restricted networks |
| `database is locked` | Another uvicorn process holds the SQLite write lock. Stop duplicates; WAL handles read concurrency only |
| Login fails after changing env | Demo users are seeded once. Changing seed credentials does not change an existing account |
| Frontend calls 404 | Backend not running, or `vite.config.js` proxy target changed. Confirm `http://127.0.0.1:8000/api/health` |
| Screenshot script cannot launch browser | It uses `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; adjust the path in `frontend/scripts/capture_screenshots.mjs` |

## 6. Security notes for a real deployment

This build is configured for a local, single-user demonstration:

- Set a strong `SECRET_KEY`, then change or remove the public demo accounts.
- Put the app behind TLS and a reverse proxy; tokens are bearer tokens in `localStorage`.
- Restrict `/media` if uploaded evidence must not be readable by every authenticated user.
- Community submissions are unauthenticated by design; add rate limiting and moderation before
  exposing the portal publicly.
