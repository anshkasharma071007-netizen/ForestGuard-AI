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

## 1. Backend

```bash
python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

`requirements.txt` pulls torch, ultralytics and OpenAI CLIP from git. If you only need the
dashboard and API (no inference), install just the core block marked in the file, then set
`AI_MODE=demo`.

Start the API:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

On first boot the app:

1. creates `backend/database/forest_guard.db` (WAL mode, foreign keys on);
2. creates the upload folders under `backend/uploads/`;
3. seeds the synthetic demo dataset unless the database already has data.

Check it is alive:

```bash
curl http://127.0.0.1:8000/api/health
```

Interactive OpenAPI docs: <http://127.0.0.1:8000/docs>.

### Model weights

The AI engine expects two artefacts:

| Artefact | Where | How to obtain |
| --- | --- | --- |
| `yolov8s-worldv2.pt` | repository root (path configurable via `YOLO_WORLD_WEIGHTS`) | Ultralytics YOLO-World v2 weights. Ultralytics will download it on first use if the file is absent and network access is available |
| CLIP `ViT-B-32.pt` | PyTorch cache (`weights/clip/` in this workspace) | Downloaded automatically by `clip.load("ViT-B/32")` on first run |

Both are excluded from git by `*.pt`. Air-gapped installs must copy these files in manually.
If inference dependencies or weights are unavailable, run with `AI_MODE=demo`; uploads then
return HTTP 503 with an explanatory message rather than inventing a detection.

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

Copy `.env.example` to `.env` and edit as needed. `.env` is git-ignored.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_MODE` | `true` | Adds demo/synthetic badges and flags to API payloads |
| `SECRET_KEY` | insecure dev default | Signs auth tokens. **Set a long random value for any shared deployment** |
| `DATABASE_URL` | `sqlite:///backend/database/forest_guard.db` | SQLAlchemy URL. Tests override it with a temp file |
| `SEED_ON_START` | `true` | Seed the demo dataset when the DB is empty |
| `AI_MODE` | `auto` | `auto` = load YOLO-World + CLIP; `demo` = no model loading, uploads 503 |
| `YOLO_WORLD_WEIGHTS` | `yolov8s-worldv2.pt` | Detector weights path (relative to repo root or absolute) |
| `CLIP_MODEL` | `ViT-B/32` | CLIP backbone |
| `AI_CONFIDENCE_THRESHOLD` | `0.55` | Reported/stored detection confidence floor used by the engine facade |
| `MAX_UPLOAD_MB` | `25` | Upload size limit for images and videos |
| `CORS_ORIGINS` | localhost:5173/4173/3000 | Comma-separated allowed origins |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | `admin@forestguard.ai` / `forest123` | Seeded admin credentials |
| `DEMO_GUARD_EMAIL` / `DEMO_GUARD_PASSWORD` | `guard@forestguard.ai` / `guard123` | Seeded guard credentials |
| `VITE_API_BASE_URL` | unset | Optional absolute API base for a split-origin frontend build |

## 4. Resetting the demo

Stop the backend, delete the database files, and restart:

```bash
rm -f backend/database/forest_guard.db backend/database/forest_guard.db-wal backend/database/forest_guard.db-shm
python -m uvicorn backend.main:app --port 8000
```

The deterministic seed recreates 5 villages, 12 cameras, 6 guards, 230 detections, 18 tracks,
13 alerts and 6 incidents. Uploaded media under `backend/uploads/uploads/` and generated
annotated files under `backend/uploads/annotated/` can be removed the same way; seeded evidence
thumbnails are read from `demo_data/detection_images/`.

To reset only the risk configuration, use **Risk & Alerts → Configuration → Reset**, or:

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
| Login fails after changing env | Demo users are seeded once. Reset the DB or update the users through the seed config |
| Frontend calls 404 | Backend not running, or `vite.config.js` proxy target changed. Confirm `http://127.0.0.1:8000/api/health` |
| Screenshot script cannot launch browser | It uses `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`; adjust the path in `frontend/scripts/capture_screenshots.mjs` |

## 6. Security notes for a real deployment

This build is configured for a local, single-user demonstration:

- Set a strong `SECRET_KEY`, then change or remove the public demo accounts.
- Put the app behind TLS and a reverse proxy; tokens are bearer tokens in `localStorage`.
- Restrict `/media` if uploaded evidence must not be readable by every authenticated user.
- Move off SQLite for multi-worker deployments (PostgreSQL + PostGIS is the natural upgrade).
- Community submissions are unauthenticated by design; add rate limiting and moderation before
  exposing the portal publicly.
