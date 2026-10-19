"""Give every hospital a new driver code and admin key, then print them once.

Run from the backend folder:
    ../venv/bin/python scripts/backfill_keys.py

Every old code and admin key stops working: drivers and dashboards must be given the new ones.
The values are printed only here, so copy them somewhere safe before closing the terminal.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, for models, database, credentials

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import models  # noqa: E402
from credentials import generate_admin_key, generate_hospital_code  # noqa: E402
from database import SessionLocal  # noqa: E402


def backfill(db: Session) -> list[tuple[int, str, str, str]]:
    """Assign fresh credentials to every hospital (not committed). Returns (id, name, code, admin_key) rows."""
    rows = []
    for hospital in db.scalars(select(models.Hospital).order_by(models.Hospital.hospital_id)):
        hospital.code = generate_hospital_code(db, hospital.name)
        hospital.admin_key = generate_admin_key(db)
        # Flush so the next hospital's uniqueness checks see this one's new values.
        db.flush()
        rows.append((hospital.hospital_id, hospital.name, hospital.code, hospital.admin_key))
    return rows


def print_table(rows: list[tuple[int, str, str, str]]) -> None:
    header = ("hospital_id", "name", "code", "admin_key")
    widths = [max(len(str(value)) for value in column) for column in zip(header, *rows)]
    line = "  ".join("{:<%d}" % w for w in widths)
    print(line.format(*header))
    print(line.format(*("-" * w for w in widths)))
    for row in rows:
        print(line.format(*row))


def main() -> None:
    with SessionLocal() as db:
        rows = backfill(db)
        db.commit()
    if not rows:
        print("No hospitals found; nothing to do.")
        return
    print_table(rows)
    print(f"\n{len(rows)} hospital(s) updated. These values are not shown again.")


if __name__ == "__main__":
    main()
