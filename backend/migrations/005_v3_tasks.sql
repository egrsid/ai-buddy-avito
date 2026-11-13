-- v3: Telegram contact of the assigned mentor, versioned task briefs, assignments,
-- structured task frictions and task clarity reports. Earlier migrations stay unchanged.

CREATE TABLE mentor_contacts (
    mentor_id uuid PRIMARY KEY REFERENCES users(id),
    telegram_username text NOT NULL CHECK (telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Short-lived preview of the text an intern may copy for the mentor. The text itself is
-- rebuilt from current app state on export, so stale or revoked context is never copied.
CREATE TABLE contact_previews (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    mentor_id uuid NOT NULL REFERENCES users(id),
    contact_revision integer NOT NULL CHECK (contact_revision > 0),
    context jsonb NOT NULL CHECK (jsonb_typeof(context) = 'object'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_previews_intern_idx ON contact_previews(intern_id, expires_at);

CREATE TABLE task_briefs (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    team_id text NOT NULL,
    archived_at timestamptz,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_briefs_owner_idx ON task_briefs(owner_id, updated_at DESC);

CREATE TABLE task_brief_versions (
    brief_id uuid NOT NULL REFERENCES task_briefs(id),
    version integer NOT NULL CHECK (version > 0),
    state text NOT NULL CHECK (state IN ('draft', 'published')),
    content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
    content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    published_by uuid REFERENCES users(id),
    PRIMARY KEY (brief_id, version),
    CHECK ((state = 'published') = (published_at IS NOT NULL AND published_by IS NOT NULL))
);
CREATE UNIQUE INDEX task_brief_one_draft_uq ON task_brief_versions(brief_id) WHERE state = 'draft';

-- A published version is immutable: corrections go into a successor draft.
CREATE FUNCTION task_brief_versions_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.state = 'published' THEN
        RAISE EXCEPTION 'published task brief version is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER task_brief_versions_immutable_trg BEFORE UPDATE OR DELETE ON task_brief_versions
    FOR EACH ROW EXECUTE FUNCTION task_brief_versions_immutable();

CREATE TABLE task_assignments (
    id uuid PRIMARY KEY,
    brief_id uuid NOT NULL,
    brief_version integer NOT NULL,
    intern_id uuid NOT NULL REFERENCES users(id),
    assigned_by uuid NOT NULL REFERENCES users(id),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (brief_id, brief_version) REFERENCES task_brief_versions(brief_id, version),
    UNIQUE (brief_id, intern_id)
);
CREATE INDEX task_assignments_intern_idx ON task_assignments(intern_id);

-- One contribution per intern and group; a repeat only moves last_seen.
CREATE TABLE task_frictions (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES task_assignments(id),
    team_id text NOT NULL,
    owner_id uuid NOT NULL REFERENCES users(id),
    brief_id uuid NOT NULL,
    brief_version integer NOT NULL,
    section_id text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('requirement_unclear', 'outcome_unclear', 'acceptance_unclear')),
    intern_id uuid NOT NULL REFERENCES users(id),
    first_seen timestamptz NOT NULL,
    last_seen timestamptz NOT NULL CHECK (last_seen >= first_seen),
    FOREIGN KEY (brief_id, brief_version) REFERENCES task_brief_versions(brief_id, version),
    UNIQUE (team_id, owner_id, brief_id, brief_version, section_id, reason, intern_id)
);

CREATE TABLE task_clarity_reports (
    id uuid PRIMARY KEY,
    team_id text NOT NULL,
    owner_id uuid NOT NULL REFERENCES users(id),
    brief_id uuid NOT NULL,
    brief_version integer NOT NULL,
    section_id text NOT NULL,
    reason text NOT NULL CHECK (reason IN ('requirement_unclear', 'outcome_unclear', 'acceptance_unclear')),
    state text NOT NULL DEFAULT 'proposed' CHECK (state IN ('proposed', 'under_review', 'accepted', 'rejected', 'resolved')),
    current_count integer NOT NULL CHECK (current_count BETWEEN 0 AND 100),
    lifetime_count integer NOT NULL CHECK (lifetime_count BETWEEN 2 AND 100),
    last_seen timestamptz NOT NULL,
    hypothesis text NOT NULL CHECK (length(hypothesis) BETWEEN 1 AND 2000),
    suggestion text NOT NULL CHECK (length(suggestion) BETWEEN 1 AND 2000),
    enrichment_status text NOT NULL CHECK (enrichment_status IN ('pending', 'completed', 'failed')),
    resolved_version integer,
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (brief_id, brief_version) REFERENCES task_brief_versions(brief_id, version),
    UNIQUE (team_id, owner_id, brief_id, brief_version, section_id, reason),
    CHECK ((state = 'resolved') = (resolved_version IS NOT NULL)),
    CHECK (resolved_version IS NULL OR resolved_version > brief_version)
);

CREATE TABLE task_clarity_reviews (
    id uuid PRIMARY KEY,
    report_id uuid NOT NULL REFERENCES task_clarity_reports(id),
    actor_id uuid NOT NULL REFERENCES users(id),
    decision text NOT NULL CHECK (decision IN ('under_review', 'accepted', 'rejected', 'resolved')),
    reason text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
