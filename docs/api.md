# API summary

Base URL: `http://127.0.0.1:8000`. All responses are JSON unless noted. Interactive OpenAPI
documentation is served at `/docs`.

**Auth.** `Authorization: Bearer <token>` from `POST /api/auth/login`. "Guard" below means any
authenticated user (`admin` or `guard`); "Admin" means the `admin` role only. Public endpoints
need no token. Errors use FastAPI's `{"detail": "..."}` shape.

## Auth — `/api/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/login` | public | Body `{email, password}` → token, user, role |
| GET | `/me` | Guard | Current user profile |

## Core — `/api`

| Method | Path | Auth | Notes / key parameters |
| --- | --- | --- | --- |
| GET | `/health` | public | DB check, record counts, AI mode |
| GET | `/meta` | public | Project metadata, supported species, demo flags |
| GET | `/overview` | Guard | KPI cards, recent detections, active alerts, species mix |
| GET | `/cameras` | Guard | Camera registry with station coordinates |
| GET | `/villages` | Guard | Village registry, boundaries, exposure |
| GET | `/guards` | Guard | Guard roster and assignment state |
| GET | `/detections` | Guard | `species`, `risk`, `zone`, `camera`, `basis`, `date_from`, `date_to`, `search`, `page`, `page_size` |
| GET | `/detections/{id}` | Guard | Full detection with bbox, media, risk components |
| POST | `/detections/upload` | Guard | Multipart `file`, `camera_id`, optional `notes`; returns analysis. **503 in `AI_MODE=demo`** |
| GET | `/tracks` | Guard | `species`, `direction`; inferred camera sequences, not GPS |
| GET | `/map/layers` | Guard | `species`, `risk`, `days`; forest, villages, cameras, guards, risk cells, detections, tracks, alert coverage |
| GET | `/ai/status` | Guard | Engine mode, loaded state, device, thresholds |

## Risk and analytics — `/api`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/risk/config` | Guard | Active weights, thresholds, radii, species weights |
| PATCH | `/risk/config` | Admin | Partial update; re-scores all detections |
| POST | `/risk/config/reset` | Admin | Restore `demo_data/risk_config.json` defaults |
| POST | `/risk/recalculate` | Admin | Force a re-score without changing config |
| GET | `/risk/zones` | Guard | `days`; gridded risk cells with score/level/basis |
| GET | `/analytics` | Guard | `days`; trends, species mix, villages, response metrics, risk distribution |
| GET | `/analytics/export` | Guard | `days`; CSV download (`text/csv`, attachment) |

## Alerts, incidents, reports — `/api`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/alerts` | Guard | `status`, `severity`, `species`, `days`, `limit` |
| GET | `/alerts/{id}` | Guard | Alert with components, villages, detection, guard, events |
| POST | `/alerts/{id}/acknowledge` | Guard | Body `{note?}`; appends audit event |
| POST | `/alerts/{id}/assign` | Guard | Body `{guard_id, note?}` |
| POST | `/alerts/{id}/respond` | Guard | Body `{note?}`; marks responding |
| POST | `/alerts/{id}/resolve` | Guard | Body `{note?}`; closes the alert |
| GET | `/incidents` | Guard | `status`, `category`, `days` |
| PATCH | `/incidents/{id}` | Guard | Update status / notes |
| GET | `/reports` | Guard | Community inbox; `status`, `category` |
| PATCH | `/reports/{id}` | Guard | Triage status and notes |

Lifecycle endpoints are idempotent enough to be safe on retry in practice, but each successful
call appends an event, so do not replay blindly.

## Guard dashboard — `/api/guard`

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/dashboard` | Guard | `guard_id` optional for admins; guards are scoped to their own profile |

## Community — `/api/community` (public)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/alerts` | `days`, `limit`; sanitised advisories — no coordinates, cameras or detections |
| GET | `/summary` | Public KPI summary and coarse risk distribution |
| GET | `/villages` | Village names and coarse risk only |
| GET | `/guidelines` | Safety guidance content |
| POST | `/reports` | Multipart: `category` (`sighting`/`conflict`), `species`, `description` (≥12 chars), `reporter_name`, optional `contact`, `village_code`, `lat`/`lon` (both or neither), `image` |
| GET | `/reports/{reference_code}` | Status lookup by code such as `FG-2026-9707` |

Public responses are sanitised server-side. Tests assert that coordinate and camera keys are
absent, not merely hidden by the client.

## Media

| Path | Auth | Notes |
| --- | --- | --- |
| `/media/{path}` | none (static mount) | Uploaded originals, seeded evidence thumbnails, annotated results |

For any public deployment, put `/media` behind authentication or a signed-URL layer — the demo
keeps it open so the community portal can display user-submitted images.

## Example

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@forestguard.ai","password":"forest123"}' | python -c 'import sys,json;print(json.load(sys.stdin)["token"])')

curl -s http://127.0.0.1:8000/api/overview -H "Authorization: Bearer $TOKEN"
curl -s "http://127.0.0.1:8000/api/alerts?status=open&severity=high" -H "Authorization: Bearer $TOKEN"

curl -s -X POST http://127.0.0.1:8000/api/detections/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F file=@demo_data/wildlife_images/tiger.jpg \
  -F camera_id=1 \
  -F notes='Buffer track · night capture'
```
