"""Hospital credentials: driver codes and admin keys.

Shared by registration and key rotation in main.py and by scripts/backfill_keys.py, so every
code and key is made the same way. Uses the secrets module throughout.
"""

import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

import models

# No 0/O, 1/I/L: easy to read out and type on a phone.
CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_SUFFIX_LENGTH = 6
CODE_PREFIX_MAX = 5
CODE_FALLBACK_PREFIX = "HOSP"
ADMIN_KEY_BYTES = 24
GENERATION_ATTEMPTS = 10


class CredentialGenerationError(RuntimeError):
    """No unused value was found within GENERATION_ATTEMPTS tries."""


def normalise_code(code: str | None) -> str:
    return (code or "").strip().upper()


def code_prefix(name: str) -> str:
    """Up to 5 letters A-Z from the hospital name, or HOSP when it has none."""
    return "".join(ch for ch in name.upper() if "A" <= ch <= "Z")[:CODE_PREFIX_MAX] or CODE_FALLBACK_PREFIX


def _is_free(db: Session, column, value: str) -> bool:
    return db.scalar(select(func.count()).select_from(models.Hospital).where(column == value)) == 0


def generate_hospital_code(db: Session, name: str) -> str:
    """PREFIX-XXXXXX, e.g. PAREL-7K3QMZ, not used by any hospital (pending changes included)."""
    prefix = code_prefix(name)
    for _ in range(GENERATION_ATTEMPTS):
        suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_SUFFIX_LENGTH))
        code = f"{prefix}-{suffix}"
        if _is_free(db, models.Hospital.code, code):
            return code
    raise CredentialGenerationError("Could not generate a unique hospital code")


def generate_admin_key(db: Session) -> str:
    """A URL-safe random key (about 32 characters) not used by any hospital."""
    for _ in range(GENERATION_ATTEMPTS):
        key = secrets.token_urlsafe(ADMIN_KEY_BYTES)
        if _is_free(db, models.Hospital.admin_key, key):
            return key
    raise CredentialGenerationError("Could not generate a unique admin key")
