-- Rolls back 2026_11_07_scenarios_up.sql. Deletes every saved scenario and the two run columns' values.
BEGIN;
DROP TABLE IF EXISTS saved_scenarios;
ALTER TABLE optimization_runs DROP COLUMN IF EXISTS scenario_parameters;
ALTER TABLE optimization_runs DROP COLUMN IF EXISTS run_trigger;
COMMIT;
