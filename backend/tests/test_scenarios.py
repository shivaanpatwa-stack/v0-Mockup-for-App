"""What-if knobs: they only change the optimizer's inputs, and the default path is unchanged.

No database: loads the data files and calls the planning helpers directly.
Run from the backend folder:
    ../venv/bin/python -m pytest tests/test_scenarios.py -q
"""

import os
import sys
from pathlib import Path

os.environ.setdefault("KEY_PEPPER", "test-pepper-not-for-production")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest  # noqa: E402

import main  # noqa: E402

PAREL = dict(hospital_name="Test", hospital_lat=19.0176, hospital_lng=72.8562, operating_radius_km=15)
UNITS = [{"id": "U-001", "type": "ALS"}, {"id": "U-002", "type": "BLS"}, {"id": "U-003", "type": "ALS"}]


@pytest.fixture(scope="module", autouse=True)
def loaded():
    main.load_data()
    assert "error" not in main.data, main.data.get("error")


def plan(**overrides):
    return main._compute_plan(**PAREL, ambulances=UNITS, hour=18, min_spacing_km=2.0, max_response_minutes=20, **overrides)


def test_default_inputs_give_the_same_plan_as_before():
    """Passing the loaded data explicitly must equal the old call that read it implicitly."""
    implicit = plan()
    explicit = plan(
        risk_scores=main.data["risk_scores"], travel_times=main.data["travel_times"], candidates=main.data["candidates"]
    )
    assert implicit["chosen_candidates"] == explicit["chosen_candidates"]
    assert implicit["kpis"] == explicit["kpis"]


def test_neutral_scenario_changes_nothing():
    risk, travel, candidates, assumptions = main._scenario_inputs(main.ScenarioRequest(hour=18))
    assert assumptions == []
    assert plan(risk_scores=risk, travel_times=travel, candidates=candidates)["chosen_candidates"] == plan()["chosen_candidates"]


def test_traffic_multiplier_scales_every_travel_time():
    _, travel, _, assumptions = main._scenario_inputs(main.ScenarioRequest(hour=18, travel_time_multiplier=1.4))
    base = main.data["travel_times"]
    assert ((travel - base * 1.4).abs() < 1e-9).all().all()
    assert assumptions == ["Assumes travel times 40% slower"]
    slow = plan(travel_times=travel)
    assert slow["kpis"]["avg_response_min"]["after"] > plan()["kpis"]["avg_response_min"]["after"]


def test_demand_surge_only_touches_the_chosen_wards():
    risk, _, _, assumptions = main._scenario_inputs(
        main.ScenarioRequest(hour=18, demand_multiplier=1.3, demand_wards=["K/W", "H/W"])
    )
    base = main.data["risk_scores"]
    col, ward = main.RISK_SCORE_COL, main.RISK_WARD_COL
    surged = base[ward].isin(["K/W", "H/W"])
    assert (risk.loc[surged, col] - base.loc[surged, col] * 1.3).abs().max() < 1e-9
    assert (risk.loc[~surged, col] == base.loc[~surged, col]).all()
    assert assumptions == ["Assumes predicted demand 30% higher in H/W, K/W"]


def test_closed_positions_are_never_chosen():
    first = plan()["chosen_candidates"]
    _, _, candidates, assumptions = main._scenario_inputs(main.ScenarioRequest(hour=18, closed_candidates=first[:1]))
    assert first[0] not in set(candidates["candidate_id"].astype(str))
    assert first[0] not in plan(candidates=candidates)["chosen_candidates"]
    assert assumptions and assumptions[0].startswith("Assumes closed: ")


def test_knob_ranges_are_validated():
    with pytest.raises(Exception):
        main.ScenarioRequest(hour=18, travel_time_multiplier=0.5)
    with pytest.raises(Exception):
        main.ScenarioRequest(hour=18, demand_multiplier=5)
