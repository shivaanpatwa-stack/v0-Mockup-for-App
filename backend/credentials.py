"""Hospital credentials: driver codes and admin keys.

Shared by registration and rotation in main.py and by the scripts/ tools, so every code and key
is made and checked the same way.

- Driver code, e.g. "PAREL-7K3QMZ" (SEC-06): looked up by Hospital.code_hash = HMAC(KEY_PEPPER, code).
  With CODE_ENCRYPTION_KEY set, it is kept only Fernet-encrypted (Hospital.code_encrypted) so admins
  can see it again, and Hospital.code is left empty. Without that key it is also kept in Hospital.code
  (the old behaviour), so a deploy before the key exists keeps working.
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


CODE_KEY_ENV = "CODE_ENCRYPTION_KEY"


def hash_code(code: str) -> str:
    """Lookup hash of a driver code (SEC-06)."""
    return hmac.new(require_pepper(), normalise_code(code).encode(), hashlib.sha256).hexdigest()


def _fernet():
    key = os.environ.get(CODE_KEY_ENV, "").strip()
    if not key:
        return None
    try:
        from cryptography.fernet import Fernet

        # Add missing base64 padding if needed
        if len(key) % 4 != 0:
            key += "=" * (4 - (len(key) % 4))
        return Fernet(key.encode())
    except Exception:
        return None


def store_code(hospital, code: str) -> None:
    """Sets a hospital's driver code: hash for lookup, encrypted copy if a key is set, else plaintext."""
    hospital.code_hash = hash_code(code)
    f = _fernet()
    if f:
        hospital.code_encrypted = f.encrypt(code.encode()).decode()
        hospital.code = None
    else:
        hospital.code = code


def read_code(hospital) -> str | None:
    """The driver code to show an admin: decrypted if encrypted, else the plaintext column."""
    if hospital.code_encrypted:
        f = _fernet()
        if f is None:
            raise RuntimeError(f"{CODE_KEY_ENV} is required to read encrypted hospital codes")
        return f.decrypt(hospital.code_encrypted.encode()).decode()
    return hospital.code


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
        if _is_free(db, models.Hospital.code, code) and _is_free(db, models.Hospital.code_hash, hash_code(code)):
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
