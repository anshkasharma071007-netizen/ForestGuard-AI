# Forest Guard AI

Continue from `codex/mobile-profile-workflow`. The incident-reporting branch merged into `main` at `6f8e109` and citizen onboarding was added in `93a6c58`. Preserve branding, working features, records and Alembic history. Keep secrets, machine-specific addresses, databases, model weights and uploaded evidence in ignored local files. Keep operational data genuine. Use the explicit, labeled demo dataset only when needed and only in an empty database.

## Architecture and development

- `backend/` is the shared FastAPI API with SQLAlchemy and PostgreSQL. `backend/migrations/` tracks the schema. `ai_engine/` runs YOLO-World v2 localization and CLIP ViT-B/32 classification locally. `geospatial/` holds risk calculations and GeoJSON.
- `frontend/` is the React/Vite authority website. Its dev server proxies `/api` and `/media` to port 8000. `mobile/` is the Expo React Native app using the same backend. Set `EXPO_PUBLIC_API_URL` in `mobile/.env` for the target device. Use the computer's LAN origin on a phone and allow the matching web origin through backend CORS when using Expo web.
- From the root, create `.venv` if needed and install `.venv/bin/python -m pip install -r requirements.txt`. `requirements-core.txt` is sufficient for `AI_MODE=demo`, which disables inference. `AI_MODE=auto` uses the installed Python inference stack, `yolov8s-worldv2.pt` and cached CLIP weights. `DEMO_MODE` controls demo labeling independently of `AI_MODE`.
- Start local PostgreSQL and run `.venv/bin/python -m tools.init_database --admin-user <owner>`. The owner applies migrations and the API uses a restricted runtime role and private passfile. Keep existing settings and data. If the checkout already has a `.env` for a different database, use the initializer's connection settings in a separate ignored environment file and pass it to Uvicorn with `--env-file`. Keep `SEED_ON_START=false` and `DEMO_MODE=false` for real data. Use `.venv/bin/python -m tools.seed_demo` explicitly only if needed.
- Start FastAPI with `.venv/bin/python -m uvicorn backend.main:app --reload --port 8000`. For a phone on a trusted development LAN, use `--host 0.0.0.0`. Install both clients with `npm ci` inside their directories, then run `npm run dev` in each (Vite on 5173, Expo on 8081).
- Check Alembic head (`0004`), `/api/health` (`database: ok`), `.venv/bin/python -m pytest -q`, `npm run build` in `frontend/`, and `npm run typecheck` in `mobile/`. See [setup](docs/setup.md), [database operations](docs/database.md), and [mobile development](mobile/MOBILE_DEVELOPMENT.md).

## Current progress

Citizen onboarding and profile persistence are implemented, including development-only OTP, GPS or village setup, SecureStore sessions on native and HttpOnly cookie sessions on web. The mobile tabs are Home, Map, and Profile. Home lists owned reports and verified public alerts. Citizen reports require a title, category, and explicit incident location. They retain optional photo analysis, deduplication, receipt recovery, and official review. Anonymous historical reports remain unowned. Native photo upload uses `expo-file-system`. The authority website still uses its existing workflow and alert eligibility rules.

Phase 1 adds strict Indian mobile authentication, canonical phone storage and concurrent-account protection. Migration `0004` preserves citizen IDs and report ownership. Conflicting historical accounts require manual review before their number can sign in. Mobile history comes from the authenticated API. Sign-out clears private screens immediately and removes local submission recovery keys. Sessions use SecureStore on native and HttpOnly cookies on web. Development OTP and demo mode are opt-in. Production requires an explicitly configured authority signing secret. Phase 1 passed backend suites on SQLite and PostgreSQL, the browser account-switching workflow, mobile type checking, and the authority production build. Physical-device verification is pending.

## Final functional specification

**Mobile.** Exactly three navigation tabs, Home, Map, and Profile. First-time onboarding collects name, phone, optional email, OTP verification, and GPS or manual location. Home offers New Report, My Reports, and nearby alerts sortable by time, risk, and distance. Map shows the user's location, a selectable radius, risk-colored incident markers, and clickable alert details. Profile covers personal information, location preferences, and appearance. Alerts and reports are Home features rather than separate tabs.

**Report form.** Require title, location, and incident category. Description and photo are optional. Species is optional or Unknown. Reporter identity comes from the authenticated profile.

**Incident lifecycle.** Persist the report, analyze any attached photo, then let authorities review the evidence. AI assists identification. Authorities make every verification decision.

| Status | Outcome |
| --- | --- |
| Pending | Awaiting authority review. |
| Under work | Authority verifies the report and a public alert is issued. Every approved report is published, with risk determining severity. |
| Rejected | Report is invalid and no public alert is published. |
| Resolved | Incident is handled, the public alert closes, and reporter status updates. |

**Authority website.** Dashboard covers pending reports, active alerts, and resolved incidents. Reports covers citizen reports, evidence, AI analysis, and review actions. Map covers incidents and geographic risk. Alerts covers active incident management and resolution. Settings covers authority account and configuration. Existing monitoring, tracking, analytics, and guard management modules can remain as lower priorities.

**Shared constraints.** Accept OTP `1234` only during development and never in public production. Public map markers use approximate incident locations and exclude private reporter information and sensitive wildlife coordinates. Both clients share the API and database. In-app alerts and report status sync automatically. Background push notifications are deferred. Keep development scoped to the requested features and preserve existing interfaces and functionality outside those changes.

## Remaining development order

1. Simplified authority website and final incident lifecycle, including alert publication and resolution synchronization.
2. Shared interactive maps.
3. Complete physical-device integration testing, including native SecureStore restart, invalid sessions, failed sign-out, account switching with a previously opened photo, GPS, camera, and gallery.
