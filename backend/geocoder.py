"""Place search for the registration map, backed by Photon (OpenStreetMap data).

Photon answers with GeoJSON, for example (abridged, from a real response):
    {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [72.8592156, 19.0364134]},   # [lng, lat]
        "properties": {"osm_type": "W", "osm_id": 49681498, "name": "Lokmanya Tilak Hospital",
                       "street": "Laxmibai Kelkar Marg", "locality": "Agarwada Colony",
                       "district": "F/N Ward", "county": "Mumbai City District", ...}}]}
Area fields vary by place: "locality" plays the role of a suburb, and "city" is often missing.

Uses the standard library (http.client) plus certifi's certificate bundle, both already requirements.
Connections to Photon are kept open and reused: a fresh HTTPS handshake costs ~0.45 s, more than
Photon takes to answer.
"""

from __future__ import annotations

import http.client
import json
import logging
import os
import ssl
import threading
import time
import urllib.parse
from collections import OrderedDict

import certifi

GEOCODER_URL = os.getenv("GEOCODER_URL", "https://photon.komoot.io/api/")
GEOCODER_CONTACT = os.getenv("GEOCODER_CONTACT", "unset")
USER_AGENT = f"AmbulanceIQ/1.0 (contact: {GEOCODER_CONTACT})"
TIMEOUT_S = 3

UPSTREAM_LIMIT = 8
MAX_RESULTS = 6
# Mumbai: results outside this box are dropped even if the provider returns them.
LAT_MIN, LAT_MAX = 18.85, 19.30
LNG_MIN, LNG_MAX = 72.75, 73.05
BIAS_LAT, BIAS_LNG = 19.076, 72.8777
DEDUPE_DECIMALS = 3  # about 100 m

CACHE_TTL_S = 10 * 60
CACHE_MAX = 500

# uvicorn configures this logger at INFO, so the one-off sample below shows in the server log.
log = logging.getLogger("uvicorn.error")
_sample_logged = False


class GeocoderError(Exception):
    """The provider failed, timed out or answered with something unusable."""


# certifi's CA bundle: python.org builds on macOS ship without system certificates, so HTTPS would
# otherwise fail locally while working on Linux servers.
_tls = ssl.create_default_context(cafile=certifi.where())

_target = urllib.parse.urlsplit(GEOCODER_URL)
# One kept-alive connection per worker thread (http.client connections aren't thread-safe).
_local = threading.local()


def _connection() -> tuple[http.client.HTTPConnection, bool]:
    """This thread's open connection to the provider, and whether it is being reused."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        return conn, True
    if _target.scheme == "https":
        conn = http.client.HTTPSConnection(_target.hostname, _target.port, timeout=TIMEOUT_S, context=_tls)
    else:
        conn = http.client.HTTPConnection(_target.hostname, _target.port, timeout=TIMEOUT_S)
    _local.conn = conn
    return conn, False


def _drop_connection() -> None:
    conn = getattr(_local, "conn", None)
    _local.conn = None
    if conn is not None:
        conn.close()


def _fetch_raw(query: str) -> dict:
    """One Photon request. Raises GeocoderError on any failure. Redirects are never followed."""
    params = urllib.parse.urlencode(
        {
            "q": query,
            "limit": UPSTREAM_LIMIT,
            "lang": "en",
            "bbox": f"{LNG_MIN},{LAT_MIN},{LNG_MAX},{LAT_MAX}",
            "lat": BIAS_LAT,
            "lon": BIAS_LNG,
        }
    )
    path = f"{_target.path or '/'}?{params}"
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    for attempt in range(2):
        conn, reused = _connection()
        try:
            conn.request("GET", path, headers=headers)
            response = conn.getresponse()
            body = response.read()
        except (http.client.HTTPException, OSError) as exc:
            _drop_connection()
            # The provider may close an idle kept-alive connection: retry once on a fresh one,
            # but never retry a fresh connection that failed (e.g. a timeout).
            if reused and attempt == 0 and not isinstance(exc, TimeoutError):
                continue
            raise GeocoderError(str(exc) or type(exc).__name__) from exc
        if response.will_close:
            _drop_connection()
        if response.status != 200:
            raise GeocoderError(f"HTTP {response.status}")
        try:
            return json.loads(body)
        except ValueError as exc:
            raise GeocoderError("Invalid JSON from provider") from exc
    raise GeocoderError("Provider unreachable")


def _inside_mumbai(lat: float, lng: float) -> bool:
    return LAT_MIN <= lat <= LAT_MAX and LNG_MIN <= lng <= LNG_MAX


def normalise(raw: dict) -> list[dict]:
    """Up to MAX_RESULTS places as {id, name, label, lat, lng}, inside Mumbai, without duplicates."""
    results: list[dict] = []
    seen: set[tuple] = set()
    for feature in raw.get("features") or []:
        if not isinstance(feature, dict):
            continue
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates")
        try:
            lng, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError, IndexError):
            continue
        if not _inside_mumbai(lat, lng):
            continue
        name = (props.get("name") or props.get("street") or "").strip()
        if not name:
            continue
        key = (name.lower(), round(lat, DEDUPE_DECIMALS), round(lng, DEDUPE_DECIMALS))
        if key in seen:
            continue
        seen.add(key)

        parts: list[str] = []
        for part in (name, props.get("suburb") or props.get("locality"), props.get("district"), props.get("city")):
            part = (part or "").strip()
            if part and part.lower() not in (p.lower() for p in parts):
                parts.append(part)
        osm_type, osm_id = props.get("osm_type"), props.get("osm_id")
        results.append(
            {
                "id": f"{osm_type}{osm_id}" if osm_type and osm_id else f"{lat:.6f},{lng:.6f}",
                "name": name,
                "label": ", ".join(parts),
                "lat": lat,
                "lng": lng,
            }
        )
        if len(results) == MAX_RESULTS:
            break
    return results


# ---- In-memory LRU cache of normalised results, keyed by the lowercased query ----
_cache: OrderedDict[str, tuple[float, list[dict]]] = OrderedDict()
_cache_lock = threading.Lock()


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cached(key: str) -> list[dict] | None:
    with _cache_lock:
        entry = _cache.get(key)
        if entry is None:
            return None
        stored_at, results = entry
        if time.monotonic() - stored_at > CACHE_TTL_S:
            del _cache[key]
            return None
        _cache.move_to_end(key)
        return results


def _remember(key: str, results: list[dict]) -> None:
    with _cache_lock:
        _cache[key] = (time.monotonic(), results)
        _cache.move_to_end(key)
        while len(_cache) > CACHE_MAX:
            _cache.popitem(last=False)


def search(query: str) -> list[dict]:
    """Normalised places for an already-validated query. Raises GeocoderError."""
    global _sample_logged
    key = query.lower()
    hit = _cached(key)
    if hit is not None:
        return hit
    raw = _fetch_raw(query)
    if not _sample_logged:
        _sample_logged = True
        log.info("Geocoder sample response (logged once): %s", json.dumps(raw, ensure_ascii=False)[:2000])
    if not isinstance(raw, dict):
        raise GeocoderError("Unexpected response shape")
    results = normalise(raw)
    _remember(key, results)
    return results
