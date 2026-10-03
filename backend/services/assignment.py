"""Match each ambulance to one of the optimizer's chosen positions."""

import numpy as np
import pandas as pd
from scipy.optimize import linear_sum_assignment

# Higher capability = more strongly drawn to high-scoring positions.
CAPABILITY = {"ALS": 1.0, "BLS": 0.5}


def assign_ambulances_to_positions(
    ambulances: list[dict],
    chosen_positions_df: pd.DataFrame,
) -> list[dict]:
    """Assign each ambulance to exactly one chosen position.

    The assignment maximises the sum of capability * weighted_score, where
    capability is 1.0 for ALS and 0.5 for BLS, so ALS units end up at the
    higher-scoring positions and BLS units at the lower-scoring ones.

    Raises ValueError if the counts differ or an ambulance has an unknown type.
    """
    n_ambulances = len(ambulances)
    n_positions = len(chosen_positions_df)
    if n_ambulances != n_positions:
        raise ValueError(
            f"Number of ambulances ({n_ambulances}) must match the number of "
            f"chosen positions ({n_positions})"
        )
    if n_ambulances == 0:
        return []

    required = {"candidate_id", "name", "ward_code", "weighted_score"}
    missing = required - set(chosen_positions_df.columns)
    if missing:
        raise ValueError(f"chosen_positions_df is missing columns: {', '.join(sorted(missing))}")

    types = [str(a["type"]).strip().upper() for a in ambulances]
    unknown = sorted({t for t in types if t not in CAPABILITY})
    if unknown:
        raise ValueError(
            f"Unknown ambulance type(s): {', '.join(unknown)}. Expected one of: "
            f"{', '.join(CAPABILITY)}"
        )

    capability = np.array([CAPABILITY[t] for t in types])
    scores = chosen_positions_df["weighted_score"].astype(float).to_numpy()

    # linear_sum_assignment minimises total cost, so negate the value to maximise it.
    cost = -np.outer(capability, scores)
    rows, cols = linear_sum_assignment(cost)

    positions = chosen_positions_df.reset_index(drop=True)
    assignments = []
    for i, j in zip(rows, cols):
        position = positions.iloc[j]
        candidate_id = position["candidate_id"]
        ward_code = position["ward_code"]
        name = position["name"]
        assignments.append(
            {
                "ambulance_id": ambulances[i]["id"],
                "type": types[i],
                "candidate_id": candidate_id.item() if hasattr(candidate_id, "item") else candidate_id,
                "name": None if pd.isna(name) else name,
                "ward_code": None if pd.isna(ward_code) else ward_code,
                "weighted_score": float(position["weighted_score"]),
            }
        )
    return assignments
