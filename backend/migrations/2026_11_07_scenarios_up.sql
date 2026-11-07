-- Scenario saving, restore and run triggers. Additive only: one new table, two nullable columns.
-- Roll back with 2026_11_07_scenarios_down.sql. Run with: ../venv/bin/python scripts/run_migration.py up
BEGIN;

-- run_trigger: 'manual', 'what_if' or 'restore'. NULL means an older run (manual).
ALTER TABLE optimization_runs ADD COLUMN IF NOT EXISTS run_trigger text NULL;
-- scenario_parameters: the what-if knobs a run was applied with.
ALTER TABLE optimization_runs ADD COLUMN IF NOT EXISTS scenario_parameters jsonb NULL;

CREATE TABLE IF NOT EXISTS saved_scenarios (
    scenario_id    serial PRIMARY KEY,
    hospital_id    integer NOT NULL REFERENCES hospitals(hospital_id) ON DELETE CASCADE,
    name           text NOT NULL,
    parameters     jsonb NOT NULL,
    result_summary jsonb NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_scenarios_hospital_idx ON saved_scenarios (hospital_id, created_at DESC);

COMMIT;
