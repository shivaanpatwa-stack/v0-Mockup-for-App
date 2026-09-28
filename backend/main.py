"""FastAPI backend for ambulance placement optimisation.

Run from inside the backend/ folder:
    uvicorn main:app --reload
"""

from contextlib import asynccontextmanager
from pathlib import Path

import geopandas as gpd
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from services.optimizer import optimize_ambulance_positions
from services.weighting import calculate_weighted_scores

DATA_DIR = Path(__file__).resolve().parent / "data"
CANDIDATES_FILE = DATA_DIR / "candidate_positions_final.geojson"
TRAVEL_TIMES_FILE = DATA_DIR / "travel_time_matrix_final.csv"
RISK_SCORES_FILE = DATA_DIR / "ward_hour_risk_scores.csv"

# Column names expected in ward_hour_risk_scores.csv
RISK_WARD_COL = "ward_code"
RISK_HOUR_COL = "hour"
RISK_SCORE_COL = "risk_score"

data: dict = {}


def load_data() -> None:
    """Load all data files into `data`. Records an error instead of crashing."""
    data.clear()
    missing = [p.name for p in (CANDIDATES_FILE, TRAVEL_TIMES_FILE, RISK_SCORES_FILE) if not p.exists()]
    if missing:
        data["error"] = f"Missing data files in {DATA_DIR}: {', '.join(missing)}"
        return

    try:
        candidates = gpd.read_file(CANDIDATES_FILE)
        travel_times = pd.read_csv(TRAVEL_TIMES_FILE, index_col="candidate_id")
        risk_scores = pd.read_csv(RISK_SCORES_FILE)
    except Exception as exc:  # bad format, missing index column, etc.
        data["error"] = f"Failed to load data files: {exc}"
        return

    if "candidate_id" not in candidates.columns:
        data["error"] = f"{CANDIDATES_FILE.name} has no 'candidate_id' property"
        return
    missing_cols = {RISK_WARD_COL, RISK_HOUR_COL, RISK_SCORE_COL} - set(risk_scores.columns)
    if missing_cols:
        data["error"] = f"{RISK_SCORES_FILE.name} is missing columns: {', '.join(sorted(missing_cols))}"
        return

    data.update(candidates=candidates, travel_times=travel_times, risk_scores=risk_scores)


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_data()
    if "error" in data:
        print(f"WARNING: {data['error']}")
    yield


app = FastAPI(title="Ambulance Placement Optimizer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clean(value):
    """Convert numpy/pandas values to plain JSON-friendly Python values."""
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return None
    return value.item() if hasattr(value, "item") else value


@app.get("/health")
def health():
    return {"data_loaded": "error" not in data, "error": data.get("error")}


@app.get("/optimize")
def optimize(
    hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)"),
    num_ambulances: int = Query(..., ge=1, description="Number of ambulances to place"),
    min_spacing_km: float = Query(2.0, ge=0, description="Minimum distance between ambulances"),
):
    if "error" in data:
        raise HTTPException(status_code=503, detail=data["error"])

    candidates = data["candidates"]
    if num_ambulances > len(candidates):
        raise HTTPException(
            status_code=400,
            detail=f"num_ambulances ({num_ambulances}) is greater than the number of "
            f"available candidates ({len(candidates)})",
        )

    risk = data["risk_scores"]
    hour_rows = risk[risk[RISK_HOUR_COL] == hour]
    if hour_rows.empty:
        raise HTTPException(status_code=404, detail=f"No risk scores found for hour {hour}")
    zone_scores = dict(zip(hour_rows[RISK_WARD_COL], hour_rows[RISK_SCORE_COL]))

    scored = calculate_weighted_scores(candidates, data["travel_times"], zone_scores)

    try:
        result = optimize_ambulance_positions(scored, num_ambulances, min_spacing_km)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    chosen = scored[scored["candidate_id"].isin(result["chosen_candidates"])]
    result["details"] = [
        {
            "candidate_id": _clean(row["candidate_id"]),
            "name": _clean(row.get("name")),
            "ward_code": _clean(row.get("ward_code")),
            "weighted_score": float(row["weighted_score"]),
        }
        for _, row in chosen.iterrows()
    ]
    return result
