"""Multi-tenant isolation and authorisation tests against the real (shared) database.

Every test registers its own uniquely named hospitals and deletes them, their ambulances, runs,
assignments and status events, plus the auth_failures rows of its own client IPs, in teardown.
No other rows are touched.

Run from the backend folder:
    ../venv/bin/python -m pytest tests/test_isolation.py -q
"""

import os
import sys
import uuid
from pathlib import Path

# Before importing the app: a pepper for test-only keys, and one trusted proxy hop so each test can
# act from its own client IP (X-Forwarded-For) and the rate limiter never mixes tests together.
os.environ.setdefault("KEY_PEPPER", "test-pepper-not-for-production")
os.environ["TRUSTED_PROXY_HOPS"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

import main  # noqa: E402
import models as M  # noqa: E402
from database import SessionLocal  # noqa: E402

INVALID_CODE_BODY = {"detail": "Invalid hospital code"}

# (method, path, json body) for every hospital-scoped endpoint.
DRIVER_ENDPOINTS = [
    ("GET", "/hospital", None),
    ("GET", "/fleet", None),
    ("PATCH", "/ambulances/U1/status", {"status": "available"}),
    ("PATCH", "/ambulances/U1/assignment-status", {"status": "en_route"}),
]
ADMIN_ENDPOINTS = [
    ("PATCH", "/hospital", {"name": "Renamed"}),
    ("POST", "/hospital/ambulances", {"id": "NEW1", "type": "ALS"}),
    ("GET", "/optimize?hour=21", None),
    ("POST", "/simulate", {"hour": 21}),
    ("GET", "/runs", None),
    ("GET", "/runs/1", None),
    ("GET", "/hospital/keys", None),
    ("POST", "/hospital/rotate-code", None),
    ("POST", "/hospital/rotate-admin-key", None),
]


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:  # runs startup: pepper check and data loading
        yield c


class Tenant:
    """A test's view of the API: its own client IP, and cleanup of everything it registered."""

    def __init__(self, client: TestClient):
        self.client = client
        self.ips: list[str] = []
        self.hospital_ids: list[int] = []
        self.ip = self.new_ip()

    def new_ip(self) -> str:
        # 198.18.0.0/15 is reserved for testing, so these never belong to a real client.
        n = uuid.uuid4().int
        ip = f"198.18.{n % 256}.{(n >> 8) % 254 + 1}"
        self.ips.append(ip)
        return ip

    def call(self, method, path, body=None, code=None, key=None, ip=None):
        headers = {"X-Forwarded-For": ip or self.ip}
        if code is not None:
            headers["X-Hospital-Code"] = code
        if key is not None:
            headers["X-Admin-Key"] = key
        return self.client.request(method, path, json=body, headers=headers)

    def register(self, label: str, call_signs=("U1", "U2", "U3")) -> dict:
        res = self.call(
            "POST",
            "/hospital/register",
            {
                "hospital_name": f"Isolation test {label} {uuid.uuid4().hex[:8]}",
                "lat": 19.0018,
                "lng": 72.842,
                "operating_radius_km": 15,
                "ambulances": [{"id": cs, "type": "ALS" if i % 2 == 0 else "BLS"} for i, cs in enumerate(call_signs)],
            },
        )
        assert res.status_code == 200, res.text
        body = res.json()
        self.hospital_ids.append(body["hospital_id"])
        return body

    def cleanup(self):
        with SessionLocal() as db:
            if self.hospital_ids:
                amb_ids = select(M.Ambulance.ambulance_id).where(M.Ambulance.hospital_id.in_(self.hospital_ids))
                run_ids = select(M.OptimizationRun.run_id).where(M.OptimizationRun.hospital_id.in_(self.hospital_ids))
                db.execute(delete(M.AmbulanceAssignment).where(M.AmbulanceAssignment.ambulance_id.in_(amb_ids)))
                db.execute(delete(M.AmbulanceAssignment).where(M.AmbulanceAssignment.run_id.in_(run_ids)))
                db.execute(delete(M.RunPosition).where(M.RunPosition.run_id.in_(run_ids)))
                db.execute(delete(M.OptimizationRun).where(M.OptimizationRun.hospital_id.in_(self.hospital_ids)))
                db.execute(delete(M.AmbulanceStatusEvent).where(M.AmbulanceStatusEvent.ambulance_id.in_(amb_ids)))
                db.execute(delete(M.DriverShift).where(M.DriverShift.ambulance_id.in_(amb_ids)))
                db.execute(delete(M.Ambulance).where(M.Ambulance.hospital_id.in_(self.hospital_ids)))
                db.execute(delete(M.Hospital).where(M.Hospital.hospital_id.in_(self.hospital_ids)))
            db.execute(delete(M.AuthFailure).where(M.AuthFailure.client_ip.in_(self.ips)))
            db.commit()


@pytest.fixture
def api(client):
    tenant = Tenant(client)
    yield tenant
    tenant.cleanup()


def test_health_is_minimal_and_health_db_is_gone(api):
    assert api.call("GET", "/health").json() == {"ok": True}
    assert api.call("GET", "/health/db").status_code == 404


def test_no_credentials_gives_401_everywhere(api):
    for method, path, body in DRIVER_ENDPOINTS + ADMIN_ENDPOINTS:
        res = api.call(method, path, body)
        assert res.status_code == 401, (method, path, res.text)
        assert res.json() == INVALID_CODE_BODY, (method, path)


def test_wrong_code_looks_exactly_like_missing_code(api):
    missing = api.call("GET", "/hospital")
    wrong = api.call("GET", "/hospital", code="NOPE-ZZZZZZ")
    assert (wrong.status_code, wrong.json()) == (missing.status_code, missing.json()) == (401, INVALID_CODE_BODY)


def test_driver_credentials_on_admin_endpoints_give_403(api):
    hospital = api.register("driver")
    for method, path, body in ADMIN_ENDPOINTS:
        res = api.call(method, path, body, code=hospital["code"])
        assert res.status_code == 403, (method, path, res.text)
        assert res.json() == {"detail": "Invalid credentials"}
    # Driver endpoints work with the code alone.
    assert api.call("GET", "/fleet", code=hospital["code"]).status_code == 200


def test_hospitals_cannot_see_or_change_each_other(api):
    a = api.register("A", call_signs=("SHARED", "A-ONLY"))
    b = api.register("B", call_signs=("SHARED", "B-ONLY"))
    run_b = api.call("GET", "/optimize?hour=21", code=b["code"], key=b["admin_key"])
    assert run_b.status_code == 200, run_b.text
    run_b_id = run_b.json()["run_id"]
    assert run_b_id is not None

    # A can't read B's run, and B's run isn't in A's list.
    assert api.call("GET", f"/runs/{run_b_id}", code=a["code"], key=a["admin_key"]).status_code == 404
    assert run_b_id not in [r["run_id"] for r in api.call("GET", "/runs", code=a["code"], key=a["admin_key"]).json()]
    assert api.call("GET", f"/runs/{run_b_id}", code=b["code"], key=b["admin_key"]).status_code == 200

    # A can't change an ambulance only B has.
    assert api.call("PATCH", "/ambulances/B-ONLY/status", {"status": "responding"}, code=a["code"]).status_code == 404
    assert api.call("PATCH", "/ambulances/B-ONLY/assignment-status", {"status": "en_route"}, code=a["code"]).status_code == 404

    # With a call sign both have, A changes only its own ambulance.
    assert api.call("PATCH", "/ambulances/SHARED/status", {"status": "responding"}, code=a["code"]).status_code == 200
    b_fleet = {u["call_sign"]: u for u in api.call("GET", "/fleet", code=b["code"]).json()}
    assert b_fleet["SHARED"]["status"] == "available"
    a_fleet = {u["call_sign"]: u for u in api.call("GET", "/fleet", code=a["code"]).json()}
    assert a_fleet["SHARED"]["status"] == "responding"
    assert set(a_fleet) == {"SHARED", "A-ONLY"}

    # A's hospital endpoint describes A only.
    assert api.call("GET", "/hospital", code=a["code"]).json()["hospital_id"] == a["hospital_id"]


def test_admin_key_only_appears_in_register_and_rotate(api):
    hospital = api.register("keys")
    code, key = hospital["code"], hospital["admin_key"]
    assert key and len(key) >= 32

    with SessionLocal() as db:
        stored = db.get(M.Hospital, hospital["hospital_id"])
        assert stored.admin_key_hash and stored.admin_key_hash != key and len(stored.admin_key_hash) == 64

    run_id = api.call("GET", "/optimize?hour=9", code=code, key=key).json()["run_id"]
    responses = [
        api.call("GET", "/hospital", code=code),
        api.call("GET", "/fleet", code=code),
        api.call("PATCH", "/ambulances/U1/status", {"status": "responding"}, code=code),
        api.call("PATCH", "/ambulances/U1/assignment-status", {"status": "en_route"}, code=code),
        api.call("PATCH", "/hospital", {"operating_radius_km": 14}, code=code, key=key),
        api.call("POST", "/hospital/ambulances", {"id": "NEW1", "type": "BLS"}, code=code, key=key),
        api.call("POST", "/simulate", {"hour": 9}, code=code, key=key),
        api.call("GET", "/runs", code=code, key=key),
        api.call("GET", f"/runs/{run_id}", code=code, key=key),
        api.call("GET", "/hospital/keys", code=code, key=key),
        api.call("GET", "/optimize?hour=10", code=code, key=key),
    ]
    for res in responses:
        assert res.status_code in (200, 201), res.text
        assert key not in res.text
        assert "admin_key" not in res.text
    assert api.call("GET", "/hospital/keys", code=code, key=key).json() == {"code": code}

    rotated = api.call("POST", "/hospital/rotate-admin-key", code=code, key=key)
    new_key = rotated.json()["admin_key"]
    assert new_key and new_key != key
    assert api.call("GET", "/hospital/keys", code=code, key=key).status_code == 403
    assert api.call("GET", "/hospital/keys", code=code, key=new_key).status_code == 200

    new_code = api.call("POST", "/hospital/rotate-code", code=code, key=new_key).json()["code"]
    assert new_code != code
    assert api.call("GET", "/hospital", code=code).status_code == 401
    assert api.call("GET", "/hospital", code=new_code).status_code == 200


def test_eleventh_failed_attempt_is_rate_limited(api):
    hospital = api.register("limit")
    attacker = api.new_ip()
    for i in range(10):
        res = api.call("GET", "/hospital", code=f"GUESS-{i:06d}", ip=attacker)
        assert res.status_code == 401
    blocked = api.call("GET", "/hospital", code=hospital["code"], ip=attacker)
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many attempts, try again later."}
    assert int(blocked.headers["Retry-After"]) > 0
    # Admin endpoints are blocked too, public ones and other IPs are not.
    assert api.call("GET", "/runs", code=hospital["code"], key=hospital["admin_key"], ip=attacker).status_code == 429
    assert api.call("GET", "/health", ip=attacker).status_code == 200
    assert api.call("GET", "/hospital", code=hospital["code"]).status_code == 200


def test_wrong_admin_keys_count_toward_the_limit(api):
    hospital = api.register("keylimit")
    attacker = api.new_ip()
    for i in range(10):
        assert api.call("GET", "/runs", code=hospital["code"], key=f"guess-{i}", ip=attacker).status_code == 403
    assert api.call("GET", "/fleet", code=hospital["code"], ip=attacker).status_code == 429


def test_registration_is_limited_per_ip(api):
    for i in range(5):
        api.register(f"burst{i}", call_signs=("U1",))
    res = api.call(
        "POST",
        "/hospital/register",
        {"hospital_name": "Isolation test burst6", "lat": 19.0, "lng": 72.84, "operating_radius_km": 10, "ambulances": [{"id": "U1", "type": "ALS"}]},
    )
    assert res.status_code == 429
    assert "Retry-After" in res.headers
