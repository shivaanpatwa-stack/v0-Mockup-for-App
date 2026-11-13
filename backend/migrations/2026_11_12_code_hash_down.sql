-- Rolls back 2026_11_12_code_hash_up.sql. Run scripts/encrypt_codes.py --decrypt FIRST so every
-- hospital has its plaintext code back, or SET NOT NULL fails.
BEGIN;
ALTER TABLE hospitals ALTER COLUMN code SET NOT NULL;
DROP INDEX IF EXISTS hospitals_code_hash_key;
ALTER TABLE hospitals DROP COLUMN IF EXISTS code_encrypted;
ALTER TABLE hospitals DROP COLUMN IF EXISTS code_hash;
COMMIT;
