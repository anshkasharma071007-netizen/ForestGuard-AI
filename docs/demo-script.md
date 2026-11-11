# Demo script

A 5–7 minute walkthrough for judges. Start the backend and frontend first
(see [setup.md](setup.md)) and have the app open at <http://127.0.0.1:5173>.

Keep one sentence in your pocket for every claim: **"Cameras, villages, guards and the seeded
history are synthetic; uploads are genuinely analysed on this machine."** Say it early and the
rest of the demo is credible.

## 0 · Before you start (30 s)

- Backend on `:8000`, frontend on `:5173`, demo database freshly seeded.
- `demo_data/wildlife_images/tiger.jpg` open in a file picker or on the desktop.
- Know that the AI has already been warmed once (the first upload loads models for ~5 s).
- Optional: a second browser tab at `/community` to show the public boundary.

## 1 · Overview — the situation in one screen (45 s)

Open `/` and log in as admin (`admin@forestguard.ai` / `forest123`).

Point out:

- the **range intelligence** header and the demo-data badge;
- KPI cards: detections, active alerts, high-risk signals, species coverage;
- recent alerts and detections, each with risk level and village;
- the language: "signals", "verify", "prioritisation" — not "prediction".

> "This is the command view: what was seen, where, how risky, and who is responding. All of the
> seeded observations are synthetic and flagged as demonstration data."

## 2 · Live monitoring — real inference (90 s)

Go to **Live Monitoring**.

1. Drop in `tiger.jpg`.
2. Wait for the camera list to load, pick a camera (e.g. the second option / buffer track).
3. Add a note: "Buffer track · night capture".
4. Click **Run AI analysis**.

While it runs (a few seconds on CPU):

> "Two stages: YOLO-World proposes animal boxes without being retrained for these species, then
> CLIP scores each crop against six regional species. Low-confidence crops become 'unidentified'
> instead of being forced into a class."

When **Analysis complete** appears, walk through the result:

- annotated image with bounding box;
- species and confidence (≈71 % in the recorded run), detector score;
- risk score and level (≈86 high) and the **basis** — nearest village, distance, recency,
  species weight;
- "Stored recognition #…" and the link into history.

> "This is a real model run on this laptop. The event is then placed at the camera station — not
> GPS — and scored against village boundaries."

Avoid quoting the species percentage as accuracy. Say "confidence on this frame".

## 3 · GIS intelligence map — the core module (90 s)

Open **GIS Intelligence Map**.

- Forest polygon, village boundaries and labels, camera stations, guard posts.
- Toggle layers: detections (clustered), risk cells, alert coverage, tracks.
- Zoom into a cluster to show it splitting; click a detection for the detail panel.
- Filter by species and risk level; the map and count update.
- Click a risk cell and read the score composition.
- Select a track: show the camera-to-camera path, direction (toward/away/parallel) and the
  disclaimer.

> "Risk is computed from proximity to the village boundary, recency, same-species frequency,
> verified incidents and — only when the evidence supports it — movement toward a village.
> Proximity is shown separately from movement so a nearby sighting isn't misread as an approach."

If asked about the risk distribution: 136 low, 84 moderate, 10 high in the seeded dataset with
default settings.

## 4 · Risk & Alerts — explainable and configurable (75 s)

Open **Risk & Alerts**.

- Show the alert queue with severity, reason, affected villages and timestamps.
- Open one alert: components, evidence, assigned guard, audit trail.
- As admin, change a threshold (e.g. alert threshold 60 → 55) and click **Save & re-score**;
  show the map/analytics counts change. Then **Reset defaults**.
- Run one lifecycle: **Acknowledge** → assign the nearest guard → **Responding** → **Resolve**;
  reopen to show the appended events.

> "Scores are prioritisation aids. Every alert explains itself, every action is audited, and
> notification is simulated in-app — no SMS is sent."

## 5 · Forest guard panel — field workflow (45 s)

Open **Forest Guard Panel**.

- Assigned tasks, statuses, high-risk areas, incidents.
- As admin this is a dispatch view; log in as the guard to show the scoped board.
- Demonstrate acknowledge/respond from the guard side (if you already resolved the alert in
  step 4, use another active one).

> "RBAC is enforced server-side: a guard only sees their own board, and incidents are not
> exposed to public users."

## 6 · Community portal — the other audience (60 s)

Open `/community` in an incognito window or the public link (no login).

- Advisories are coarse: village names and risk levels, no coordinates or camera codes.
- Scroll to **Report a sighting or conflict**:
  1. choose **Wildlife sighting**, species leopard, a village;
  2. description: "Leopard seen at dusk near the cattle shed…"; optional photo;
  3. **Submit report** → capture the reference code (e.g. `FG-2026-9707`);
  4. paste it into the status checker and click **Check** → Pending.

> "This is the privacy boundary: the public sees guidance and can report, but never receives
> exact wildlife locations. Sanitisation happens on the server, not by hiding fields in the UI."

If there is time, log back in as admin and show the same report in **Risk & Alerts → Community
reports**, where it can be triaged.

## 7 · Analytics & reports — evidence, not vanity metrics (45 s)

Open **Analytics & Reports**.

- Detection trend, species mix, risk distribution, village exposure, response times.
- Export CSV (guard-readable) and open it.
- Point at the synthetic-data note.

> "Response times here are computed from synthetic actions, so treat them as workflow proof, not
> field performance."

## 8 · Close (30 s)

- Architecture: FastAPI + SQLite + React + Leaflet, two-stage local AI, no cloud calls.
- Tests: 28 backend tests, isolated temp DB, demo-mode upload refusal.
- Limits: zero-shot classifier, single-node SQLite, simulated dispatch, illustrative landscape.
- Files: `docs/` (architecture, setup, testing, AI limits, credits), `deliverables/` (deck and
  report), `docs/screenshots/` (all captured from the live app).

> "Everything you saw is running locally. The honest boundary is: real inference, synthetic
> observations, explainable risk — and no claim of field validation."

## Likely questions

**Is the AI accurate?** We deliberately don't claim an accuracy figure. The recorded check is
6 reference photos, one per species, 6/6 top-1 — a smoke test. A real evaluation needs a
licenced camera-trap dataset with species-level splits, ideally night/IR and occlusion strata.

**Is this real camera data?** No. No feeds are connected. The demo dataset is synthetic and
labelled; the upload you just saw is a real model run.

**Where is GPS?** Nowhere. Tracks are inferred from sequential camera observations. The payload
and UI both say so.

**Could this run at scale?** The API and services are separable and the ORM is portable; SQLite
and in-Python geometry are the bottlenecks. PostGIS, a task queue for inference and a real
notification channel are the upgrade path.

**What about privacy?** Public endpoints are sanitised server-side; exact coordinates, camera
codes and reporter details never reach the public payload. Tests assert this.

**What would you build next?** Fine-tune the classifier on a licenced regional dataset, add
PostGIS spatial indexing, real SMS/radio dispatch with acknowledgement SLAs, and an offline
mobile guard client.
