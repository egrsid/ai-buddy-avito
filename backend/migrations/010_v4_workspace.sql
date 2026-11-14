-- v4: explicit workspace links, exposure episodes, revision proposals and impact config.
-- Earlier migrations stay unchanged. Existing rows are not rewritten into a fake history.

ALTER TABLE task_assignments
    ADD COLUMN permitted_template_id text,
    ADD COLUMN permitted_template_version integer,
    ADD CONSTRAINT task_assignments_template_pair CHECK (
        (permitted_template_id IS NULL) = (permitted_template_version IS NULL)
    );

CREATE TABLE workspace_link_previews (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    intern_id uuid NOT NULL REFERENCES users(id),
    template_id text NOT NULL,
    template_version integer NOT NULL CHECK (template_version > 0),
    preview_hash text NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
    assignment_revision integer NOT NULL CHECK (assignment_revision > 0),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_links (
    id uuid PRIMARY KEY,
    assignment_id uuid NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    created_by uuid NOT NULL REFERENCES users(id),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    unlinked_at timestamptz
);
CREATE UNIQUE INDEX workspace_links_one_active_uq ON workspace_links(assignment_id) WHERE active;

CREATE TABLE version_exposure_episodes (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    assignment_id uuid NOT NULL REFERENCES task_assignments(id) ON DELETE CASCADE,
    brief_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    source text NOT NULL CHECK (source IN ('assigned', 'adopted')),
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    end_reason text,
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX exposure_one_open_uq ON version_exposure_episodes(assignment_id) WHERE ended_at IS NULL;

CREATE TABLE revision_proposals (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    report_id uuid NOT NULL,
    brief_id uuid NOT NULL,
    section_id text NOT NULL,
    base_version integer NOT NULL CHECK (base_version > 0),
    base_hash text NOT NULL CHECK (base_hash ~ '^[0-9a-f]{64}$'),
    status text NOT NULL CHECK (status IN ('ready', 'needs_input', 'unavailable', 'applied', 'discarded', 'expired')),
    origin text NOT NULL CHECK (origin IN ('model', 'rule_based')),
    changes jsonb NOT NULL CHECK (jsonb_typeof(changes) = 'array'),
    questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array'),
    proposal_revision integer NOT NULL DEFAULT 1 CHECK (proposal_revision > 0),
    draft_version integer,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE impact_configs (
    brief_id uuid NOT NULL REFERENCES task_briefs(id) ON DELETE CASCADE,
    revision integer NOT NULL CHECK (revision > 0),
    before_version integer NOT NULL CHECK (before_version > 0),
    after_version integer NOT NULL CHECK (after_version > before_version),
    section_id text NOT NULL,
    reason text NOT NULL,
    comparable boolean NOT NULL,
    from_a timestamptz NOT NULL,
    to_a timestamptz NOT NULL,
    from_b timestamptz NOT NULL,
    to_b timestamptz NOT NULL,
    policy_revision integer NOT NULL DEFAULT 1 CHECK (policy_revision > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (brief_id, revision),
    CHECK (from_a < to_a AND from_b < to_b)
);
