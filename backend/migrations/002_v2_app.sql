CREATE TABLE role_assignments (
    user_id uuid NOT NULL REFERENCES users(id),
    role text NOT NULL CHECK (role IN ('intern', 'buddy', 'access_approver', 'documentation_owner')),
    PRIMARY KEY (user_id, role)
);

CREATE TABLE resource_assignments (
    user_id uuid NOT NULL REFERENCES users(id),
    resource_id text NOT NULL,
    requested_role text NOT NULL CHECK (requested_role IN ('db_reader')),
    PRIMARY KEY (user_id, resource_id, requested_role)
);

CREATE TABLE document_permissions (
    document_id uuid NOT NULL,
    subject_id uuid NOT NULL REFERENCES users(id),
    permission text NOT NULL CHECK (permission IN ('knowledge.read', 'knowledge_gap.review')),
    PRIMARY KEY (document_id, subject_id, permission)
);

CREATE TABLE journey_templates (
    journey_id text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    team_id text NOT NULL,
    resource_id text NOT NULL,
    approved_by uuid NOT NULL REFERENCES users(id),
    content_hash text NOT NULL CHECK (char_length(content_hash) = 64),
    document jsonb NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    PRIMARY KEY (journey_id, version)
);

CREATE TABLE goals (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    journey_id text NOT NULL,
    journey_version integer NOT NULL CHECK (journey_version > 0),
    content_hash text NOT NULL CHECK (char_length(content_hash) = 64),
    resource_id text NOT NULL,
    status text NOT NULL CHECK (status IN ('unverified', 'ready', 'blocked', 'waiting_external', 'verified')),
    version integer NOT NULL CHECK (version > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX goals_one_active_uq ON goals (intern_id, journey_id) WHERE status <> 'verified';

CREATE TABLE step_progress (
    goal_id uuid NOT NULL REFERENCES goals(id),
    step_id text NOT NULL,
    state text NOT NULL CHECK (state IN ('unverified', 'ready', 'blocked', 'waiting_external', 'verified')),
    version integer NOT NULL CHECK (version > 0),
    evidence_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(evidence_ids) = 'array'),
    blocker_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(blocker_ids) = 'array'),
    user_claim text,
    PRIMARY KEY (goal_id, step_id)
);

CREATE TABLE verification_checks (
    id uuid PRIMARY KEY,
    goal_id uuid NOT NULL REFERENCES goals(id),
    step_id text NOT NULL,
    method text NOT NULL CHECK (method IN ('resource_policy_match', 'iam_permission_present', 'mock_db_connection')),
    operation_key uuid NOT NULL UNIQUE,
    status text NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed', 'unavailable')),
    error_code text,
    observed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE evidence (
    id uuid PRIMARY KEY,
    check_id uuid NOT NULL REFERENCES verification_checks(id),
    event_id uuid NOT NULL,
    source text NOT NULL,
    subject_id uuid NOT NULL REFERENCES users(id),
    resource_id text NOT NULL,
    goal_id uuid NOT NULL REFERENCES goals(id),
    step_id text NOT NULL,
    journey_version integer NOT NULL CHECK (journey_version > 0),
    result text NOT NULL CHECK (result IN ('passed', 'failed', 'absent')),
    observed_at timestamptz NOT NULL,
    invalidated_at timestamptz,
    synthetic boolean NOT NULL CHECK (synthetic),
    UNIQUE (source, event_id)
);

CREATE TABLE blockers (
    id uuid PRIMARY KEY,
    goal_id uuid NOT NULL REFERENCES goals(id),
    step_id text NOT NULL,
    blocker_type text NOT NULL,
    error_code text NOT NULL,
    status text NOT NULL CHECK (status IN ('open', 'resolved')),
    latest_check_id uuid NOT NULL REFERENCES verification_checks(id),
    recovery_actions jsonb NOT NULL CHECK (jsonb_typeof(recovery_actions) = 'array')
);

CREATE TABLE friction_events (
    id uuid PRIMARY KEY,
    journey_id text NOT NULL,
    journey_version integer NOT NULL CHECK (journey_version > 0),
    goal_id uuid NOT NULL REFERENCES goals(id),
    step_id text NOT NULL,
    intern_id uuid NOT NULL REFERENCES users(id),
    error_code text NOT NULL,
    blocker_type text NOT NULL,
    attempt_id uuid NOT NULL,
    outcome text NOT NULL CHECK (outcome IN ('failed', 'unavailable')),
    instruction_id uuid NOT NULL,
    instruction_version integer NOT NULL CHECK (instruction_version > 0),
    occurred_at timestamptz NOT NULL,
    UNIQUE (attempt_id, error_code)
);

CREATE TABLE business_events (
    id uuid PRIMARY KEY,
    event_type text NOT NULL,
    schema_version integer NOT NULL CHECK (schema_version = 1),
    occurred_at timestamptz NOT NULL,
    source text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid NOT NULL,
    correlation_id uuid NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    synthetic boolean NOT NULL CHECK (synthetic),
    UNIQUE (source, id)
);
