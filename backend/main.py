"""FastAPI backend for ambulance placement optimisation.

Run from inside the backend/ folder:
    uvicorn main:app --reload
"""

from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

import geopandas as gpd
import pandas as pd
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

# Imported as a module: main.py already has a pydantic class named Ambulance.
import models
from database import get_db
from services.assignment import CAPABILITY, assign_ambulances_to_positions
from services.optimizer import filter_candidates_by_radius, optimize_ambulance_positions
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


def _db_unavailable(exc: SQLAlchemyError) -> HTTPException:
    # Only the driver's first line: enough to diagnose, never the connection URL.
    reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
    return HTTPException(status_code=503, detail=f"Database unreachable: {reason}")


class Ambulance(BaseModel):
    id: str
    type: str

    @field_validator("type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in CAPABILITY:
            raise ValueError(f"type must be one of: {', '.join(CAPABILITY)}")
        return normalized


class HospitalRegistration(BaseModel):
    hospital_name: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    operating_radius_km: float = Field(gt=0)
    ambulances: List[Ambulance] = Field(min_length=1)


@app.get("/health")
def health():
    return {"data_loaded": "error" not in data, "error": data.get("error")}


@app.get("/health/db")
def health_db(db: Session = Depends(get_db)):
    try:
        hospital_count = db.scalar(select(func.count()).select_from(models.Hospital))
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)
    return {"database": "ok", "hospitals": hospital_count}


@app.post("/hospital/register")
def register_hospital(registration: HospitalRegistration, db: Session = Depends(get_db)):
    hospital = models.Hospital(
        name=registration.hospital_name,
        lat=registration.lat,
        lng=registration.lng,
        operating_radius_km=registration.operating_radius_km,
    )
    # current_status defaults to available in the model.
    hospital.ambulances = [
        models.Ambulance(call_sign=a.id, type=models.AmbulanceType(a.type))
        for a in registration.ambulances
    ]
    try:
        db.add(hospital)
        db.commit()
    except IntegrityError:
        db.rollback()
        # ambulances has UNIQUE (hospital_id, call_sign).
        raise HTTPException(status_code=409, detail="Each ambulance ID must be unique within the hospital")
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {
        "status": "registered",
        "hospital_id": hospital.hospital_id,
        "fleet_size": len(registration.ambulances),
    }


@app.get("/demand-scores")
def demand_scores(hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)")):
    if "error" in data:
        raise HTTPException(status_code=503, detail=data["error"])

    risk = data["risk_scores"]
    hour_rows = risk[risk[RISK_HOUR_COL] == hour]
    if hour_rows.empty:
        raise HTTPException(status_code=404, detail=f"No risk scores found for hour {hour}")

    return [
        {"ward_code": _clean(ward), "risk_score": float(score)}
        for ward, score in zip(hour_rows[RISK_WARD_COL], hour_rows[RISK_SCORE_COL])
    ]


@app.get("/optimize")
def optimize(
    hospital_id: int = Query(..., description="ID returned by POST /hospital/register"),
    hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)"),
    min_spacing_km: float = Query(2.0, ge=0, description="Minimum distance between ambulances"),
    db: Session = Depends(get_db),
):
    if "error" in data:
        raise HTTPException(status_code=503, detail=data["error"])

    try:
        hospital = db.get(models.Hospital, hospital_id)
        fleet = (
            db.scalars(
                select(models.Ambulance)
                .where(models.Ambulance.hospital_id == hospital_id)
                .order_by(models.Ambulance.ambulance_id)
            ).all()
            if hospital
            else []
        )
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)

    if hospital is None:
        raise HTTPException(
            status_code=404,
            detail=f"No hospital with hospital_id {hospital_id}. POST to /hospital/register first.",
        )

    # Same shape the old in-memory registration had: {"id": ..., "type": "ALS" | "BLS"}.
    ambulances = [{"id": a.call_sign, "type": a.type.value} for a in fleet]

    num_ambulances = len(ambulances)
    if num_ambulances < 1:
        raise HTTPException(status_code=400, detail="Registered hospital has no ambulances")

    candidates = data["candidates"]
    nearby = filter_candidates_by_radius(
        candidates,
        hospital.lat,
        hospital.lng,
        hospital.operating_radius_km,
    )
    if len(nearby) < num_ambulances:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Only {len(nearby)} candidate position(s) found within "
                f"{hospital.operating_radius_km} km of "
                f"{hospital.name}, but the registered fleet "
                f"needs {num_ambulances} position(s). Register a larger "
                "operating_radius_km or a smaller fleet."
            ),
        )

    risk = data["risk_scores"]
    hour_rows = risk[risk[RISK_HOUR_COL] == hour]
    if hour_rows.empty:
        raise HTTPException(status_code=404, detail=f"No risk scores found for hour {hour}")
    zone_scores = dict(zip(hour_rows[RISK_WARD_COL], hour_rows[RISK_SCORE_COL]))

    scored = calculate_weighted_scores(nearby, data["travel_times"], zone_scores)

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
            # The candidates file is CRS84, so x is longitude and y is latitude.
            "lat": float(row.geometry.y),
            "lng": float(row.geometry.x),
        }
        for _, row in chosen.iterrows()
    ]

    try:
        result["assignments"] = assign_ambulances_to_positions(
            ambulances, pd.DataFrame(result["details"])
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result
