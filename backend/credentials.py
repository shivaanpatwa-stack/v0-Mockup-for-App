"""Hospital credentials: driver codes and admin keys.

Shared by registration and rotation in main.py and by the scripts/ tools, so every code and key
is made and checked the same way.

- Driver code (Hospital.code), e.g. "PAREL-7K3QMZ": stored in PLAINTEXT on purpose. Admins must be
  able to see it again to hand it to drivers, and it only grants driver-level access.
- Admin key: secrets.token_urlsafe(24). Only HMAC-SHA256(KEY_PEPPER, key) is stored
  (Hospital.admin_key_hash); the key itself is shown once (register / rotate) and never stored or
  logged. Without the pepper, a leaked database doesn't reveal or let anyone test admin keys.
"""

import hashlib
import hmac
import os
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
PEPPER_ENV = "KEY_PEPPER"


class CredentialGenerationError(RuntimeError):
    """No unused value was found within GENERATION_ATTEMPTS tries."""


def require_pepper() -> bytes:
    """KEY_PEPPER from the environment (backend/.env). Raises if it isn't set."""
    pepper = os.getenv(PEPPER_ENV, "")
    if not pepper:
        raise RuntimeError(f"{PEPPER_ENV} is not set. Add a long random value to backend/.env.")
    return pepper.encode()


def hash_admin_key(key: str) -> str:
    return hmac.new(require_pepper(), key.encode(), hashlib.sha256).hexdigest()


def admin_key_matches(key: str, stored_hash: str | None) -> bool:
    """Constant-time check of a presented key against the stored hash."""
    if not key or not stored_hash:
        return False
    return hmac.compare_digest(hash_admin_key(key), stored_hash)


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
        code = f"{prefix}-{''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_SUFFIX_LENGTH))}"
        if _is_free(db, models.Hospital.code, code):
            return code
    raise CredentialGenerationError("Could not generate a unique hospital code")


def generate_admin_key(db: Session) -> tuple[str, str]:
    """A new admin key and its hash: (key to show once, hash to store)."""
    for _ in range(GENERATION_ATTEMPTS):
        key = secrets.token_urlsafe(ADMIN_KEY_BYTES)
        key_hash = hash_admin_key(key)
        if _is_free(db, models.Hospital.admin_key_hash, key_hash):
            return key, key_hash
    raise CredentialGenerationError("Could not generate a unique admin key")
