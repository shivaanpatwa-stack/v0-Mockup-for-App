"""Before/after impact numbers for a placement.

"Before" = every unit waiting at the hospital, modelled as the candidate position nearest to it.
"After" = each ward served by the closest chosen position. Ward weights are that hour's risk
scores; since each hour scales every ward by the same multiplier, the before/after numbers are
the same at every hour and only `demand_now` changes with the hour.
"""

from __future__ import annotations

import math
from itertools import combinations

import pandas as pd

COVERAGE_LIMITS_MIN = (15, 20)
WARDS_COVERED_LIMIT_MIN = 20
HIGH_RISK_TOP_N = 5
DEMAND_NOW_TOP_N = 3
QUIET_BELOW = 0.85
BUSY_ABOVE = 1.15
# Beyond this the "at base" candidate is a rough stand-in for the hospital itself.
BASELINE_APPROX_KM = 1.5
EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, max(0.0, a))))


def _times(travel_times: pd.DataFrame) -> pd.DataFrame:
    t = travel_times.copy()
    t.index = t.index.astype(str)
    t.columns = t.columns.astype(str)
    return t.apply(pd.to_numeric, errors="coerce")


def _weighted_avg(times: pd.Series, weights: pd.Series) -> float | None:
    total = weights.sum()
    return float((times * weights).sum() / total) if total > 0 else None


def _pct_within(times: pd.Series, weights: pd.Series, limit: float) -> float | None:
    total = weights.sum()
    return float(100 * weights[times <= limit].sum() / total) if total > 0 else None


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def demand_level(multiplier: float) -> str:
    if multiplier < QUIET_BELOW:
        return "Quiet"
    if multiplier > BUSY_ABOVE:
        return "Busy"
    return "Normal"


def compute_kpis(
    travel_times: pd.DataFrame,
    zone_scores: dict,
    chosen_ids: list,
    hospital_candidate_id,
    *,
    baseline_distance_km: float | None = None,
    unit_types: list[str] | None = None,
    chosen_points: list[tuple[float, float]] | None = None,
    time_multiplier: float | None = None,
) -> dict:
    """KPIs for `chosen_ids` against everyone at `hospital_candidate_id`.

    travel_times: minutes, indexed by candidate_id with ward codes as columns.
    zone_scores: ward_code -> risk score (the weights). Wards missing from either side are skipped.
    unit_types: "ALS"/"BLS" per unit; chosen_points: (lat, lng) per chosen position.
    """
    t = _times(travel_times)
    scores = {str(k): float(v) for k, v in zone_scores.items()}
    wards = [w for w in t.columns if w in scores]
    weights = pd.Series({w: scores[w] for w in wards}, dtype=float)
    chosen = [str(c) for c in chosen_ids]

    after = t.loc[chosen, wards].min(axis=0)
    before = t.loc[str(hospital_candidate_id), wards]

    def pair(fn, *args):
        return {"before": _round(fn(before, weights, *args)), "after": _round(fn(after, weights, *args))}

    top_risk = weights.sort_values(ascending=False).index[:HIGH_RISK_TOP_N]
    worst = max(top_risk, key=lambda w: after[w]) if len(top_risk) else None

    types = [str(x).upper() for x in (unit_types or [])]
    closest = None
    if chosen_points and len(chosen_points) > 1:
        closest = min(haversine_km(*a, *b) for a, b in combinations(chosen_points, 2))

    kpis = {
        "avg_response_min": pair(_weighted_avg),
        **{f"demand_within_{limit}_min_pct": pair(_pct_within, limit) for limit in COVERAGE_LIMITS_MIN},
        "worst_high_risk_ward": None
        if worst is None
        else {"ward_code": worst, "before_min": _round(before[worst]), "after_min": _round(after[worst])},
        "wards_covered_20_min": {
            "before": int((before <= WARDS_COVERED_LIMIT_MIN).sum()),
            "after": int((after <= WARDS_COVERED_LIMIT_MIN).sum()),
            "total": len(wards),
        },
        "baseline": {
            "hospital_candidate_id": hospital_candidate_id,
            "distance_km": _round(baseline_distance_km, 2),
            "approximate": baseline_distance_km is not None and baseline_distance_km > BASELINE_APPROX_KM,
        },
        "fleet": {"total": len(types), "als": types.count("ALS"), "bls": types.count("BLS")},
        "min_spacing_km_actual": _round(closest, 2),
        "demand_now": None,
    }
    if time_multiplier is not None:
        kpis["demand_now"] = {
            "multiplier": round(float(time_multiplier), 2),
            "level": demand_level(time_multiplier),
            "top_wards": list(weights.sort_values(ascending=False).index[:DEMAND_NOW_TOP_N]),
        }
    return kpis
