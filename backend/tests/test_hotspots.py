"""Tests for GET /ambulances/{call_sign}/hotspots (demand-around-you).

Run from the backend folder directly:
    python tests/test_hotspots.py
"""

from datetime import datetime, timezone
from pathlib import Path
import sys
from unittest.mock import MagicMock

import pandas as pd
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from main import (
    DEMAND_THRESHOLD_HIGH,
    DEMAND_THRESHOLD_MEDIUM,
    NEARBY_LIMIT,
    NEARBY_MAX_MINUTES,
    DEMAND_NOTE,
    PLANNING_TZ,
    classify_demand_level,
    data,
    get_ambulance_hotspots,
    load_data,
)
import models


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

def test_constants_block():
    assert DEMAND_THRESHOLD_HIGH == 0.46
    assert DEMAND_THRESHOLD_MEDIUM == 0.20
    assert NEARBY_MAX_MINUTES == 12
    assert NEARBY_LIMIT == 3
    assert DEMAND_NOTE == "Modelled demand by ward, not live calls"


def test_classify_demand_level():
    # High > 0.46
    assert classify_demand_level(0.50) == "High"
    assert classify_demand_level(0.46001) == "High"
    # Medium 0.20 to 0.46 (inclusive on both ends)
    assert classify_demand_level(0.46) == "Medium"
    assert classify_demand_level(0.35) == "Medium"
    assert classify_demand_level(0.20) == "Medium"
    # Low below 0.20
    assert classify_demand_level(0.1999) == "Low"
    assert classify_demand_level(0.0) == "Low"


# ---------------------------------------------------------------------------
# 503 when data is unavailable
# ---------------------------------------------------------------------------

def test_data_error_returns_503():
    import main
    orig_data = dict(main.data)
    try:
        main.data.clear()
        main.data["error"] = "Test error"
        try:
            get_ambulance_hotspots("AMB-01", hospital=MagicMock(), db=MagicMock())
            assert False, "Expected 503"
        except HTTPException as exc:
            assert exc.status_code == 503
            assert "Test error" in exc.detail
    finally:
        main.data.clear()
        main.data.update(orig_data)


# ---------------------------------------------------------------------------
# 404 when no current assignment
# ---------------------------------------------------------------------------

def test_no_current_assignment_raises_404():
    import main
    orig_req = main._require_hospital_ambulance
    orig_curr = main._current_assignments
    orig_data = dict(main.data)
    try:
        # Populate data so the 503 guard passes; we're testing the 404 path.
        main.data["risk_scores"] = pd.DataFrame([{"ward_code": "A", "hour": 0, "risk_score": 0.5}])
        main.data["travel_times"] = pd.DataFrame([{"A": 5.0}], index=pd.Index(["CAND_X"], name="candidate_id"))
        main.data["candidate_lookup"] = {"CAND_X": {"ward_code": "A"}}
        main.data.pop("error", None)
        main._require_hospital_ambulance = lambda _db, _h, _cs: MagicMock(ambulance_id=10)
        main._current_assignments = lambda _db, _h, _ids: {}
        try:
            get_ambulance_hotspots("AMB-01", hospital=MagicMock(hospital_id=1), db=MagicMock())
            assert False, "Expected 404"
        except HTTPException as exc:
            assert exc.status_code == 404
            assert exc.detail == "No current assignment"
    finally:
        main._require_hospital_ambulance = orig_req
        main._current_assignments = orig_curr
        main.data.clear()
        main.data.update(orig_data)


# ---------------------------------------------------------------------------
# Core logic: filtering, sorting, nearest_high, own_ward
# ---------------------------------------------------------------------------

def _make_tt(cand_id: str, ward_minutes: dict) -> pd.DataFrame:
    """Build a minimal travel-time DataFrame with one candidate row."""
    return pd.DataFrame([ward_minutes], index=pd.Index([cand_id], name="candidate_id"))


def _make_risk(ward_scores: dict, hour: int = 20) -> pd.DataFrame:
    rows = [{"ward_code": w, "hour": hour, "risk_score": s} for w, s in ward_scores.items()]
    return pd.DataFrame(rows)


def _make_assignment(cand_id: str, hour_utc: int = 14) -> MagicMock:
    """Assignment whose valid_from converts to hour_utc+5:30 IST."""
    utc_dt = datetime(2026, 11, 4, hour_utc, 30, tzinfo=timezone.utc)
    return MagicMock(ambulance_id=10, candidate_id=cand_id, valid_from=utc_dt)


def _run(cand_id: str, unit_ward: str, tt: pd.DataFrame, risk: pd.DataFrame, hour_utc: int = 14):
    """Call get_ambulance_hotspots with mocked data/helpers."""
    import main
    orig_req = main._require_hospital_ambulance
    orig_curr = main._current_assignments
    orig_data = dict(main.data)
    try:
        main.data["candidate_lookup"] = {cand_id: {"ward_code": unit_ward, "lat": 0, "lng": 0}}
        main.data["travel_times"] = tt
        main.data["risk_scores"] = risk
        main.data.pop("error", None)
        ambulance = MagicMock(ambulance_id=10, call_sign="AMB-01")
        assignment = _make_assignment(cand_id, hour_utc)
        main._require_hospital_ambulance = lambda _db, _h, _cs: ambulance
        main._current_assignments = lambda _db, _h, _ids: {10: assignment}
        return get_ambulance_hotspots("AMB-01", hospital=MagicMock(hospital_id=1), db=MagicMock())
    finally:
        main._require_hospital_ambulance = orig_req
        main._current_assignments = orig_curr
        main.data.clear()
        main.data.update(orig_data)


def test_own_ward_never_in_nearby():
    # Unit is in ward D. D should appear in own_ward, never in nearby.
    tt = _make_tt("CAND_X", {"D": 0.0, "C": 5.0, "E": 8.0})
    risk = _make_risk({"D": 0.99, "C": 0.50, "E": 0.30})
    res = _run("CAND_X", "D", tt, risk)
    assert res["own_ward"]["ward_code"] == "D"
    for h in res["nearby"]:
        assert h["ward_code"] != "D"


def test_far_ward_excluded():
    # R/C is 20 min away — beyond the 12 min cutoff; must not appear.
    tt = _make_tt("CAND_X", {"D": 0.0, "C": 5.0, "R/C": 20.0})
    risk = _make_risk({"D": 0.5, "C": 0.4, "R/C": 0.90})
    res = _run("CAND_X", "D", tt, risk)
    ward_codes = [h["ward_code"] for h in res["nearby"]]
    assert "R/C" not in ward_codes
    assert "C" in ward_codes


def test_far_high_risk_ward_never_in_nearest_high():
    # A high-risk ward that is > 12 min away must not become nearest_high.
    tt = _make_tt("CAND_X", {"D": 0.0, "E": 7.0, "FARH": 20.0})
    risk = _make_risk({"D": 0.3, "E": 0.1, "FARH": 0.9})
    res = _run("CAND_X", "D", tt, risk)
    # E is within range but Low demand; FARH is High but too far.
    assert res["nearest_high"] is None


def test_sorted_by_risk_desc_then_minutes():
    tt = _make_tt("CAND_X", {"D": 0.0, "A": 11.0, "B": 5.0, "C": 8.0})
    # B 0.50 High, C 0.45 Medium, A 0.30 Medium
    risk = _make_risk({"D": 0.1, "A": 0.30, "B": 0.50, "C": 0.45})
    res = _run("CAND_X", "D", tt, risk)
    codes = [h["ward_code"] for h in res["nearby"]]
    assert codes == ["B", "C", "A"], codes


def test_tie_broken_by_minutes():
    # B and C have the same risk_score; B is closer (3 min < 8 min)
    tt = _make_tt("CAND_X", {"D": 0.0, "B": 3.0, "C": 8.0})
    risk = _make_risk({"D": 0.1, "B": 0.40, "C": 0.40})
    res = _run("CAND_X", "D", tt, risk)
    codes = [h["ward_code"] for h in res["nearby"]]
    assert codes[0] == "B"


def test_nearby_capped_at_limit():
    # 5 wards within range, but NEARBY_LIMIT = 3
    tt = _make_tt("CAND_X", {"D": 0.0, "A": 2.0, "B": 4.0, "C": 6.0, "E": 8.0, "F": 10.0})
    risk = _make_risk({"D": 0.1, "A": 0.6, "B": 0.5, "C": 0.4, "E": 0.3, "F": 0.2})
    res = _run("CAND_X", "D", tt, risk)
    assert len(res["nearby"]) == 3


def test_empty_nearby_allowed():
    # Only the unit's own ward is within 12 min.
    tt = _make_tt("CAND_X", {"D": 0.0, "FARH": 20.0})
    risk = _make_risk({"D": 0.5, "FARH": 0.9})
    res = _run("CAND_X", "D", tt, risk)
    assert res["nearby"] == []
    assert res["nearest_high"] is None


def test_nearest_high_is_closest_high_within_limit():
    # Two high-risk wards within range; nearest_high should be the closer one.
    tt = _make_tt("CAND_X", {"D": 0.0, "H1": 4.0, "H2": 9.0, "M1": 6.0})
    risk = _make_risk({"D": 0.1, "H1": 0.55, "H2": 0.60, "M1": 0.35})
    res = _run("CAND_X", "D", tt, risk)
    assert res["nearest_high"] is not None
    assert res["nearest_high"]["ward_code"] == "H1"
    assert res["nearest_high"]["minutes"] == 4


def test_minutes_are_rounded_ints():
    tt = _make_tt("CAND_X", {"D": 0.0, "C": 7.6})
    risk = _make_risk({"D": 0.1, "C": 0.5})
    res = _run("CAND_X", "D", tt, risk)
    assert isinstance(res["nearby"][0]["minutes"], int)
    assert res["nearby"][0]["minutes"] == 8


def test_response_shape():
    tt = _make_tt("CAND_X", {"D": 0.0, "C": 5.0})
    risk = _make_risk({"D": 0.5, "C": 0.4})
    res = _run("CAND_X", "D", tt, risk)
    # hour
    assert isinstance(res["hour"], int)
    # own_ward
    ow = res["own_ward"]
    assert set(ow) == {"ward_code", "demand_level", "risk_score"}
    assert ow["ward_code"] == "D"
    # nearby items
    for h in res["nearby"]:
        assert set(h) == {"ward_code", "minutes", "demand_level", "risk_score"}
    # note
    assert res["note"] == DEMAND_NOTE


def test_demand_levels_in_response():
    tt = _make_tt("CAND_X", {"D": 0.0, "HIGH": 2.0, "MED": 4.0, "LOW": 6.0})
    risk = _make_risk({"D": 0.5, "HIGH": 0.50, "MED": 0.33, "LOW": 0.10})
    res = _run("CAND_X", "D", tt, risk)
    by_code = {h["ward_code"]: h for h in res["nearby"]}
    assert by_code["HIGH"]["demand_level"] == "High"
    assert by_code["MED"]["demand_level"] == "Medium"
    assert by_code["LOW"]["demand_level"] == "Low"


def test_hour_derived_from_valid_from():
    # 14:30 UTC -> 20:00 IST
    tt = _make_tt("CAND_X", {"D": 0.0})
    risk = _make_risk({"D": 0.5}, hour=20)
    res = _run("CAND_X", "D", tt, risk, hour_utc=14)
    assert res["hour"] == 20


# ---------------------------------------------------------------------------
# Integration test against real data files
# ---------------------------------------------------------------------------

def test_real_data_integration():
    load_data()
    assert "travel_times" in data
    assert "risk_scores" in data

    import main
    orig_req = main._require_hospital_ambulance
    orig_curr = main._current_assignments

    cand_id = "CAND_0001"
    # Confirm it's in the lookup and travel-time matrix
    lookup = data["candidate_lookup"].get(cand_id, {})
    assert lookup, f"{cand_id} missing from candidate_lookup"
    cand_ward = lookup["ward_code"]
    assert cand_id in data["travel_times"].index

    # 10:00 IST (UTC 04:30)
    utc_dt = datetime(2026, 11, 4, 4, 30, tzinfo=timezone.utc)
    ambulance = MagicMock(ambulance_id=10, call_sign="AMB-01")
    assignment = MagicMock(ambulance_id=10, candidate_id=cand_id, valid_from=utc_dt)

    try:
        main._require_hospital_ambulance = lambda _db, _h, _cs: ambulance
        main._current_assignments = lambda _db, _h, _ids: {10: assignment}

        res = get_ambulance_hotspots("AMB-01", hospital=MagicMock(hospital_id=1), db=MagicMock())

        assert res["hour"] == 10
        assert res["note"] == DEMAND_NOTE
        assert res["own_ward"]["ward_code"] == cand_ward

        # own ward never in nearby
        for h in res["nearby"]:
            assert h["ward_code"] != cand_ward
            assert h["minutes"] <= NEARBY_MAX_MINUTES
            assert isinstance(h["minutes"], int)
            # demand_level matches risk_score
            if h["risk_score"] > 0.46:
                assert h["demand_level"] == "High"
            elif h["risk_score"] >= 0.20:
                assert h["demand_level"] == "Medium"
            else:
                assert h["demand_level"] == "Low"

        # Sorted descending by risk_score
        scores = [h["risk_score"] for h in res["nearby"]]
        assert scores == sorted(scores, reverse=True)

        # nearby capped at NEARBY_LIMIT
        assert len(res["nearby"]) <= NEARBY_LIMIT

        # nearest_high is consistent with nearby if present
        if res["nearest_high"] is not None:
            assert res["nearest_high"]["minutes"] <= NEARBY_MAX_MINUTES
            # It must be one of the High wards within range
            high_wards = {h["ward_code"] for h in res["nearby"] if h["demand_level"] == "High"}
            # nearest_high may be outside the top-3, but still within 12 min and High
            assert res["nearest_high"]["ward_code"] not in [h["ward_code"] for h in res["nearby"] if h["demand_level"] != "High"]
    finally:
        main._require_hospital_ambulance = orig_req
        main._current_assignments = orig_curr


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in dict(globals()).items() if name.startswith("test_") and callable(fn)]
    for name, fn in tests:
        fn()
        print(f"passed  {name}")
    print(f"{len(tests)} tests passed")
