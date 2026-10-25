"""Give one hospital a new admin key (for a lost key) and print it once.

Run from the backend folder (KEY_PEPPER must be set, e.g. in backend/.env):
    ../venv/bin/python scripts/reset_admin_key.py PAREL-7K3QMZ

The old admin key stops working. The driver code is unchanged.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, for models, database, credentials

from sqlalchemy import select  # noqa: E402

import models  # noqa: E402
from credentials import generate_admin_key, normalise_code, require_pepper  # noqa: E402
from database import SessionLocal  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: reset_admin_key.py <hospital code>")
    require_pepper()
    code = normalise_code(sys.argv[1])
    with SessionLocal() as db:
        hospital = db.scalars(select(models.Hospital).where(models.Hospital.code == code)).first()
        if hospital is None:
            sys.exit(f"No hospital with code {code}.")
        key, hospital.admin_key_hash = generate_admin_key(db)
        db.commit()
        print(f"Hospital {hospital.hospital_id} ({hospital.name}), code {hospital.code}")
    print(f"New admin key: {key}")
    print("This key is not shown again.")


if __name__ == "__main__":
    main()
