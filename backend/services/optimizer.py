"""Pick the best set of ambulance positions using integer programming."""

import numpy as np
import pandas as pd
# pyrefly: ignore[missing-import]
from ortools.linear_solver import pywraplp

EARTH_RADIUS_KM = 6371.0088


def haversine_km(lon1, lat1, lon2, lat2):
    """Great-circle distance in km between (lon1, lat1) and (lon2, lat2).

    Inputs may be scalars or numpy arrays (degrees); arrays broadcast together
    the usual numpy way, so passing column vs. row vectors yields a full
    pairwise distance matrix.
    """
    lon1, lat1, lon2, lat2 = (
        np.radians(np.asarray(v, dtype=float)) for v in (lon1, lat1, lon2, lat2)
    )
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def _pairwise_haversine_km(lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Return an (n, n) matrix of great-circle distances in km."""
    return haversine_km(lons[:, None], lats[:, None], lons[None, :], lats[None, :])


def _lat_lon(candidates_df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    geometry = getattr(candidates_df, "geometry", None)
    if geometry is None:
        raise ValueError("candidates_df must have a geometry column of Points")
    # Haversine needs degrees; reproject if the data uses another CRS.
    if getattr(geometry, "crs", None) is not None and not geometry.crs.equals("EPSG:4326"):
        geometry = geometry.to_crs("EPSG:4326")
    return geometry.y.to_numpy(dtype=float), geometry.x.to_numpy(dtype=float)


def filter_candidates_by_radius(
    candidates_df: pd.DataFrame,
    hospital_lat: float,
    hospital_lng: float,
    radius_km: float,
) -> pd.DataFrame:
    """Return only the rows of candidates_df within radius_km of the hospital."""
    if radius_km < 0:
        raise ValueError("radius_km must be non-negative")
    if len(candidates_df) == 0:
        return candidates_df.copy()

    lats, lons = _lat_lon(candidates_df)
    distances = haversine_km(hospital_lng, hospital_lat, lons, lats)
    return candidates_df.loc[distances <= radius_km].copy()


def _reachability(
    candidates_df: pd.DataFrame,
    travel_times: pd.DataFrame,
    max_response_minutes: float,
) -> pd.DataFrame:
    """Boolean (candidate row x ward) frame: True where the candidate reaches the ward in time.

    Rows follow candidates_df order. IDs and ward codes are compared as strings; a missing
    or non-numeric travel time counts as unreachable.
    """
    times = travel_times.copy()
    times.index = times.index.astype(str)
    times.columns = times.columns.astype(str)
    times = times.apply(pd.to_numeric, errors="coerce")
    times = times.reindex(candidates_df["candidate_id"].astype(str))
    return (times <= max_response_minutes).fillna(False).astype(bool)


def _solve(
    n: int,
    num_ambulances: int,
    scores: np.ndarray,
    too_close: list[tuple[int, int]],
    coverage_sets: list[np.ndarray],
    time_limit_seconds: float,
) -> tuple[int, list[int]]:
    """Run one CBC solve. Returns (status, chosen row indices); chosen is empty without a solution."""
    solver = pywraplp.Solver.CreateSolver("CBC")
    if solver is None:
        raise RuntimeError("OR-Tools CBC solver is not available")

    x = [solver.BoolVar(f"x_{i}") for i in range(n)]
    solver.Add(solver.Sum(x) == num_ambulances)
    for i, j in too_close:
        solver.Add(x[i] + x[j] <= 1)
    # Each covered ward needs at least one chosen candidate that reaches it in time.
    for rows in coverage_sets:
        solver.Add(solver.Sum(x[i] for i in rows) >= 1)

    solver.Maximize(solver.Sum(float(scores[i]) * x[i] for i in range(n)))

    # A tight min_spacing_km against a large candidate set is close to a maximum
    # independent set problem (NP-hard); without a cap, CBC can spend minutes
    # proving infeasibility. Bound the solve time so the endpoint always returns.
    solver.SetTimeLimit(int(time_limit_seconds * 1000))

    status = solver.Solve()
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return status, []
    return status, [i for i in range(n) if x[i].solution_value() > 0.5]


def optimize_ambulance_positions(
    candidates_df: pd.DataFrame,
    num_ambulances: int,
    min_spacing_km: float = 2.0,
    time_limit_seconds: float = 10.0,
    travel_times: pd.DataFrame | None = None,
    max_response_minutes: float = 20.0,
) -> dict:
    """Choose exactly ``num_ambulances`` candidates maximising total weighted_score,
    with no two chosen candidates closer than ``min_spacing_km``.

    With ``travel_times`` (indexed by candidate_id, ward codes as columns, minutes), every
    ward that some candidate can reach within ``max_response_minutes`` must also be reached
    by at least one chosen candidate. If that makes the problem infeasible, it is solved
    again without the coverage rule and ``coverage_guaranteed`` is False. The result then
    also has ``coverage_guaranteed``, ``max_response_minutes``, ``uncoverable_wards`` (no
    candidate reaches them in time, so they were never constrained) and ``uncovered_wards``
    (coverable wards the chosen set does not reach in time).
    """
    n = len(candidates_df)
    if num_ambulances < 1:
        raise ValueError("num_ambulances must be at least 1")
    if num_ambulances > n:
        raise ValueError(
            f"num_ambulances ({num_ambulances}) is greater than the number of "
            f"candidates ({n})"
        )

    ids = candidates_df["candidate_id"].tolist()
    scores = candidates_df["weighted_score"].astype(float).to_numpy()
    lats, lons = _lat_lon(candidates_df)

    too_close: list[tuple[int, int]] = []
    if min_spacing_km > 0 and num_ambulances > 1:
        distances = _pairwise_haversine_km(lats, lons)
        too_close = list(zip(*np.where(np.triu(distances < min_spacing_km, k=1))))

    reach = None
    coverable: list[str] = []
    uncoverable: list[str] = []
    coverage_sets: list[np.ndarray] = []
    if travel_times is not None:
        reach = _reachability(candidates_df, travel_times, max_response_minutes)
        reachable_by_any = reach.any(axis=0)
        coverable = sorted(reach.columns[reachable_by_any])
        uncoverable = sorted(reach.columns[~reachable_by_any])
        coverage_sets = [np.flatnonzero(reach[ward].to_numpy()) for ward in coverable]

    # True when every coverable ward is constrained (trivially so if there are none).
    coverage_guaranteed = reach is not None
    status, chosen = _solve(n, num_ambulances, scores, too_close, coverage_sets, time_limit_seconds)
    if not chosen and coverage_sets:
        # Coverage can't be met (or no plan was found in time): fall back to the old problem.
        coverage_guaranteed = False
        status, chosen = _solve(n, num_ambulances, scores, too_close, [], time_limit_seconds)

    if not chosen:
        reason = (
            "no feasible placement exists"
            if status == pywraplp.Solver.INFEASIBLE
            else f"no solution was found within the {time_limit_seconds:g}s time limit"
        )
        raise ValueError(
            f"Could not place {num_ambulances} ambulances with min_spacing_km="
            f"{min_spacing_km}: {reason}. Try fewer ambulances or a smaller spacing."
        )

    result = {
        "chosen_candidates": [ids[i].item() if hasattr(ids[i], "item") else ids[i] for i in chosen],
        "total_weighted_score": float(scores[chosen].sum()),
    }
    if reach is not None:
        reached = reach.iloc[chosen].any(axis=0)
        result.update(
            coverage_guaranteed=coverage_guaranteed,
            max_response_minutes=float(max_response_minutes),
            uncoverable_wards=uncoverable,
            uncovered_wards=[ward for ward in coverable if not reached[ward]],
        )
    return result
