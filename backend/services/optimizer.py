"""Pick the best set of ambulance positions using integer programming."""

import numpy as np
import pandas as pd
try:
    # pyrefly: ignore[missing-import]
    from ortools.linear_solver import pywraplp
    _HAS_ORTOOLS = True
except (ImportError, OSError):
    _HAS_ORTOOLS = False

    class _SolverStatus:
        OPTIMAL = 0
        FEASIBLE = 1
        INFEASIBLE = 2
        ABNORMAL = 4

    class _DummyPywraplp:
        Solver = _SolverStatus

    pywraplp = _DummyPywraplp

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


def _solve_ortools(
    n: int,
    num_ambulances: int,
    scores: np.ndarray,
    too_close: list[tuple[int, int]],
    coverage_sets: list[np.ndarray],
    time_limit_seconds: float,
    *,
    ward_risks: "np.ndarray | None" = None,
    reach_matrix: "np.ndarray | None" = None,
    coverage_weight: float = 0.5,
    ward_groups: "dict[str, list[int]] | None" = None,
    max_per_ward: "int | None" = None,
) -> tuple[int, list[int]]:
    solver = pywraplp.Solver.CreateSolver("CBC")
    if solver is None:
        raise RuntimeError("OR-Tools CBC solver is not available")

    x = [solver.BoolVar(f"x_{i}") for i in range(n)]
    solver.Add(solver.Sum(x) == num_ambulances)
    for i, j in too_close:
        solver.Add(x[i] + x[j] <= 1)
    # Each coverable ward must be reached by at least one chosen candidate.
    for rows in coverage_sets:
        solver.Add(solver.Sum(x[i] for i in rows) >= 1)

    # Ward-level capacity constraint: prevent over-clustering in a single ward
    if ward_groups and max_per_ward and max_per_ward > 0:
        for ward_name, indices in ward_groups.items():
            solver.Add(solver.Sum(x[i] for i in indices) <= max_per_ward)

    use_diversity = (
        ward_risks is not None
        and reach_matrix is not None
        and len(ward_risks) > 0
        and 0.0 < coverage_weight < 1.0
    )

    if use_diversity:
        num_wards = len(ward_risks)

        # y[w] = 1 iff at least one chosen candidate covers ward w.
        y = [solver.BoolVar(f"y_{w}") for w in range(num_wards)]
        for w in range(num_wards):
            covering = [i for i in range(n) if reach_matrix[i, w]]
            if covering:
                # y[w] <= sum of x[i] for candidates that cover this ward.
                # If nobody covers it the constraint forces y[w] = 0.
                solver.Add(y[w] <= solver.Sum(x[i] for i in covering))
            else:
                solver.Add(y[w] == 0)

        # Normalise both terms independently so coverage_weight is a true fraction.
        score_max = float(scores.max()) if scores.max() > 0 else 1.0
        risk_max = float(ward_risks.max()) if ward_risks.max() > 0 else 1.0

        alpha = 1.0 - coverage_weight
        beta = coverage_weight

        # Normalise quality over the fleet so quality_term is in [0, alpha]
        quality_term = solver.Sum(
            alpha * (float(scores[i]) / (score_max * num_ambulances)) * x[i] for i in range(n)
        )
        # Each covered ward gives a base coverage incentive (0.6) plus a risk factor (0.4),
        # normalised by num_wards so diversity_term is in [0, beta]. This ensures green/low-risk
        # wards provide genuine reward for physical spread rather than being neglected.
        diversity_term = solver.Sum(
            beta * (0.6 + 0.4 * (float(ward_risks[w]) / risk_max)) / num_wards * y[w]
            for w in range(num_wards)
        )
        solver.Maximize(quality_term + diversity_term)
    else:
        # Original objective: pure quality score.
        solver.Maximize(solver.Sum(float(scores[i]) * x[i] for i in range(n)))

    # A tight min_spacing_km against a large candidate set is close to a maximum
    # independent set problem (NP-hard); without a cap, CBC can spend minutes
    # proving infeasibility. Bound the solve time so the endpoint always returns.
    solver.SetTimeLimit(int(time_limit_seconds * 1000))

    status = solver.Solve()
    if status not in (pywraplp.Solver.OPTIMAL, pywraplp.Solver.FEASIBLE):
        return status, []
    return status, [i for i in range(n) if x[i].solution_value() > 0.5]


def _solve_scipy(
    n: int,
    num_ambulances: int,
    scores: np.ndarray,
    too_close: list[tuple[int, int]],
    coverage_sets: list[np.ndarray],
    time_limit_seconds: float,
    *,
    ward_risks: "np.ndarray | None" = None,
    reach_matrix: "np.ndarray | None" = None,
    coverage_weight: float = 0.5,
    ward_groups: "dict[str, list[int]] | None" = None,
    max_per_ward: "int | None" = None,
) -> tuple[int, list[int]]:
    """SciPy HiGHS MILP fallback for integer linear programming."""
    import scipy.sparse as sp
    from scipy.optimize import Bounds, LinearConstraint, milp

    use_diversity = (
        ward_risks is not None
        and reach_matrix is not None
        and len(ward_risks) > 0
        and 0.0 < coverage_weight < 1.0
    )

    num_wards = len(ward_risks) if (use_diversity and ward_risks is not None) else 0
    total_vars = n + num_wards

    # Objective: SciPy minimizes c^T z, so negate coefficients to maximize
    c = np.zeros(total_vars, dtype=float)
    if use_diversity and ward_risks is not None:
        score_max = float(scores.max()) if scores.max() > 0 else 1.0
        risk_max = float(ward_risks.max()) if ward_risks.max() > 0 else 1.0
        alpha = 1.0 - coverage_weight
        beta = coverage_weight

        for i in range(n):
            c[i] = -alpha * (float(scores[i]) / (score_max * num_ambulances))
        for w in range(num_wards):
            c[n + w] = -beta * (0.6 + 0.4 * (float(ward_risks[w]) / risk_max)) / num_wards
    else:
        c[:n] = -scores.astype(float)

    rows: list[int] = []
    cols: list[int] = []
    vals: list[float] = []
    lhs: list[float] = []
    rhs: list[float] = []

    # 1. Total ambulance count: sum(x) == num_ambulances
    r = len(lhs)
    for i in range(n):
        rows.append(r)
        cols.append(i)
        vals.append(1.0)
    lhs.append(float(num_ambulances))
    rhs.append(float(num_ambulances))

    # 2. Minimum spacing: x_i + x_j <= 1
    for i, j in too_close:
        r = len(lhs)
        rows.extend([r, r])
        cols.extend([i, j])
        vals.extend([1.0, 1.0])
        lhs.append(-np.inf)
        rhs.append(1.0)

    # 3. Coverage sets: sum(x[i] for i in rows) >= 1
    for r_indices in coverage_sets:
        if len(r_indices) == 0:
            continue
        r = len(lhs)
        for i in r_indices:
            rows.append(r)
            cols.append(int(i))
            vals.append(1.0)
        lhs.append(1.0)
        rhs.append(np.inf)

    # 4. Ward-level capacity constraint: sum(x[i] for i in indices) <= max_per_ward
    if ward_groups and max_per_ward and max_per_ward > 0:
        for ward_name, indices in ward_groups.items():
            if not indices:
                continue
            r = len(lhs)
            for i in indices:
                rows.append(r)
                cols.append(int(i))
                vals.append(1.0)
            lhs.append(-np.inf)
            rhs.append(float(max_per_ward))

    # 5. Diversity linking: y[w] <= sum(x[i] for candidates covering ward w)
    if use_diversity and reach_matrix is not None:
        for w in range(num_wards):
            r = len(lhs)
            covering = [i for i in range(n) if reach_matrix[i, w]]
            if covering:
                rows.append(r)
                cols.append(n + w)
                vals.append(1.0)
                for i in covering:
                    rows.append(r)
                    cols.append(i)
                    vals.append(-1.0)
                lhs.append(-np.inf)
                rhs.append(0.0)
            else:
                rows.append(r)
                cols.append(n + w)
                vals.append(1.0)
                lhs.append(0.0)
                rhs.append(0.0)

    A = sp.coo_matrix((vals, (rows, cols)), shape=(len(lhs), total_vars)).tocsc()
    constraints = LinearConstraint(A, lhs, rhs)
    integrality = np.ones(total_vars)
    bounds = Bounds(0, 1)

    options = {}
    if time_limit_seconds > 0:
        options["time_limit"] = float(time_limit_seconds)

    res = milp(c=c, integrality=integrality, bounds=bounds, constraints=constraints, options=options)

    optimal_code = getattr(pywraplp.Solver, "OPTIMAL", 0)
    feasible_code = getattr(pywraplp.Solver, "FEASIBLE", 1)
    infeasible_code = getattr(pywraplp.Solver, "INFEASIBLE", 2)

    if res.status == 0:
        chosen = [i for i in range(n) if res.x[i] > 0.5]
        return optimal_code, chosen
    elif res.status == 1 and res.x is not None and not np.isnan(res.x[:n]).any():
        chosen = [i for i in range(n) if res.x[i] > 0.5]
        return feasible_code, chosen
    else:
        return infeasible_code, []


def _solve(
    n: int,
    num_ambulances: int,
    scores: np.ndarray,
    too_close: list[tuple[int, int]],
    coverage_sets: list[np.ndarray],
    time_limit_seconds: float,
    *,
    ward_risks: "np.ndarray | None" = None,
    reach_matrix: "np.ndarray | None" = None,
    coverage_weight: float = 0.5,
    ward_groups: "dict[str, list[int]] | None" = None,
    max_per_ward: "int | None" = None,
) -> tuple[int, list[int]]:
    """Solve the optimization problem using OR-Tools CBC if available, falling back to SciPy HiGHS."""
    if _HAS_ORTOOLS:
        try:
            return _solve_ortools(
                n,
                num_ambulances,
                scores,
                too_close,
                coverage_sets,
                time_limit_seconds,
                ward_risks=ward_risks,
                reach_matrix=reach_matrix,
                coverage_weight=coverage_weight,
                ward_groups=ward_groups,
                max_per_ward=max_per_ward,
            )
        except Exception:
            pass

    return _solve_scipy(
        n,
        num_ambulances,
        scores,
        too_close,
        coverage_sets,
        time_limit_seconds,
        ward_risks=ward_risks,
        reach_matrix=reach_matrix,
        coverage_weight=coverage_weight,
        ward_groups=ward_groups,
        max_per_ward=max_per_ward,
    )


def _greedy_placement(num_ambulances: int, scores: np.ndarray, too_close: list[tuple[int, int]]) -> list[int]:
    """Fast fallback when ILP solver exceeds time limit: greedily pick highest-scoring points respecting spacing."""
    from collections import defaultdict
    adj = defaultdict(set)
    for i, j in too_close:
        adj[i].add(j)
        adj[j].add(i)
    order = np.argsort(-scores)
    chosen: list[int] = []
    excluded: set[int] = set()
    for idx in order:
        if idx in excluded:
            continue
        chosen.append(int(idx))
        excluded.update(adj[idx])
        if len(chosen) == num_ambulances:
            return chosen
    return chosen if len(chosen) == num_ambulances else []


def optimize_ambulance_positions(
    candidates_df: pd.DataFrame,
    num_ambulances: int,
    min_spacing_km: float = 2.0,
    time_limit_seconds: float = 10.0,
    travel_times: "pd.DataFrame | None" = None,
    max_response_minutes: float = 20.0,
    zone_scores: "dict | None" = None,
    coverage_weight: float = 0.5,
    spread_response_minutes: float = 10.0,
    max_per_ward: "int | None" = None,
) -> dict:
    """Choose exactly ``num_ambulances`` candidates maximising total weighted_score,
    with no two chosen candidates closer than ``min_spacing_km``.

    With ``travel_times`` (indexed by candidate_id, ward codes as columns, minutes), every
    ward that some candidate can reach within ``max_response_minutes`` must also be reached
    by at least one chosen candidate. If that makes the problem infeasible, it is solved
    again without the coverage rule and ``coverage_guaranteed`` is False.

    ``zone_scores`` (ward_code -> risk score) and ``coverage_weight`` (0.0–1.0) enable a
    diversity bonus: the objective blends per-unit placement quality (alpha) with a reward
    for covering new wards (beta), so ambulances spread instead of clustering in the
    highest-demand area.

    ``spread_response_minutes`` controls the reachability window used *only* for the
    diversity bonus's y[w] variables — it is tighter than ``max_response_minutes`` (default 10 min)
    so that a candidate must be physically close to a ward to claim its diversity credit.

    ``max_per_ward`` caps the number of chosen ambulances in any single ward (defaults to
    balanced ceiling across available wards), preventing overcrowding in one zone.
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

    # Build ward-level arrays for the diversity bonus.
    # Use a TIGHTER reachability window (spread_response_minutes) so that a candidate
    # must be physically close to a ward to claim diversity credit for covering it.
    ward_risks = None
    reach_matrix = None
    if travel_times is not None and zone_scores and coverage_weight > 0:
        spread_reach = _reachability(candidates_df, travel_times, spread_response_minutes)
        zone_scores_str = {str(k): float(v) for k, v in zone_scores.items()}
        ward_cols = [w for w in spread_reach.columns if str(w) in zone_scores_str]
        if ward_cols:
            ward_risks = np.array([zone_scores_str[str(w)] for w in ward_cols])
            reach_matrix = spread_reach[ward_cols].to_numpy(dtype=bool)

    # Ward groups for capacity capping
    ward_groups: dict[str, list[int]] = {}
    if "ward_code" in candidates_df.columns:
        for idx, wcode in enumerate(candidates_df["ward_code"]):
            if pd.notna(wcode) and wcode:
                ward_groups.setdefault(str(wcode), []).append(idx)

    effective_max_per_ward = max_per_ward
    if effective_max_per_ward is None and len(ward_groups) > 1:
        effective_max_per_ward = max(1, int(np.ceil(num_ambulances / len(ward_groups))))

    # True when every coverable ward is constrained (trivially so if there are none).
    coverage_guaranteed = reach is not None
    status, chosen = _solve(
        n, num_ambulances, scores, too_close, coverage_sets, time_limit_seconds,
        ward_risks=ward_risks, reach_matrix=reach_matrix, coverage_weight=coverage_weight,
        ward_groups=ward_groups, max_per_ward=effective_max_per_ward,
    )
    if not chosen and coverage_sets:
        # Coverage constraints made problem infeasible: retry without them.
        coverage_guaranteed = False
        status, chosen = _solve(
            n, num_ambulances, scores, too_close, [], time_limit_seconds,
            ward_risks=ward_risks, reach_matrix=reach_matrix, coverage_weight=coverage_weight,
            ward_groups=ward_groups, max_per_ward=effective_max_per_ward,
        )

    # If still not chosen, retry without max_per_ward constraint as safety fallback
    if not chosen and effective_max_per_ward is not None:
        status, chosen = _solve(
            n, num_ambulances, scores, too_close, [], time_limit_seconds,
            ward_risks=ward_risks, reach_matrix=reach_matrix, coverage_weight=coverage_weight,
            ward_groups=None, max_per_ward=None,
        )

    # If still not chosen, retry with pure quality score (coverage_weight=0)
    if not chosen:
        status, chosen = _solve(
            n, num_ambulances, scores, too_close, [], time_limit_seconds,
            coverage_weight=0.0,
        )

    # Ultimate fallback: greedy selection by score respecting minimum spacing
    if not chosen:
        chosen = _greedy_placement(num_ambulances, scores, too_close)

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
