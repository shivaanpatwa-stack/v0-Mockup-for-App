-- First-run product tour: remembers per hospital whether the dashboard tour was completed or skipped.
-- Additive and nullable, so the previous backend keeps working and every existing hospital simply has no
-- value yet (and is shown the tour once). Apply this BEFORE deploying the backend that reads these columns.
-- Roll back with 2026_11_17_onboarding_down.sql.
BEGIN;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS onboarding_status text NULL;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz NULL;
ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS onboarding_version integer NULL;
ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_onboarding_status_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_onboarding_status_check
  CHECK (onboarding_status IS NULL OR onboarding_status IN ('completed', 'skipped'));
COMMIT;
