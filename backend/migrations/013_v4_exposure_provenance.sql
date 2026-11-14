-- New observations carry receipt provenance. Existing history is deliberately unknown.
ALTER TABLE version_exposure_episodes ADD COLUMN received_at timestamptz;
ALTER TABLE version_exposure_episodes ALTER COLUMN received_at SET DEFAULT clock_timestamp();
ALTER TABLE task_frictions ADD COLUMN received_at timestamptz;
ALTER TABLE task_frictions ALTER COLUMN received_at SET DEFAULT clock_timestamp();
