"""SQLAlchemy ORM models for the tables created in Supabase.

The schema is owned by the SQL in Supabase, not by these models: never call
Base.metadata.create_all() against it. The EXCLUDE constraint that stops one
ambulance having overlapping assignments lives only in the database.

candidate_id columns are plain strings with no foreign key, because candidate
positions still come from candidate_positions_final.geojson, not a table.
"""

import enum
from datetime import date, datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AmbulanceType(str, enum.Enum):
    ALS = "ALS"
    BLS = "BLS"


class AmbulanceStatus(str, enum.Enum):
    available = "available"
    responding = "responding"
    at_hospital = "at_hospital"
    unavailable = "unavailable"


class RunStatus(str, enum.Enum):
    succeeded = "succeeded"
    failed = "failed"


class AssignmentStatus(str, enum.Enum):
    planned = "planned"
    en_route = "en_route"
    in_position = "in_position"
    cancelled = "cancelled"


def _enum(enum_cls: type[enum.Enum]) -> Enum:
    # Store each member's value ("at_hospital", "ALS"). native_enum=False sends plain
    # strings, which PostgreSQL accepts for both enum-typed and text/CHECK columns,
    # so the model doesn't depend on the database's enum type names.
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=False,
        values_callable=lambda members: [m.value for m in members],
        validate_strings=True,
    )


class Hospital(Base):
    __tablename__ = "hospitals"

    hospital_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    operating_radius_km: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    ambulances: Mapped[List["Ambulance"]] = relationship(back_populates="hospital")
    drivers: Mapped[List["Driver"]] = relationship(back_populates="hospital")
    optimization_runs: Mapped[List["OptimizationRun"]] = relationship(back_populates="hospital")


class Ambulance(Base):
    __tablename__ = "ambulances"

    ambulance_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.hospital_id"), nullable=False)
    call_sign: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[AmbulanceType] = mapped_column(_enum(AmbulanceType), nullable=False)
    current_status: Mapped[AmbulanceStatus] = mapped_column(
        _enum(AmbulanceStatus), nullable=False, default=AmbulanceStatus.available
    )
    status_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)

    hospital: Mapped["Hospital"] = relationship(back_populates="ambulances")
    status_events: Mapped[List["AmbulanceStatusEvent"]] = relationship(back_populates="ambulance")
    shifts: Mapped[List["DriverShift"]] = relationship(back_populates="ambulance")
    assignments: Mapped[List["AmbulanceAssignment"]] = relationship(back_populates="ambulance")


class AmbulanceStatusEvent(Base):
    __tablename__ = "ambulance_status_events"

    event_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ambulance_id: Mapped[int] = mapped_column(ForeignKey("ambulances.ambulance_id"), nullable=False)
    status: Mapped[AmbulanceStatus] = mapped_column(_enum(AmbulanceStatus), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    ambulance: Mapped["Ambulance"] = relationship(back_populates="status_events")


class Driver(Base):
    __tablename__ = "drivers"

    driver_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.hospital_id"), nullable=False)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    licence_no: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    hospital: Mapped["Hospital"] = relationship(back_populates="drivers")
    shifts: Mapped[List["DriverShift"]] = relationship(back_populates="driver")


class DriverShift(Base):
    __tablename__ = "driver_shifts"

    shift_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.driver_id"), nullable=False)
    ambulance_id: Mapped[int] = mapped_column(ForeignKey("ambulances.ambulance_id"), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    driver: Mapped["Driver"] = relationship(back_populates="shifts")
    ambulance: Mapped["Ambulance"] = relationship(back_populates="shifts")


class OptimizationRun(Base):
    __tablename__ = "optimization_runs"

    run_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    hospital_id: Mapped[int] = mapped_column(ForeignKey("hospitals.hospital_id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    target_hour: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    min_spacing_km: Mapped[float] = mapped_column(Float, nullable=False)
    operating_radius_km: Mapped[float] = mapped_column(Float, nullable=False)
    num_ambulances: Mapped[int] = mapped_column(Integer, nullable=False)
    model_version: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[RunStatus] = mapped_column(_enum(RunStatus), nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Empty for failed runs.
    total_weighted_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    hospital: Mapped["Hospital"] = relationship(back_populates="optimization_runs")
    positions: Mapped[List["RunPosition"]] = relationship(back_populates="run")
    assignments: Mapped[List["AmbulanceAssignment"]] = relationship(back_populates="run")


class RunPosition(Base):
    __tablename__ = "run_positions"

    run_id: Mapped[int] = mapped_column(ForeignKey("optimization_runs.run_id"), primary_key=True)
    candidate_id: Mapped[str] = mapped_column(String, primary_key=True)
    weighted_score: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int] = mapped_column(SmallInteger, nullable=False)

    run: Mapped["OptimizationRun"] = relationship(back_populates="positions")


class AmbulanceAssignment(Base):
    __tablename__ = "ambulance_assignments"

    assignment_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ambulance_id: Mapped[int] = mapped_column(ForeignKey("ambulances.ambulance_id"), nullable=False)
    candidate_id: Mapped[str] = mapped_column(String, nullable=False)
    # Empty for a manual move that didn't come from an optimizer run.
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("optimization_runs.run_id"), nullable=True)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[AssignmentStatus] = mapped_column(
        _enum(AssignmentStatus), nullable=False, default=AssignmentStatus.planned
    )

    ambulance: Mapped["Ambulance"] = relationship(back_populates="assignments")
    run: Mapped[Optional["OptimizationRun"]] = relationship(back_populates="assignments")
