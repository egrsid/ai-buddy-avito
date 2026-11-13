CREATE TABLE resources (
    resource_id text PRIMARY KEY,
    team_id text NOT NULL,
    title text NOT NULL,
    requestable_roles jsonb NOT NULL CHECK (jsonb_typeof(requestable_roles) = 'array'),
    synthetic boolean NOT NULL CHECK (synthetic)
);

CREATE TABLE iam_grants (
    subject_id uuid NOT NULL,
    resource_id text NOT NULL REFERENCES resources(resource_id),
    granted_role text NOT NULL CHECK (granted_role IN ('db_reader')),
    grant_state text NOT NULL CHECK (grant_state IN ('absent', 'pending', 'present', 'unknown')),
    observed_at timestamptz,
    PRIMARY KEY (subject_id, resource_id, granted_role)
);

CREATE TABLE connection_checks (
    check_id uuid PRIMARY KEY,
    subject_id uuid NOT NULL,
    resource_id text NOT NULL REFERENCES resources(resource_id),
    ssl_mode text NOT NULL CHECK (ssl_mode IN ('disable', 'require')),
    outcome text NOT NULL CHECK (outcome IN ('passed', 'failed', 'unavailable')),
    error_code text,
    observed_at timestamptz NOT NULL,
    synthetic boolean NOT NULL CHECK (synthetic),
    CHECK (
        (outcome = 'passed' AND error_code IS NULL)
        OR (outcome = 'failed' AND error_code IN ('DB_SSL_REQUIRED', 'ACCESS_DENIED'))
        OR (outcome = 'unavailable' AND error_code = 'CHECK_UNAVAILABLE')
    )
);
