"""Give hospitals a driver code and admin key, storing only the key's hash, and print them once.

Run from the backend folder (KEY_PEPPER must be set, e.g. in backend/.env):
    ../venv/bin/python scripts/backfill_keys.py           # hospitals without an admin key hash
    ../venv/bin/python scripts/backfill_keys.py --force   # every hospital

Each affected hospital gets a NEW code and admin key; their old ones stop working. The admin keys
are printed only here and can't be recovered later, so copy them somewhere safe.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, for models, database, credentials

from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import models  # noqa: E402
from credentials import generate_admin_key, generate_hospital_code, require_pepper  # noqa: E402
from database import SessionLocal  # noqa: E402


def backfill(db: Session, force: bool = False) -> list[tuple[int, str, str, str]]:
    """Assign fresh credentials (not committed). Returns (hospital_id, name, code, admin_key) rows."""
    query = select(models.Hospital).order_by(models.Hospital.hospital_id)
    if not force:
        query = query.where(models.Hospital.admin_key_hash.is_(None))
    rows = []
    for hospital in db.scalars(query).all():
        hospital.code = generate_hospital_code(db, hospital.name)
        key, hospital.admin_key_hash = generate_admin_key(db)
        # Flush so the next hospital's uniqueness checks see this one's new values.
        db.flush()
        rows.append((hospital.hospital_id, hospital.name, hospital.code, key))
    return rows


def print_table(rows: list[tuple]) -> None:
    header = ("hospital_id", "name", "code", "admin_key")
    widths = [max(len(str(value)) for value in column) for column in zip(header, *rows)]
    line = "  ".join("{:<%d}" % w for w in widths)
    print(line.format(*header))
    print(line.format(*("-" * w for w in widths)))
    for row in rows:
        print(line.format(*row))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--force", action="store_true", help="regenerate credentials for every hospital")
    args = parser.parse_args()
    require_pepper()
    with SessionLocal() as db:
        rows = backfill(db, force=args.force)
        db.commit()
    if not rows:
        print("Every hospital already has credentials; nothing to do (use --force to regenerate all).")
        return
    print_table(rows)
    print(f"\n{len(rows)} hospital(s) updated. These admin keys are not shown again.")


if __name__ == "__main__":
    main()
