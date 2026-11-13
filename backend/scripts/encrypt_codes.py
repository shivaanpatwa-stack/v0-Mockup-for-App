"""SEC-06 backfill for existing hospitals. Prints counts only, never codes.

  ../venv/bin/python scripts/encrypt_codes.py            # add code_hash to every hospital (safe any time)
  ../venv/bin/python scripts/encrypt_codes.py --encrypt  # also encrypt and clear plaintext codes
  ../venv/bin/python scripts/encrypt_codes.py --decrypt  # undo: plaintext back, encrypted copy cleared

Run --encrypt only AFTER the backend with SEC-06 and CODE_ENCRYPTION_KEY is live everywhere,
otherwise older backends can no longer find hospitals by code.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from sqlalchemy import select  # noqa: E402

import models  # noqa: E402
from credentials import _fernet, hash_code, read_code, store_code  # noqa: E402
from database import SessionLocal  # noqa: E402

mode = sys.argv[1] if len(sys.argv) > 1 else ""
with SessionLocal() as db:
    rows = db.scalars(select(models.Hospital)).all()
    changed = 0
    for h in rows:
        code = read_code(h)
        if not code:
            continue
        if mode == "--decrypt":
            h.code, h.code_encrypted, h.code_hash = code, None, hash_code(code)
        elif mode == "--encrypt":
            if _fernet() is None:
                sys.exit("CODE_ENCRYPTION_KEY is not set")
            store_code(h, code)
        else:
            h.code_hash = hash_code(code)
        changed += 1
    db.commit()
print(f"{mode or 'hash'}: updated {changed} of {len(rows)} hospitals")
