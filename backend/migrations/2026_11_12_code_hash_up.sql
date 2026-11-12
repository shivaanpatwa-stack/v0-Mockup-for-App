-- SEC-06: driver codes looked up by HMAC hash and stored encrypted. Additive, so old code keeps working
-- (it still writes and reads hospitals.code). Roll back with 2026_11_12_code_hash_down.sql.
BEGIN;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS code_hash text NULL;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS code_encrypted text NULL;
CREATE UNIQUE INDEX IF NOT EXISTS hospitals_code_hash_key ON hospitals (code_hash);
ALTER TABLE hospitals ALTER COLUMN code DROP NOT NULL;
COMMIT;
