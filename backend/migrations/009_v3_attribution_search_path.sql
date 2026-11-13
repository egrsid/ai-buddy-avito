-- Runtime connections intentionally use qualified names and no app search_path.
CREATE OR REPLACE FUNCTION attribute_friction_mentor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO app.friction_mentor_attribution(friction_id, mentor_id)
      SELECT NEW.id, buddy_id FROM app.users WHERE id=NEW.intern_id AND buddy_id IS NOT NULL;
    RETURN NEW;
END
$$;
