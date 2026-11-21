-- Rolls back 2026_11_17_onboarding_up.sql. Deploy a backend without these columns first, or its queries fail.
-- Hospitals will be shown the first-run tour again if the columns are re-added later.
BEGIN;
ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_onboarding_status_check;
ALTER TABLE hospitals DROP COLUMN IF EXISTS onboarding_version;
ALTER TABLE hospitals DROP COLUMN IF EXISTS onboarding_completed_at;
ALTER TABLE hospitals DROP COLUMN IF EXISTS onboarding_status;
COMMIT;
