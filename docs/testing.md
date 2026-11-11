# Testing and verification

## Summary

| Check | Command | Result (11 Nov 2026) |
| --- | --- | --- |
| Backend API + domain tests | `python -m pytest -q` | **28 passed**, 2 deprecation warnings, ~1.8 s |
| Frontend production build | `cd frontend && npm run build` | Passes (Vite 6) |
| AI pipeline smoke check | `python tools/evaluate_species.py ...` | 6/6 top-1 on 6 reference photos — smoke check only |
| End-to-end UI flows | `node scripts/capture_screenshots.mjs` | 10 screenshots captured from live app, no browser errors |

The 28 tests run against a **temporary SQLite database** created per session under the OS temp
directory, with `AI_MODE=demo`. They never touch the demo database, never download model
weights and never require a GPU. The AI upload test asserts that demo mode returns `503` and
leaves detection counts unchanged — i.e. no fabricated result is ever returned.

## How the suite is isolated

`tests/conftest.py` sets environment variables **before** importing the app:

```python
os.environ["DATABASE_URL"] = f"sqlite:///{tempdir}/test.db"
os.environ["AI_MODE"] = "demo"
os.environ["SEED_ON_START"] = "true"
os.environ["DEMO_MODE"] = "true"
os.environ["SECRET_KEY"] = "test-secret-key-not-for-production"
```

The `client` fixture enters the FastAPI lifespan once per session (creating tables and seeding),
and session-scoped `admin_headers` / `guard_headers` fixtures log in once. Tests that save the
risk configuration monkeypatch `backend.config.RISK_CONFIG_PATH` to `tmp_path`, so the real
`demo_data/risk_config.json` is never modified.

## What is covered

### `tests/test_api_core.py` — 9 tests

- `/api/health` and `/api/meta` report version, demo mode and AI status.
- Login succeeds with demo credentials and rejects wrong passwords; protected endpoints return
  401 without a token.
- Seed registry counts: 12 cameras, 5 villages, 6 guards.
- Detection history pagination, species/risk/village filters and a detail record.
- Map layer payload contains forest, villages, cameras, guards, risk cells and detections.
- Tracks expose camera-sequence inference and a no-GPS disclaimer; no `gps` keys.
- AI status works; upload in demo mode is refused with 503 and counts are unchanged.
- Analytics CSV export has the expected header and an attachment disposition.

### `tests/test_api_risk_alerts.py` — 5 tests

- 30-day analytics: six species, risk-level sums equal totals, synthetic-data note present.
- Risk zones and village exposure return `max_score` values in range.
- Risk configuration: guard gets 403, admin can PATCH, and reset restores defaults — written to
  a temp file, not the repo.
- Full alert lifecycle: acknowledge → assign → respond → resolve, with an append-only event
  trail asserting actor and action order.
- Alert list filters (status, risk level, village) and 404 for a missing alert.

### `tests/test_api_guard_community.py` — 9 tests

- Admin guard dashboard is a dispatch view across all guards.
- A guard's board is scoped to their badge (G-101) and task list.
- Admin can open any guard's board by `guard_id`.
- Public advisories are sanitised: no latitude/longitude keys, no camera identifiers.
- Community summary and village list expose names and coarse risk, never coordinates.
- Report round-trip: submit a sighting → receive `FG-YYYY-NNNN` → status returns the same code.
- Validation errors for malformed submissions (missing fields, bad enums, oversized text).
- Safety guidelines endpoint returns content.
- Incidents and the internal reports inbox are guard/admin-only.

### `tests/test_geospatial.py` — 5 tests

- Haversine distance against a known city pair.
- Point-in-polygon membership and a closed circle ring (33 points for 32 segments).
- Risk-level threshold boundaries (34.9/35/64.9/65).
- Explainable score: components are returned as key/points pairs, points sum to the weighted
  total, score is bounded 0–100, and both `prior_detections` and verified incidents move it.
- Default weights sum to 1.0.

## Running

```bash
# from the repository root, venv active
python -m pytest -q
python -m pytest -q tests/test_geospatial.py -v      # single module
```

The two warnings are Starlette's `anyio` deprecation notice from `TestClient`; they do not
affect results.

## Browser verification and screenshots

`frontend/scripts/capture_screenshots.mjs` drives Microsoft Edge through `playwright-core` at
1440×900. It exercises real flows rather than seeding screenshots by hand:

1. log in as admin and wait for the overview to finish loading;
2. upload `demo_data/wildlife_images/tiger.jpg` on Live Monitoring, select a camera, run AI
   analysis, wait for "Analysis complete" and capture the annotated result;
3. load the GIS map and wait until every Leaflet tile has finished loading;
4. submit a community sighting report, read the generated reference code, and query its status;
5. capture analytics and the report builder.

Because the upload happens before the other pages are captured, every screenshot shows the same
data state (231 detections, 14 alerts, 4 community reports at capture time) and the new alert
appears consistently on the overview, guard panel and analytics pages.

```bash
# backend on :8000 and vite on :5173 must be running
cd frontend
node scripts/capture_screenshots.mjs               # all 10 screenshots
node scripts/capture_screenshots.mjs --maps-only   # just the three map-centric pages
```

Diagram PNGs are rendered from the hand-authored SVGs at 2× scale:

```bash
cd frontend
node scripts/render_diagrams.mjs
```

## AI evaluation

`tools/evaluate_species.py` runs the real engine over a folder of labelled images and writes a
JSON summary:

```bash
python tools/evaluate_species.py \
  --images demo_data/wildlife_images \
  --output docs/references/ai_smoke_evaluation.json
```

The recorded run: 6 images (one per species), 6/6 top-1, 1.8 s inference, 5.16 s engine load,
CPU. **This is a smoke check that the pipeline works end-to-end, not an accuracy measurement.**
It uses one licenced photograph per class and no train/test split. Read
[ai-limitations.md](ai-limitations.md) before quoting any number from it.

## What is not covered

- No UI unit/component tests (verification is via the Playwright flows above).
- No load, concurrency or soak testing; inference is serialised by a process-wide lock.
- No automated accessibility audit; pages use semantic landmarks and keyboard-reachable controls
  but this has not been formally tested.
- No security penetration test. RBAC and public/private separation are covered functionally.
- Real camera feeds, SMS/email dispatch and PostGIS are out of scope and are not simulated as if
  they existed.
