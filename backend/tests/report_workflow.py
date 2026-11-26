"""Run with python -m backend.tests.report_workflow against a dedicated local PostgreSQL database."""
import os
import secrets
import subprocess
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from contextlib import ExitStack
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import monotonic, sleep

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[2]
PHOTO = ROOT / "frontend/public/images/elephant.jpg"


def api_checks(client, auth):
    from ai_engine import config as ai_config
    from backend import config
    from backend.services.report_analysis import process_next
    from backend.database.session import SessionLocal
    from backend.models import SightingReport
    from sqlalchemy import select

    path = "/api/community/reports"
    fields = dict(reporter_name="Test observer", category="sighting", species="elephant",
                  description="Wildlife seen in the clearing", lat="21.76", lon="79.30",
                  submission_key=str(uuid.uuid4()))
    image = {"image": ("animal.jpg", PHOTO.read_bytes(), "image/jpeg")}

    for change in (dict(lat="nan"), dict(lon="181"), dict(lon=""), dict(reporter_name="  "),
                   dict(description="short"), dict(species="invalid"), dict(village_code="absent"),
                   dict(lat="", lon=""), dict(description="a" * 4001)):
        assert client.post(path, data={**fields, **change}).status_code in (400, 422)
    for contents in (b"", b"not a photo", image["image"][1][:200]):
        assert client.post(path, data=fields, files={"image": ("x.jpg", contents, "image/jpeg")}).status_code == 400
    original_limit = config.MAX_UPLOAD_MB
    config.MAX_UPLOAD_MB = 0
    try:
        assert client.post(path, data=fields, files=image).status_code == 413
    finally:
        config.MAX_UPLOAD_MB = original_limit
    with ThreadPoolExecutor(2) as pool:
        replies = list(pool.map(lambda _: client.post(path, data=fields, files=image), range(2)))
    assert all(r.status_code == 201 for r in replies)
    assert replies[0].json() == replies[1].json()
    assert client.post(path, data={**fields, "species": "tiger"}, files=image).status_code == 409
    code = replies[0].json()["reference_code"]
    with SessionLocal() as db:
        report = db.scalar(select(SightingReport).where(SightingReport.reference_code == code))
        endpoint = f"/api/reports/{report.id}"
        assert client.get(f"/media/{report.image_path}").status_code == 404
    for method, suffix in (("get", "/evidence"), ("post", "/retry"), ("post", "/read"), ("patch", "")):
        assert client.request(method, endpoint + suffix, json={"status": "verified"}).status_code == 401
    assert client.get("/api/reports").status_code == 401
    from backend.api.deps import create_token
    from backend.models import User
    with SessionLocal.begin() as db:
        observer = User(name="Public role", email="public@example.invalid", role="public", password_hash="disabled")
        db.add(observer)
        db.flush()
        forbidden = {"Authorization": "Bearer " + create_token(observer)}
    for method, suffix in (("get", "/evidence"), ("patch", ""), ("post", "/retry")):
        assert client.request(method, endpoint + suffix, headers=forbidden, json={"status": "verified"}).status_code == 403
    unread = client.get("/api/reports/notifications", headers=auth).json()["unread"]
    for _ in range(2):
        assert client.post(endpoint + "/read", headers=auth).status_code == 200
    assert client.get("/api/reports/notifications", headers=auth).json()["unread"] == unread - 1
    assert client.get(endpoint + "/evidence", headers=auth).content == image["image"][1]
    public = client.get(path + "/" + code).json()
    assert not {"image_url", "reporter_name", "contact", "lat", "lon", "review_history"}.intersection(public)
    assert client.post("/api/community/report-receipt", data={"submission_key": fields["submission_key"]}).json()["reference_code"] == code

    def current():
        return next(r for r in client.get("/api/reports", headers=auth).json()["items"] if r["reference_code"] == code)

    assert current()["analysis_status"] == "queued"
    ai_config.AI_MODE = "demo"
    assert process_next() and current()["analysis_status"] == "failed"
    ai_config.AI_MODE = "auto"
    for _ in range(2):
        assert client.post(endpoint + "/retry", headers=auth).json()["analysis_status"] == "queued"
    assert process_next() and not process_next()
    result = current()["analysis_results"][0]
    assert result["species"] == "elephant" and result["confidence"] > 0 and len(result["bbox"]) == 4
    assert client.get("/api/community/alerts?field_only=true").json()["items"] == []
    for status in ("forwarded", "rejected"):
        assert client.patch(endpoint, headers=auth, json={"status": status, "note": "Test review"}).status_code == 200
        assert client.get(path + "/" + code).json()["status"] == status
    assert client.patch(endpoint, headers=auth, json={"status": "verified"}).status_code == 409
    assert not current()["incident_id"]
    assert client.get("/api/community/alerts?field_only=true").json()["items"] == []
    # Verify a remote GPS report independently of any village or camera fallback.
    gps = {**fields, "lat": "1.25", "lon": "2.5", "submission_key": str(uuid.uuid4())}
    reference = client.post(path, data=gps).json()["reference_code"]
    r = next(r for r in client.get("/api/reports", headers=auth).json()["items"] if r["reference_code"] == reference)
    def verify(_):
        return client.patch(f"/api/reports/{r['id']}", headers=auth, json={"status": "verified"}).json()["report"]
    with ThreadPoolExecutor(2) as pool:
        first, second = pool.map(verify, range(2))
    assert first["incident_id"] == second["incident_id"] and len(second["review_history"]) == 1
    incident = next(i for i in client.get("/api/incidents", headers=auth).json()["items"] if i["id"] == first["incident_id"])
    assert (incident["lat"], incident["lon"]) == (1.25, 2.5)
    assert not client.get("/api/community/alerts?field_only=true").json()["items"]

    # A simulated advisory at the same village must neither reach field-only subscribers
    # nor suppress the upcoming real report's advisory.
    with SessionLocal.begin() as db:
        simulated = SightingReport(reference_code="FG-DEMO-TEST", category="sighting", species="elephant",
                                   description="Simulation fixture", reporter_name="Simulation", lat=21.76,
                                   lon=79.30, is_simulated=True)
        db.add(simulated)
        db.flush()
        simulated_id = simulated.id
    decision = client.patch(f"/api/reports/{simulated_id}", headers=auth, json={"status": "verified"})
    assert decision.status_code == 200
    assert [a["is_simulated"] for a in client.get("/api/community/alerts").json()["items"]] == [True]
    assert not client.get("/api/community/alerts?field_only=true").json()["items"]


def run():
    url = make_url(os.environ["WORKFLOW_TEST_DATABASE_URL"])
    if url.get_backend_name() != "postgresql" or "test" not in (url.database or ""):
        raise ValueError("Use a dedicated PostgreSQL test database")
    schema = "workflow_" + uuid.uuid4().hex
    admin = create_engine(url)
    with ExitStack() as stack:
        stack.callback(admin.dispose)
        with admin.begin() as conn:
            conn.execute(text(f'CREATE SCHEMA "{schema}"'))
        def cleanup():
            with admin.begin() as conn:
                conn.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        stack.callback(cleanup)
        temp = Path(stack.enter_context(tempfile.TemporaryDirectory()))
        os.environ.update(DATABASE_URL=url.render_as_string(hide_password=False), PGOPTIONS=f"-c search_path={schema}",
                          UPLOAD_DIR=str(temp / "uploads"), SECRET_KEY=secrets.token_hex(32),
                          SEED_ON_START="false", AI_MODE="auto", MPLCONFIGDIR=str(temp / "mpl"),
                          APP_ENV="development", CITIZEN_DEV_OTP_ENABLED="true",
                          YOLO_CONFIG_DIR=str(temp / "yolo"), YOLO_AUTOINSTALL="false", CORS_ORIGINS="http://127.0.0.1:18766")
        origin = "http://127.0.0.1:18765"
        website = temp / "officials"
        subprocess.run(["npm", "--prefix", "frontend", "run", "build", "--", "--outDir", str(website)],
                       env={**os.environ, "VITE_API_BASE_URL": origin}, check=True)
        from alembic import command
        from alembic.config import Config
        from fastapi.testclient import TestClient
        from backend.database.session import engine, SessionLocal
        from backend.models import User, Village
        from backend.api.deps import create_token, hash_password
        from backend.main import WebsiteFiles, app
        from backend.services.risk_service import get_settings
        app.router.routes[:] = [route for route in app.routes if getattr(route, "name", None) != "frontend"]
        app.mount("/", WebsiteFiles(directory=website, html=True), name="workflow-frontend")

        stack.callback(engine.dispose)
        alembic = Config(str(ROOT / "alembic.ini"))
        command.upgrade(alembic, "0001")
        with engine.begin() as conn:
            conn.execute(text("""INSERT INTO sighting_reports(reference_code,category,species,description,
                reporter_name,status,created_at,is_simulated) VALUES ('FG-2020-4000','sighting','unidentified',
                'Legacy report','Legacy observer','closed',now(),false)"""))
        command.upgrade(alembic, "head")
        secret = secrets.token_urlsafe(24)
        with SessionLocal.begin() as db:
            user = User(name="Workflow reviewer", email="reviewer@example.invalid", role="guard", password_hash=hash_password(secret))
            db.add(user)
            db.add(Village(code="TEST", name="Workflow village", lat=21.76, lon=79.30, population=2200,
                boundary_geojson={"type":"Polygon","coordinates":[[[79.29,21.75],[79.31,21.75],[79.31,21.77],[79.29,21.77],[79.29,21.75]]]}))
            db.add(Village(code="FAR", name="Remote test village", lat=20.0, lon=78.0,
                boundary_geojson={"type":"Polygon","coordinates":[[[78,20],[78.01,20],[78.01,20.01],[78,20]]]}))
            db.flush()
            auth = {"Authorization": "Bearer " + create_token(user)}
        client = TestClient(app)
        stack.callback(client.close)
        assert client.get("/api/community/reports/FG-2020-4000").json()["status"] == "closed"
        api_checks(client, auth)
        print("PostgreSQL migration, concurrent retries and reviews, validation, evidence access, real AI retry and GPS checks passed.", flush=True)

        mobile = temp / "mobile"
        subprocess.run(["npm", "--prefix", "mobile", "run", "build:web", "--", "--output-dir", str(mobile)],
                       env={**os.environ, "EXPO_PUBLIC_API_URL": origin, "EXPO_NO_TELEMETRY": "1"}, check=True)
        import uvicorn
        # Simulate a lost HTTP response after a real commit, including a partial body.
        drop_once = True
        async def connection_loss(scope, receive, send):
            async def intercept(message):
                nonlocal drop_once
                if (drop_once and scope.get("method") == "POST" and scope["path"] == "/api/citizen/reports"
                        and message["type"] == "http.response.body"):
                    drop_once = False
                    await send({**message, "body": message["body"][:1], "more_body": True})
                    raise ConnectionResetError("Intentional integration-test disconnect")
                await send(message)
            await app(scope, receive, intercept)
        server = uvicorn.Server(uvicorn.Config(connection_loss, host="127.0.0.1", port=18765, log_level="warning", access_log=False))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        def shutdown():
            server.should_exit = True
            thread.join(15)
        stack.callback(shutdown)
        deadline = monotonic() + 10
        while not server.started:
            if not thread.is_alive() or monotonic() > deadline:
                raise RuntimeError("Test API failed to start")
            sleep(.05)
        http = ThreadingHTTPServer(("127.0.0.1", 18766), partial(SimpleHTTPRequestHandler, directory=str(mobile)))
        stack.callback(http.server_close)
        threading.Thread(target=http.serve_forever, daemon=True).start()
        stack.callback(http.shutdown)
        subprocess.run(["node", "frontend/scripts/test_report_workflow.mjs"], check=True,
                       env={**os.environ, "WORKFLOW_PASSWORD": secret})
        field = client.get("/api/community/alerts?field_only=true&village_code=TEST").json()["items"]
        assert len(field) == 1 and not field[0]["is_simulated"]
        verified = client.get("/api/community/alerts?field_only=true&verified_only=true").json()["items"]
        assert len(verified) == 1 and verified[0]["approximate_locations"] == [{"lat": 21.76, "lon": 79.3}]
        assert not {"reporter_name", "contact", "lat", "lon", "image_url"}.intersection(verified[0])
        assert not client.get("/api/community/alerts?field_only=true&village_code=FAR").json()["items"]
        reports = client.get("/api/reports", headers=auth).json()["items"]
        browser_reports = [r for r in reports if r["reporter_name"] == "Browser observer"]
        assert len(browser_reports) == 1
        report = browser_reports[0]
        assert report["risk"]["score"] >= get_settings().data["alert_threshold"]
        assert report["analysis_status"] == "completed" and report["analysis_results"][0]["species"] == "elephant"
        assert report["review_history"][-1]["reviewer_name"] == "Workflow reviewer"
        assert report["review_history"][-1]["note"] == "Confirmed in field"
        assert report["incident_id"] and report["status"] == "verified"
        repeat = client.patch(f"/api/reports/{report['id']}", headers=auth, json={"status":"verified"})
        assert repeat.json()["report"]["incident_id"] == report["incident_id"]
        assert len(client.get("/api/community/alerts?field_only=true").json()["items"]) == 1
        print(f"Verified village incident, score {report['risk']['score']}, one public advisory and both client displays.")


if __name__ == "__main__":
    run()
