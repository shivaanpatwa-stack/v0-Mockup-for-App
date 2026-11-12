"""Apply or roll back the scenarios migration on the database in backend/.env.

Usage (from backend/):  ../venv/bin/python scripts/run_migration.py up|down [name]
name defaults to 2026_11_07_scenarios (e.g. 2026_11_12_code_hash).
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

NAME = sys.argv[2] if len(sys.argv) > 2 else "2026_11_07_scenarios"
sql = (Path(__file__).resolve().parent.parent / "migrations" / f"{NAME}_{DIRECTION}.sql").read_text()
# Drop comment lines BEFORE splitting, so a ";" inside a comment can't split a statement.
sql = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
chunks = [s.strip() for s in sql.split(";")]
statements = [s for s in chunks if s and s.upper() not in ("BEGIN", "COMMIT")]
with engine.begin() as conn:  # one transaction: all or nothing
    for s in statements:
        if s:
            conn.execute(text(s))
            print("ok:", s.splitlines()[0][:90])
print(f"migration {DIRECTION} done")
