"""FastAPI backend for ambulance placement optimisation.

Run from inside the backend/ folder:
    uvicorn main:app --reload
"""

import hmac
import ipaddress
import logging
import os
import random
from contextlib import asynccontextmanager
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import List, Literal, Optional
from zoneinfo import ZoneInfo

import geopandas as gpd
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

# Imported as a module: main.py already has a pydantic class named Ambulance.
import models
from credentials import (
    CredentialGenerationError,
    admin_key_matches,
    generate_admin_key,
    generate_hospital_code,
    normalise_code,
    require_pepper,
)
from database import get_db
from services.assignment import CAPABILITY, assign_ambulances_to_positions
from services.kpis import compute_kpis, haversine_km
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

# Runs plan for "today" in Mumbai's time zone, one hour-long window per run.
PLANNING_TZ = ZoneInfo("Asia/Kolkata")
MODEL_VERSION = "v1"

logger = logging.getLogger(__name__)

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

    # candidate_id -> name, ward and position, for describing saved assignments.
    candidate_lookup = {
        str(row["candidate_id"]): {
            "name": _clean(row.get("name")),
            "ward_code": _clean(row.get("ward_code")),
            # The candidates file is CRS84, so x is longitude and y is latitude.
            "lat": float(row.geometry.y),
            "lng": float(row.geometry.x),
        }
        for _, row in candidates.iterrows()
    }
    data.update(
        candidates=candidates,
        candidate_lookup=candidate_lookup,
        travel_times=travel_times,
        risk_scores=risk_scores,
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Admin keys are checked against HMAC(KEY_PEPPER, key): refuse to start without the pepper.
    require_pepper()
    load_data()
    if "error" in data:
        print(f"WARNING: {data['error']}")
    yield


app = FastAPI(title="Ambulance Placement Optimizer", lifespan=lifespan)

HOSPITAL_CODE_HEADER = "X-Hospital-Code"
ADMIN_KEY_HEADER = "X-Admin-Key"
PROXY_SECRET_HEADER = "X-Proxy-Secret"
CLIENT_IP_HEADER = "X-Client-IP"

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Content-Type", HOSPITAL_CODE_HEADER, ADMIN_KEY_HEADER, PROXY_SECRET_HEADER, CLIENT_IP_HEADER],
    # Lets the browser read how long to wait after a 429.
    expose_headers=["Retry-After"],
)


def _clean(value):
    """Convert numpy/pandas values to plain JSON-friendly Python values."""
    if value is None or (not isinstance(value, str) and pd.isna(value)):
        return None
    return value.item() if hasattr(value, "item") else value


# Database driver errors can name hosts, users, tables and constraints, so clients get a generic
# message and the details go to the server log. Set ENVIRONMENT=development to see them in responses.
SHOW_ERROR_DETAILS = os.getenv("ENVIRONMENT", "production").strip().lower() == "development"
DB_UNAVAILABLE = "Database service temporarily unavailable"


def _db_unavailable(exc: SQLAlchemyError) -> HTTPException:
    # First line only: the driver's later lines can include the values that were sent.
    reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
    logger.error("Database error: %s", reason)
    return HTTPException(status_code=503, detail=f"{DB_UNAVAILABLE}: {reason}" if SHOW_ERROR_DETAILS else DB_UNAVAILABLE)


# ---- Client IP ----
# Behind a proxy every request arrives from the proxy's address, so the real client must come from a
# header -- but only one this server can trust:
#  1. PROXY_SHARED_SECRET set and X-Proxy-Secret matches: use X-Client-IP (set by your proxy).
#  2. TRUSTED_PROXY_HOPS > 0: count that many entries from the RIGHT of X-Forwarded-For. Entries to
#     the left were written by the client and can be forged, so the leftmost is never used.
#  3. Otherwise the direct connection's address.
PROXY_SHARED_SECRET = os.getenv("PROXY_SHARED_SECRET", "")
TRUSTED_PROXY_HOPS = max(0, int(os.getenv("TRUSTED_PROXY_HOPS", "0") or 0))


def _valid_ip(value: str | None) -> Optional[str]:
    try:
        return str(ipaddress.ip_address((value or "").strip()))
    except ValueError:
        return None


def get_client_ip(request: Request) -> str:
    direct = request.client.host if request.client else "unknown"
    if PROXY_SHARED_SECRET:
        presented = request.headers.get(PROXY_SECRET_HEADER, "")
        if presented and hmac.compare_digest(presented.encode(), PROXY_SHARED_SECRET.encode()):
            ip = _valid_ip(request.headers.get(CLIENT_IP_HEADER))
            if ip:
                return ip
    if TRUSTED_PROXY_HOPS > 0:
        hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
        if len(hops) >= TRUSTED_PROXY_HOPS:
            ip = _valid_ip(hops[-TRUSTED_PROXY_HOPS])
            if ip:
                return ip
    return direct


# ---- Abuse protection (stored in the auth_failures table, so it survives restarts and is shared
# between server processes) ----
# kind "auth_fail": one row per failed credential check (a wrong code or a wrong admin key). At
#   AUTH_MAX_FAILURES within AUTH_WINDOW, every hospital-scoped request from that IP gets 429 before
#   its credentials are even looked at. A request with no credentials at all is rejected but not
#   counted: nothing was guessed, and counting it would lock out a client that simply has no code yet.
# kind "register": POST /hospital/register is limited to REGISTER_MAX per REGISTER_WINDOW per IP.
AUTH_FAIL = "auth_fail"
REGISTER = "register"
AUTH_MAX_FAILURES = 10
AUTH_WINDOW = timedelta(minutes=10)
REGISTER_MAX = 5
REGISTER_WINDOW = timedelta(hours=1)
PURGE_PROBABILITY = 0.01
PURGE_OLDER_THAN = timedelta(days=1)
TOO_MANY_ATTEMPTS = "Too many attempts, try again later."
INVALID_CODE = "Invalid hospital code"
INVALID_CREDENTIALS = "Invalid credentials"


def _maybe_purge(db: Session) -> None:
    """About 1 request in 100 deletes rows nobody counts any more."""
    if random.random() < PURGE_PROBABILITY:
        db.execute(delete(models.AuthFailure).where(models.AuthFailure.created_at < func.now() - PURGE_OLDER_THAN))
        db.commit()


def _enforce_limit(db: Session, ip: str, kind: str, limit: int, window: timedelta) -> None:
    """429 with Retry-After if this IP already has `limit` rows of `kind` inside `window`."""
    F = models.AuthFailure
    recent = db.scalars(
        select(F.created_at)
        .where(F.client_ip == ip, F.kind == kind, F.created_at > func.now() - window)
        .order_by(F.created_at.desc())
        .limit(limit)
    ).all()
    if len(recent) < limit:
        return
    # Unblocked once the oldest of the `limit` most recent rows leaves the window.
    now = db.scalar(select(func.now()))
    retry_after = max(1, int((recent[-1] + window - now).total_seconds()) + 1)
    raise HTTPException(status_code=429, detail=TOO_MANY_ATTEMPTS, headers={"Retry-After": str(retry_after)})


def _record(db: Session, ip: str, kind: str) -> None:
    db.add(models.AuthFailure(client_ip=ip, kind=kind))
    db.commit()


def _guarded(db: Session, ip: str) -> None:
    try:
        _maybe_purge(db)
        _enforce_limit(db, ip, AUTH_FAIL, AUTH_MAX_FAILURES, AUTH_WINDOW)
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)


def _fail(db: Session, ip: str, status_code: int, detail: str) -> HTTPException:
    try:
        _record(db, ip, AUTH_FAIL)
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not record a failed credential check")
    return HTTPException(status_code=status_code, detail=detail)


# ---- Authorisation: the ONLY way an endpoint gets a hospital ----


def get_hospital(
    request: Request,
    db: Session = Depends(get_db),
    hospital_code: Optional[str] = Header(None, alias=HOSPITAL_CODE_HEADER),
):
    """Driver level: the hospital whose code is in X-Hospital-Code. Missing and unknown codes get the
    same 401, so the response never reveals whether a code exists."""
    ip = get_client_ip(request)
    _guarded(db, ip)
    code = normalise_code(hospital_code)
    if not code:
        raise HTTPException(status_code=401, detail=INVALID_CODE)
    try:
        hospital = db.scalars(select(models.Hospital).where(models.Hospital.code == code)).first()
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)
    if hospital is None:
        raise _fail(db, ip, 401, INVALID_CODE)
    return hospital


def require_admin(
    request: Request,
    hospital=Depends(get_hospital),
    db: Session = Depends(get_db),
    admin_key: Optional[str] = Header(None, alias=ADMIN_KEY_HEADER),
):
    """Admin level: a valid hospital code plus that hospital's admin key."""
    provided = (admin_key or "").strip()
    if not admin_key_matches(provided, hospital.admin_key_hash):
        if provided:
            raise _fail(db, get_client_ip(request), 403, INVALID_CREDENTIALS)
        raise HTTPException(status_code=403, detail=INVALID_CREDENTIALS)
    return hospital


def _new_credential(make):
    try:
        return make()
    except CredentialGenerationError as exc:
        raise HTTPException(status_code=503, detail=f"{exc}; please try again")
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)


def _hospital_fleet(db: Session, hospital_id: int):
    return db.scalars(
        select(models.Ambulance)
        .where(models.Ambulance.hospital_id == hospital_id)
        .order_by(models.Ambulance.ambulance_id)
    ).all()


def _require_hospital_ambulance(db: Session, hospital, call_sign: str):
    """The hospital's ambulance with this call sign, or a 404."""
    ambulance = db.scalars(
        select(models.Ambulance).where(
            models.Ambulance.hospital_id == hospital.hospital_id,
            models.Ambulance.call_sign == call_sign,
        )
    ).first()
    if ambulance is None:
        raise HTTPException(status_code=404, detail=f"No ambulance {call_sign!r} in {hospital.name}")
    return ambulance


def _current_assignments(db: Session, hospital, ambulance_ids) -> dict:
    """ambulance_id -> its current assignment: the non-cancelled one with the highest assignment_id.
    Only the hospital's own ambulances are considered, whatever ids are passed in."""
    A = models.AmbulanceAssignment
    latest = (
        select(func.max(A.assignment_id))
        .join(models.Ambulance, models.Ambulance.ambulance_id == A.ambulance_id)
        .where(
            models.Ambulance.hospital_id == hospital.hospital_id,
            A.ambulance_id.in_(list(ambulance_ids)),
            A.status != models.AssignmentStatus.cancelled,
        )
        .group_by(A.ambulance_id)
    )
    return {a.ambulance_id: a for a in db.scalars(select(A).where(A.assignment_id.in_(latest)))}


def _assignment_summary(assignment) -> dict:
    place = data.get("candidate_lookup", {}).get(str(assignment.candidate_id), {})
    return {
        "candidate_id": assignment.candidate_id,
        "name": place.get("name"),
        "ward_code": place.get("ward_code"),
        "lat": place.get("lat"),
        "lng": place.get("lng"),
        "assignment_status": assignment.status.value,
        "valid_from": assignment.valid_from,
        "valid_to": assignment.valid_to,
    }


def _hospital_payload(hospital, fleet) -> dict:
    return {
        "hospital_id": hospital.hospital_id,
        "code": hospital.code,
        "name": hospital.name,
        "lat": hospital.lat,
        "lng": hospital.lng,
        "operating_radius_km": hospital.operating_radius_km,
        "fleet_size": len(fleet),
        "ambulances": [
            {"id": a.call_sign, "type": a.type.value, "status": a.current_status.value} for a in fleet
        ],
    }


def _run_summary(run) -> dict:
    return {
        "run_id": run.run_id,
        "created_at": run.created_at,
        "target_date": run.target_date,
        "target_hour": run.target_hour,
        "status": run.status.value,
        "num_ambulances": run.num_ambulances,
        "total_weighted_score": run.total_weighted_score,
        "error_message": run.error_message,
    }


class PlanError(Exception):
    """A planning failure with the HTTP status the endpoints answer with."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _in_service(fleet) -> list:
    """Ambulances that can be placed: every status except unavailable."""
    return [a for a in fleet if a.current_status != models.AmbulanceStatus.unavailable]


def _compute_plan(
    *,
    hospital_name: str,
    hospital_lat: float,
    hospital_lng: float,
    operating_radius_km: float,
    ambulances: list[dict],
    hour: int,
    min_spacing_km: float,
    max_response_minutes: float,
) -> dict:
    """Place and assign `ambulances` ({"id", "type"} dicts) for one hour. Never touches the database.

    Returns the /optimize result fields (chosen_candidates, total_weighted_score, the coverage
    fields, details, assignments). Raises PlanError for anything /optimize answers with an error.
    """
    num_ambulances = len(ambulances)
    if num_ambulances < 1:
        raise PlanError(400, "No ambulances in service")

    nearby = filter_candidates_by_radius(data["candidates"], hospital_lat, hospital_lng, operating_radius_km)
    if len(nearby) < num_ambulances:
        raise PlanError(
            400,
            (
                f"Only {len(nearby)} candidate position(s) found within "
                f"{operating_radius_km} km of "
                f"{hospital_name}, but the registered fleet "
                f"needs {num_ambulances} position(s). Register a larger "
                "operating_radius_km or a smaller fleet."
            ),
        )

    risk = data["risk_scores"]
    hour_rows = risk[risk[RISK_HOUR_COL] == hour]
    if hour_rows.empty:
        raise PlanError(404, f"No risk scores found for hour {hour}")
    zone_scores = dict(zip(hour_rows[RISK_WARD_COL], hour_rows[RISK_SCORE_COL]))

    scored = calculate_weighted_scores(nearby, data["travel_times"], zone_scores)

    try:
        # Also returns coverage_guaranteed, max_response_minutes, uncoverable_wards, uncovered_wards.
        result = optimize_ambulance_positions(
            scored,
            num_ambulances,
            min_spacing_km,
            travel_times=data["travel_times"],
            max_response_minutes=max_response_minutes,
            zone_scores=zone_scores,   # enables ward-coverage diversity bonus
            coverage_weight=0.5,       # 50 % quality, 50 % geographic spread
        )
    except ValueError as exc:
        raise PlanError(422, str(exc))

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
        result["assignments"] = assign_ambulances_to_positions(ambulances, pd.DataFrame(result["details"]))
    except ValueError as exc:
        raise PlanError(422, str(exc))
    result["kpis"] = _plan_kpis(
        hour, hospital_lat, hospital_lng, result["chosen_candidates"], [a["type"] for a in result["assignments"]]
    )
    return result


def _nearest_candidate(lat: float, lng: float) -> tuple[str, float]:
    """The candidate position (among all of them) closest to a point, and its distance in km."""
    return min(
        ((cid, haversine_km(lat, lng, info["lat"], info["lng"])) for cid, info in data["candidate_lookup"].items()),
        key=lambda item: item[1],
    )


def _plan_kpis(hour: int, hospital_lat: float, hospital_lng: float, chosen_ids: list, unit_types: list) -> Optional[dict]:
    """services.kpis numbers for a placement; "before" = every unit at the candidate nearest the hospital."""
    risk = data["risk_scores"]
    hour_rows = risk[risk[RISK_HOUR_COL] == hour]
    if hour_rows.empty or not chosen_ids:
        return None
    lookup = data["candidate_lookup"]
    base_id, base_km = _nearest_candidate(hospital_lat, hospital_lng)
    multiplier = hour_rows["time_multiplier"].iloc[0] if "time_multiplier" in hour_rows else None
    return compute_kpis(
        data["travel_times"],
        dict(zip(hour_rows[RISK_WARD_COL], hour_rows[RISK_SCORE_COL])),
        chosen_ids,
        base_id,
        baseline_distance_km=base_km,
        unit_types=unit_types,
        chosen_points=[(lookup[str(c)]["lat"], lookup[str(c)]["lng"]) for c in chosen_ids if str(c) in lookup],
        time_multiplier=multiplier,
    )


def _planning_window(hour: int) -> tuple[date, datetime, datetime]:
    """Today's date in Asia/Kolkata and the timezone-aware [hour:00, hour+1:00) window on it."""
    target_date = datetime.now(PLANNING_TZ).date()
    window_start = datetime.combine(target_date, time(hour), tzinfo=PLANNING_TZ)
    return target_date, window_start, window_start + timedelta(hours=1)


def _new_run(hospital, target_date: date, hour: int, min_spacing_km: float, num_ambulances: int, **fields):
    return models.OptimizationRun(
        hospital_id=hospital.hospital_id,
        target_date=target_date,
        target_hour=hour,
        min_spacing_km=min_spacing_km,
        operating_radius_km=hospital.operating_radius_km,
        num_ambulances=num_ambulances,
        model_version=MODEL_VERSION,
        **fields,
    )


def _record_failed_run(db: Session, error: str, **run_fields) -> None:
    """Best effort: a failure to record the failure must not hide the original error."""
    try:
        db.add(_new_run(**run_fields, status=models.RunStatus.failed, error_message=error))
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        logger.exception("Could not record failed optimization run")


def _save_run_history(db: Session, result: dict, fleet, window_start: datetime, window_end: datetime, **run_fields) -> int:
    """Save the run, its chosen positions and the hourly assignments in one transaction."""
    run = _new_run(**run_fields, status=models.RunStatus.succeeded, total_weighted_score=result["total_weighted_score"])
    db.add(run)
    db.flush()  # assigns run.run_id

    by_score = sorted(result["details"], key=lambda d: d["weighted_score"], reverse=True)
    db.add_all(
        models.RunPosition(run_id=run.run_id, candidate_id=d["candidate_id"], weighted_score=d["weighted_score"], rank=rank)
        for rank, d in enumerate(by_score, start=1)
    )

    # Free this hour for the new plan: the database's EXCLUDE constraint rejects
    # overlapping non-cancelled assignments for the same ambulance.
    ambulance_ids = {a.call_sign: a.ambulance_id for a in fleet}
    db.execute(
        update(models.AmbulanceAssignment)
        .where(
            models.AmbulanceAssignment.ambulance_id.in_(ambulance_ids.values()),
            models.AmbulanceAssignment.ambulance_id.in_(
                select(models.Ambulance.ambulance_id).where(models.Ambulance.hospital_id == run.hospital_id)
            ),
            models.AmbulanceAssignment.status != models.AssignmentStatus.cancelled,
            models.AmbulanceAssignment.valid_from < window_end,
            models.AmbulanceAssignment.valid_to > window_start,
        )
        .values(status=models.AssignmentStatus.cancelled)
        .execution_options(synchronize_session=False)
    )

    db.add_all(
        models.AmbulanceAssignment(
            ambulance_id=ambulance_ids[a["ambulance_id"]],
            candidate_id=a["candidate_id"],
            run_id=run.run_id,
            valid_from=window_start,
            valid_to=window_end,
            status=models.AssignmentStatus.planned,
        )
        for a in result["assignments"]
    )
    db.commit()
    return run.run_id


class Ambulance(BaseModel):
    id: str = Field(min_length=1)
    type: str

    @field_validator("id")
    @classmethod
    def _stripped_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("id must not be blank")
        return value.strip()

    @field_validator("type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in CAPABILITY:
            raise ValueError(f"type must be one of: {', '.join(CAPABILITY)}")
        return normalized


class AmbulanceStatusUpdate(BaseModel):
    status: models.AmbulanceStatus
    note: Optional[str] = None


class AssignmentStatusUpdate(BaseModel):
    # "cancelled" is reserved for the optimizer replacing a plan.
    status: Literal["planned", "en_route", "in_position"]


class SimulationRequest(BaseModel):
    hour: int = Field(ge=0, le=23)
    num_ambulances: Optional[int] = Field(default=None, ge=1, le=20)
    operating_radius_km: Optional[float] = Field(default=None, ge=1, le=50)
    min_spacing_km: Optional[float] = Field(default=None, ge=0)
    max_response_minutes: Optional[float] = Field(default=None, ge=5, le=60)


class HospitalUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1)
    operating_radius_km: Optional[float] = Field(default=None, gt=0, le=100)


class HospitalRegistration(BaseModel):
    hospital_name: str
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    operating_radius_km: float = Field(gt=0)
    ambulances: List[Ambulance] = Field(min_length=1)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/hospital/register")
def register_hospital(request: Request, registration: HospitalRegistration, db: Session = Depends(get_db)):
    ip = get_client_ip(request)
    try:
        _maybe_purge(db)
        _enforce_limit(db, ip, REGISTER, REGISTER_MAX, REGISTER_WINDOW)
        _record(db, ip, REGISTER)  # every attempt counts, including ones that fail below
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    code = _new_credential(lambda: generate_hospital_code(db, registration.hospital_name))
    admin_key, admin_key_hash = _new_credential(lambda: generate_admin_key(db))
    hospital = models.Hospital(
        name=registration.hospital_name,
        lat=registration.lat,
        lng=registration.lng,
        operating_radius_km=registration.operating_radius_km,
        code=code,
        admin_key_hash=admin_key_hash,
    )
    # current_status defaults to available in the model.
    hospital.ambulances = [
        models.Ambulance(call_sign=a.id, type=models.AmbulanceType(a.type))
        for a in registration.ambulances
    ]
    try:
        db.add(hospital)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if getattr(getattr(exc.orig, "diag", None), "constraint_name", None) == "hospitals_code_key":
            # Another registration took the same code between our check and the insert.
            raise HTTPException(status_code=409, detail="Hospital code clash; please try again")
        # ambulances has UNIQUE (hospital_id, call_sign).
        raise HTTPException(status_code=409, detail="Each ambulance ID must be unique within the hospital")
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {
        "status": "registered",
        "hospital_id": hospital.hospital_id,
        "code": hospital.code,
        # The only time this key is shown: only its hash is stored. Lost keys need rotating.
        "admin_key": admin_key,
        "fleet_size": len(registration.ambulances),
    }


@app.get("/hospital")
def active_hospital(hospital=Depends(get_hospital), db: Session = Depends(get_db)):
    """The hospital and its fleet. Driver level: never includes admin_key."""
    try:
        fleet = _hospital_fleet(db, hospital.hospital_id)
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)
    return _hospital_payload(hospital, fleet)


@app.patch("/hospital")
def update_hospital(changes: HospitalUpdate, hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """Rename the hospital and/or change its radius. Its location can't change here."""
    try:
        if changes.name is not None:
            hospital.name = changes.name.strip() or hospital.name
        if changes.operating_radius_km is not None:
            hospital.operating_radius_km = changes.operating_radius_km
        db.commit()
        fleet = _hospital_fleet(db, hospital.hospital_id)
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return _hospital_payload(hospital, fleet)


@app.post("/hospital/ambulances", status_code=201)
def add_ambulance(new: Ambulance, hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """Add an ambulance (status available) to the hospital."""
    try:
        ambulance = models.Ambulance(
            hospital_id=hospital.hospital_id, call_sign=new.id, type=models.AmbulanceType(new.type)
        )
        db.add(ambulance)
        db.commit()
    except IntegrityError:
        db.rollback()
        # ambulances has UNIQUE (hospital_id, call_sign).
        raise HTTPException(status_code=409, detail=f"Ambulance {new.id!r} already exists in this hospital")
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {
        "call_sign": ambulance.call_sign,
        "type": ambulance.type.value,
        "status": ambulance.current_status.value,
        "status_updated_at": ambulance.status_updated_at,
    }


@app.get("/hospital/keys")
def hospital_keys(hospital=Depends(require_admin)):
    """The driver code, for re-displaying to admins. The admin key can't be shown: only its hash is kept."""
    return {"code": hospital.code}


@app.post("/hospital/rotate-code")
def rotate_code(hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """Issue a new driver code. The old one stops working immediately (drivers must re-enter it)."""
    hospital.code = _new_credential(lambda: generate_hospital_code(db, hospital.name))
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {"code": hospital.code}


@app.post("/hospital/rotate-admin-key")
def rotate_admin_key(hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """Issue a new admin key. The old one stops working immediately."""
    admin_key, hospital.admin_key_hash = _new_credential(lambda: generate_admin_key(db))
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    # Shown once; only the hash is stored.
    return {"admin_key": admin_key}


@app.get("/fleet")
def fleet_status(hospital=Depends(get_hospital), db: Session = Depends(get_db)):
    """The hospital's ambulances with live status and current assignment."""
    try:
        fleet = _hospital_fleet(db, hospital.hospital_id)
        current = _current_assignments(db, hospital, [a.ambulance_id for a in fleet])
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)

    return [
        {
            "call_sign": a.call_sign,
            "type": a.type.value,
            "status": a.current_status.value,
            "status_updated_at": a.status_updated_at,
            "current_assignment": _assignment_summary(current[a.ambulance_id]) if a.ambulance_id in current else None,
        }
        for a in fleet
    ]


@app.patch("/ambulances/{call_sign}/status")
def update_ambulance_status(
    call_sign: str,
    update_: AmbulanceStatusUpdate,
    hospital=Depends(get_hospital),
    db: Session = Depends(get_db),
):
    try:
        ambulance = _require_hospital_ambulance(db, hospital, call_sign)
        # Same status again (e.g. a double tap): no change and no duplicate event.
        if ambulance.current_status != update_.status:
            now = datetime.now(PLANNING_TZ)
            ambulance.current_status = update_.status
            ambulance.status_updated_at = now
            db.add(
                models.AmbulanceStatusEvent(
                    ambulance_id=ambulance.ambulance_id, status=update_.status, recorded_at=now, note=update_.note
                )
            )
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {
        "call_sign": ambulance.call_sign,
        "type": ambulance.type.value,
        "status": ambulance.current_status.value,
        "status_updated_at": ambulance.status_updated_at,
    }


@app.patch("/ambulances/{call_sign}/assignment-status")
def update_assignment_status(
    call_sign: str,
    update_: AssignmentStatusUpdate,
    hospital=Depends(get_hospital),
    db: Session = Depends(get_db),
):
    try:
        ambulance = _require_hospital_ambulance(db, hospital, call_sign)
        assignment = _current_assignments(db, hospital, [ambulance.ambulance_id]).get(ambulance.ambulance_id)
        if assignment is None:
            raise HTTPException(status_code=404, detail=f"Ambulance {call_sign!r} has no current assignment")
        assignment.status = models.AssignmentStatus(update_.status)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise _db_unavailable(exc)
    return {
        "call_sign": ambulance.call_sign,
        "assignment_id": assignment.assignment_id,
        "run_id": assignment.run_id,
        **_assignment_summary(assignment),
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
    hour: int = Query(..., ge=0, le=23, description="Hour of day (0-23)"),
    min_spacing_km: float = Query(2.0, ge=0, description="Minimum distance between ambulances"),
    max_response_minutes: float = Query(
        20.0, ge=5, le=60, description="Every ward some candidate can reach this fast must be covered"
    ),
    hospital=Depends(require_admin),
    db: Session = Depends(get_db),
):
    if "error" in data:
        raise HTTPException(status_code=503, detail=data["error"])

    try:
        fleet = _hospital_fleet(db, hospital.hospital_id)
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)

    # Out-of-service (unavailable) ambulances are left out of placement and assignment.
    # Same shape the old in-memory registration had: {"id": ..., "type": "ALS" | "BLS"}.
    ambulances = [{"id": a.call_sign, "type": a.type.value} for a in _in_service(fleet)]

    target_date, window_start, window_end = _planning_window(hour)
    run_fields = dict(
        hospital=hospital,
        target_date=target_date,
        hour=hour,
        min_spacing_km=min_spacing_km,
        num_ambulances=len(ambulances),
    )

    try:
        result = _compute_plan(
            hospital_name=hospital.name,
            hospital_lat=hospital.lat,
            hospital_lng=hospital.lng,
            operating_radius_km=hospital.operating_radius_km,
            ambulances=ambulances,
            hour=hour,
            min_spacing_km=min_spacing_km,
            max_response_minutes=max_response_minutes,
        )
    except PlanError as exc:
        _record_failed_run(db, exc.detail, **run_fields)
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)

    # History is a side effect: if saving fails, still return the optimization.
    try:
        # The whole fleet, so an out-of-service ambulance's plan for this hour is cancelled too.
        result["run_id"] = _save_run_history(db, result, fleet, window_start, window_end, **run_fields)
    except Exception:
        db.rollback()
        logger.exception("Could not save optimization run history")
        result["run_id"] = None
    return result


@app.post("/simulate")
def simulate(request: SimulationRequest, hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """What-if planning for the hospital. Reads only: nothing is saved or changed."""
    if "error" in data:
        raise HTTPException(status_code=503, detail=data["error"])

    try:
        fleet = _hospital_fleet(db, hospital.hospital_id)
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)

    in_service = [{"id": a.call_sign, "type": a.type.value} for a in _in_service(fleet)]
    if not in_service:
        raise HTTPException(status_code=400, detail="No ambulances in service")

    # Fewer than the real fleet: the first N (by ambulance_id). More: pad with BLS units.
    num_ambulances = request.num_ambulances or len(in_service)
    ambulances = in_service[:num_ambulances] + [
        {"id": f"SIM-{i:02d}", "type": "BLS"} for i in range(1, num_ambulances - len(in_service) + 1)
    ]
    parameters = {
        "hour": request.hour,
        "num_ambulances": num_ambulances,
        "operating_radius_km": request.operating_radius_km or hospital.operating_radius_km,
        "min_spacing_km": 2.0 if request.min_spacing_km is None else request.min_spacing_km,
        "max_response_minutes": request.max_response_minutes or 20.0,
        "synthetic_ambulances": max(0, num_ambulances - len(in_service)),
    }

    try:
        result = _compute_plan(
            hospital_name=hospital.name,
            hospital_lat=hospital.lat,
            hospital_lng=hospital.lng,
            operating_radius_km=parameters["operating_radius_km"],
            ambulances=ambulances,
            hour=request.hour,
            min_spacing_km=parameters["min_spacing_km"],
            max_response_minutes=parameters["max_response_minutes"],
        )
    except PlanError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    return {**result, "simulated": True, "parameters": parameters}


@app.get("/runs")
def list_runs(
    limit: int = Query(10, ge=1, le=50),
    hospital=Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        runs = db.scalars(
            select(models.OptimizationRun)
            .where(models.OptimizationRun.hospital_id == hospital.hospital_id)
            .order_by(models.OptimizationRun.created_at.desc(), models.OptimizationRun.run_id.desc())
            .limit(limit)
        ).all()
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)
    return [_run_summary(r) for r in runs]


@app.get("/runs/{run_id}")
def get_run(run_id: int, hospital=Depends(require_admin), db: Session = Depends(get_db)):
    """One of the hospital's runs, with its positions and assignments in the /optimize shape."""
    try:
        run = db.get(models.OptimizationRun, run_id)
        if run is None or run.hospital_id != hospital.hospital_id:
            raise HTTPException(status_code=404, detail=f"No run {run_id} for the active hospital")
        positions = db.scalars(
            select(models.RunPosition).where(models.RunPosition.run_id == run_id).order_by(models.RunPosition.rank)
        ).all()
        assignments = db.execute(
            select(models.AmbulanceAssignment, models.Ambulance)
            .join(models.Ambulance, models.Ambulance.ambulance_id == models.AmbulanceAssignment.ambulance_id)
            .where(models.AmbulanceAssignment.run_id == run_id, models.Ambulance.hospital_id == hospital.hospital_id)
            .order_by(models.Ambulance.ambulance_id)
        ).all()
    except SQLAlchemyError as exc:
        raise _db_unavailable(exc)

    lookup = data.get("candidate_lookup", {})

    def place(candidate_id: str) -> dict:
        info = lookup.get(str(candidate_id), {})
        return {key: info.get(key) for key in ("name", "ward_code", "lat", "lng")}

    score_by_candidate = {p.candidate_id: p.weighted_score for p in positions}
    kpis = (
        _plan_kpis(
            run.target_hour, hospital.lat, hospital.lng, [p.candidate_id for p in positions], [amb.type.value for _, amb in assignments]
        )
        if "error" not in data
        else None
    )
    return {
        **_run_summary(run),
        "kpis": kpis,
        "min_spacing_km": run.min_spacing_km,
        "operating_radius_km": run.operating_radius_km,
        "model_version": run.model_version,
        "details": [
            {"candidate_id": p.candidate_id, "weighted_score": p.weighted_score, "rank": p.rank, **place(p.candidate_id)}
            for p in positions
        ],
        "assignments": [
            {
                # ambulance_id holds the call sign, as in the /optimize response.
                "ambulance_id": amb.call_sign,
                "call_sign": amb.call_sign,
                "type": amb.type.value,
                "candidate_id": a.candidate_id,
                "weighted_score": score_by_candidate.get(a.candidate_id),
                **place(a.candidate_id),
                "status": a.status.value,
                "valid_from": a.valid_from,
                "valid_to": a.valid_to,
            }
            for a, amb in assignments
        ],
    }
