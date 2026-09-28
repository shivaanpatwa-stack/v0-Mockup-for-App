"""Turn ward-level risk scores into a single score per candidate position."""

import numpy as np
import pandas as pd


def calculate_weighted_scores(
    candidates_df: pd.DataFrame,
    travel_time_matrix: pd.DataFrame,
    zone_scores: dict,
    max_minutes: float = 15,
) -> pd.DataFrame:
    """Add a 'weighted_score' column to a copy of candidates_df.

    For each candidate, every ward reachable within ``max_minutes`` contributes
    its risk score, weighted by 1 / (travel_time + 1) so closer wards count
    more. The result is the weighted average of those scores. Candidates that
    reach no wards get a score of 0. Wards missing from ``zone_scores`` are
    treated as having a risk score of 0.
    """
    if "candidate_id" not in candidates_df.columns:
        raise ValueError("candidates_df must have a 'candidate_id' column")

    # Compare IDs and ward codes as strings so e.g. 101 and "101" still match.
    times = travel_time_matrix.copy()
    times.index = times.index.astype(str)
    times.columns = times.columns.astype(str)
    times = times.apply(pd.to_numeric, errors="coerce")

    scores = pd.Series({str(k): float(v) for k, v in zone_scores.items()})
    scores = scores.reindex(times.columns).fillna(0.0)

    reachable = times.notna() & (times <= max_minutes)
    weights = (1.0 / (times + 1.0)).where(reachable, 0.0)

    weight_sums = weights.sum(axis=1)
    weighted_sums = weights.mul(scores, axis=1).sum(axis=1)
    per_candidate = (weighted_sums / weight_sums.replace(0, np.nan)).fillna(0.0)

    result = candidates_df.copy()
    result["weighted_score"] = (
        result["candidate_id"].astype(str).map(per_candidate).fillna(0.0).astype(float)
    )
    return result
