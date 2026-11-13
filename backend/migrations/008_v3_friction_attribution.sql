-- Capture mentor attribution at observation time. No fabricated backfill for v2 history.
CREATE TABLE friction_mentor_attribution (
    friction_id uuid PRIMARY KEY REFERENCES friction_events(id) ON DELETE CASCADE,
    mentor_id uuid NOT NULL REFERENCES users(id)
);
CREATE FUNCTION attribute_friction_mentor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO friction_mentor_attribution(friction_id, mentor_id)
      SELECT NEW.id, buddy_id FROM users WHERE id=NEW.intern_id AND buddy_id IS NOT NULL;
    RETURN NEW;
END
$$;
CREATE TRIGGER friction_mentor_attribution_trg AFTER INSERT ON friction_events
    FOR EACH ROW EXECUTE FUNCTION attribute_friction_mentor();
