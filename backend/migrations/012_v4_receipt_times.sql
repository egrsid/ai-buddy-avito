-- Receipt time is distinct from upstream observation time. Unknown legacy receipt stays NULL.
ALTER TABLE verification_checks ADD COLUMN received_at timestamptz;
ALTER TABLE verification_checks ALTER COLUMN received_at SET DEFAULT clock_timestamp();
ALTER TABLE evidence ADD COLUMN received_at timestamptz;
ALTER TABLE evidence ALTER COLUMN received_at SET DEFAULT clock_timestamp();
ALTER TABLE access_requests ADD COLUMN received_at timestamptz;
ALTER TABLE access_requests ALTER COLUMN received_at SET DEFAULT clock_timestamp();
ALTER TABLE business_events ADD COLUMN received_at timestamptz;
ALTER TABLE business_events ALTER COLUMN received_at SET DEFAULT clock_timestamp();
