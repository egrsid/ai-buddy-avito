CREATE TABLE assignment_submissions (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    brief_version integer NOT NULL CHECK (brief_version > 0),
    attempt integer NOT NULL CHECK (attempt > 0),
    evidence_id uuid NOT NULL REFERENCES evidence(id),
    conclusion text NOT NULL CHECK (length(btrim(conclusion)) BETWEEN 1 AND 1500),
    status text NOT NULL CHECK (status IN ('submitted', 'returned', 'accepted')),
    comment text CHECK (length(btrim(comment)) BETWEEN 1 AND 1500),
    submitted_at timestamptz NOT NULL,
    reviewed_by uuid REFERENCES users(id),
    reviewed_at timestamptz,
    UNIQUE (assignment_id, brief_version, attempt),
    CHECK ((status = 'submitted') = (reviewed_at IS NULL)),
    CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CHECK (status <> 'returned' OR comment IS NOT NULL)
);
