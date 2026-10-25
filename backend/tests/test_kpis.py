"""Tests for services/kpis.py on a tiny hand-made travel-time table.

Run from the backend folder with pytest, or without it:
    ../venv/bin/python tests/test_kpis.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd  # noqa: E402

from services.kpis import compute_kpis  # noqa: E402

# Minutes from each candidate to each ward. BASE stands in for the hospital.
TIMES = pd.DataFrame(
    {
        "W1": [10, 4, 30],
        "W2": [30, 25, 8],
        "W3": [25, 12, 18],
    },
    index=["BASE", "C1", "C2"],
)
# W2 carries half the demand.
SCORES = {"W1": 1.0, "W2": 2.0, "W3": 1.0}


def kpis(chosen, **kwargs):
    return compute_kpis(TIMES, SCORES, chosen, "BASE", **kwargs)


def test_avg_response_is_demand_weighted():
    k = kpis(["C1", "C2"])
    # before: (10*1 + 30*2 + 25*1) / 4 = 23.75; after: min per ward = 4, 8, 12 -> (4 + 16 + 12) / 4 = 8
    assert k["avg_response_min"] == {"before": 23.8, "after": 8.0}


def test_coverage_percentages():
    k = kpis(["C1", "C2"])
    # before: only W1 (weight 1 of 4) is within 15 and within 20 min.
    assert k["demand_within_15_min_pct"] == {"before": 25.0, "after": 100.0}
    assert k["demand_within_20_min_pct"] == {"before": 25.0, "after": 100.0}
    # One unit at C1: W1 (4) and W3 (12) within 15; W2 (25) is not.
    one = kpis(["C1"])
    assert one["demand_within_15_min_pct"]["after"] == 50.0
    assert one["wards_covered_20_min"] == {"before": 1, "after": 2, "total": 3}


def test_worst_high_risk_ward_uses_after_time():
    # With C1 alone, after times are W1 4, W2 25, W3 12: W2 is the worst.
    assert kpis(["C1"])["worst_high_risk_ward"] == {"ward_code": "W2", "before_min": 30.0, "after_min": 25.0}
    # With both units, W3 (12 min) is now the slowest of the wards.
    assert kpis(["C1", "C2"])["worst_high_risk_ward"]["ward_code"] == "W3"


def test_chosen_equal_to_baseline_means_no_change():
    k = kpis(["BASE"])
    for key in ("avg_response_min", "demand_within_15_min_pct", "demand_within_20_min_pct"):
        assert k[key]["before"] == k[key]["after"], key
    assert k["wards_covered_20_min"]["before"] == k["wards_covered_20_min"]["after"]
    worst = k["worst_high_risk_ward"]
    assert worst["before_min"] == worst["after_min"]


def test_fleet_spacing_baseline_and_demand_now():
    k = kpis(
        ["C1", "C2"],
        baseline_distance_km=2.0,
        unit_types=["ALS", "bls"],
        chosen_points=[(19.0, 72.8), (19.0, 72.9)],
        time_multiplier=1.2,
    )
    assert k["fleet"] == {"total": 2, "als": 1, "bls": 1}
    assert 10.4 < k["min_spacing_km_actual"] < 10.6  # 0.1 deg of longitude at 19 N
    assert k["baseline"] == {"hospital_candidate_id": "BASE", "distance_km": 2.0, "approximate": True}
    assert k["demand_now"] == {"multiplier": 1.2, "level": "Busy", "top_wards": ["W2", "W1", "W3"]}
    single = kpis(["C1"], chosen_points=[(19.0, 72.8)], time_multiplier=0.8)
    assert single["min_spacing_km_actual"] is None
    assert single["demand_now"]["level"] == "Quiet"


if __name__ == "__main__":
    tests = [(name, fn) for name, fn in dict(globals()).items() if name.startswith("test_") and callable(fn)]
    for name, fn in tests:
        fn()
        print(f"passed  {name}")
    print(f"{len(tests)} tests passed")
