"""GET /geocode with the Photon call mocked out. Each test acts from its own test-range IP, so the
in-memory place-search rate limit of one test never affects another.

Run from the backend folder:
    ../venv/bin/python -m pytest tests/test_geocode.py -q
"""

import os
import sys
import uuid
from pathlib import Path

os.environ.setdefault("KEY_PEPPER", "test-pepper-not-for-production")
os.environ["TRUSTED_PROXY_HOPS"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import delete  # noqa: E402

import geocoder  # noqa: E402
import main  # noqa: E402
import models as M  # noqa: E402
from database import SessionLocal  # noqa: E402


def feature(name, lng, lat, osm_id, **props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {"osm_type": "N", "osm_id": osm_id, "name": name, **props},
    }


# Shaped like a real Photon response (see geocoder.py), plus the awkward cases.
PHOTON = {
    "type": "FeatureCollection",
    "features": [
        feature("Lokmanya Tilak Hospital", 72.8592156, 19.0364134, 1, locality="Agarwada Colony", district="F/N Ward", county="Mumbai City District"),
        # Same name, within ~10 m: a duplicate.
        feature("Lokmanya Tilak Hospital", 72.8592400, 19.0364300, 2, locality="Agarwada Colony", district="F/N Ward"),
        # Outside Mumbai (Pune).
        feature("Sassoon Hospital", 73.8710, 18.5280, 3, city="Pune"),
        # No coordinates.
        {"type": "Feature", "geometry": None, "properties": {"name": "Nowhere"}},
        # No name: falls back to the street; district repeats the locality and is dropped from the label.
        feature(None, 72.8401, 19.0176, 4, street="Dadar TT Circle", locality="Dadar", district="Dadar", city="Mumbai"),
        feature("KEM Hospital", 72.8424, 19.0022, 5, district="F/S Ward", city="Mumbai"),
        feature("Wadia Hospital", 72.8410, 19.0030, 6),
        feature("Jaslok Hospital", 72.8090, 18.9718, 7),
        feature("Breach Candy Hospital", 72.8051, 18.9727, 8),
        feature("Bombay Hospital", 72.8271, 18.9420, 9),
    ],
}


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def api(client, monkeypatch):
    """Calls GET /geocode from a fresh IP; counts upstream calls; cleans up limiter rows and the cache."""
    ips = []
    calls = {"n": 0, "response": PHOTON, "error": None}

    def fake_fetch(query):
        calls["n"] += 1
        if calls["error"]:
            raise calls["error"]
        return calls["response"]

    monkeypatch.setattr(geocoder, "_fetch_raw", fake_fetch)
    geocoder.clear_cache()

    def new_ip():
        n = uuid.uuid4().int
        ips.append(f"198.19.{n % 256}.{(n >> 8) % 254 + 1}")
        return ips[-1]

    ip = new_ip()

    def get(q, from_ip=None):
        return client.get("/geocode", params={"q": q}, headers={"X-Forwarded-For": from_ip or ip})

    get.calls = calls
    get.new_ip = new_ip
    yield get
    geocoder.clear_cache()
    with SessionLocal() as db:
        db.execute(delete(M.AuthFailure).where(M.AuthFailure.client_ip.in_(ips)))
        db.commit()


def test_normalises_filters_and_dedupes(api):
    res = api("hospital")
    assert res.status_code == 200, res.text
    places = res.json()
    assert len(places) == 6  # at most 6, even though 7 valid places came back
    first = places[0]
    assert first == {
        "id": "N1",
        "name": "Lokmanya Tilak Hospital",
        "label": "Lokmanya Tilak Hospital, Agarwada Colony, F/N Ward",
        "lat": 19.0364134,
        "lng": 72.8592156,
    }
    names = [p["name"] for p in places]
    assert names.count("Lokmanya Tilak Hospital") == 1  # duplicate dropped
    assert "Sassoon Hospital" not in names  # outside Mumbai
    assert "Nowhere" not in names  # no coordinates
    street = next(p for p in places if p["id"] == "N4")
    assert street["name"] == "Dadar TT Circle"  # street used when there's no name
    assert street["label"] == "Dadar TT Circle, Dadar, Mumbai"  # repeated part removed
    for p in places:
        assert 18.85 <= p["lat"] <= 19.30 and 72.75 <= p["lng"] <= 73.05
        assert set(p) == {"id", "name", "label", "lat", "lng"}


def test_results_outside_mumbai_are_all_dropped(api):
    api.calls["response"] = {"features": [feature("Pune Station", 73.874, 18.528, 11), feature("Thane", 72.97, 19.40, 12)]}
    res = api("station")
    assert res.status_code == 200
    assert res.json() == []


@pytest.mark.parametrize("q", ["", "  ", "ab", "  ab  ", "x" * 81, "kem\x00hospital", "kem\nhospital", "kem​hospital"])
def test_invalid_queries_are_rejected(api, q):
    assert api(q).status_code == 422
    assert api.calls["n"] == 0  # the provider is never called


def test_missing_q_is_rejected(api, client):
    assert client.get("/geocode").status_code == 422


def test_identical_queries_hit_the_cache(api):
    first = api("KEM Hospital")
    second = api("  kem hospital ")  # same once stripped and lowercased
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    assert api.calls["n"] == 1
    api("Jaslok")
    assert api.calls["n"] == 2


def test_rate_limited_after_30_per_minute(api):
    for i in range(30):
        assert api("hospital").status_code == 200, i
    blocked = api("hospital")
    assert blocked.status_code == 429
    assert blocked.json() == {"detail": "Too many attempts, try again later."}
    assert 0 < int(blocked.headers["Retry-After"]) <= 61
    # Another IP is unaffected; cache hits counted too, but only one upstream call was made.
    assert api("hospital", from_ip=api.new_ip()).status_code == 200
    assert api.calls["n"] == 1


@pytest.mark.parametrize(
    "error",
    [geocoder.GeocoderError("timed out"), geocoder.GeocoderError('HTTP 500: {"message": "internal secret detail"}')],
)
def test_provider_failure_returns_a_generic_502(api, error):
    api.calls["error"] = error
    res = api("hospital")
    assert res.status_code == 502
    assert res.json() == {"detail": "Search unavailable"}
    assert "secret" not in res.text and "timed out" not in res.text


def test_garbage_response_is_a_failure(api):
    api.calls["response"] = ["not", "an", "object"]
    res = api("hospital")
    assert res.status_code == 502
    assert res.json() == {"detail": "Search unavailable"}
