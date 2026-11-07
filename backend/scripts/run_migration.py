"""Apply or roll back the scenarios migration on the database in backend/.env.

Usage (from backend/):  ../venv/bin/python scripts/run_migration.py up|down
Prints which statements ran; never prints the connection string.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import text  # noqa: E402

from database import engine  # noqa: E402

DIRECTION = sys.argv[1] if len(sys.argv) > 1 else ""
if DIRECTION not in ("up", "down"):
    sys.exit("usage: run_migration.py up|down")

sql = (Path(__file__).resolve().parent.parent / "migrations" / f"2026_11_07_scenarios_{DIRECTION}.sql").read_text()
statements = [s.strip() for s in sql.split(";") if s.strip() and s.strip().upper() not in ("BEGIN", "COMMIT")]
statements = ["\n".join(l for l in s.splitlines() if not l.strip().startswith("--")).strip() for s in statements]
with engine.begin() as conn:  # one transaction: all or nothing
    for s in statements:
        if s:
            conn.execute(text(s))
            print("ok:", s.splitlines()[0][:90])
print(f"migration {DIRECTION} done")
