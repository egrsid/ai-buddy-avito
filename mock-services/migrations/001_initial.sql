CREATE TABLE access_requests (
    mock_id text PRIMARY KEY,
    operation_key uuid NOT NULL UNIQUE,
    payload_hash text NOT NULL,
    initiator_id uuid NOT NULL,
    resource text NOT NULL CHECK (resource IN ('sandbox/backend','sandbox/restricted')),
    access_level text NOT NULL CHECK (access_level IN ('read','write')),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
    status text NOT NULL CHECK (status IN ('submitted','approved','rejected')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
