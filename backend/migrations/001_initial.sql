CREATE TABLE users (
    id uuid PRIMARY KEY,
    account_id text NOT NULL UNIQUE,
    display_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('intern','buddy')),
    team text NOT NULL,
    buddy_id uuid REFERENCES users(id),
    CHECK ((role = 'buddy' AND buddy_id IS NULL) OR role = 'intern'),
    CHECK (buddy_id IS NULL OR buddy_id <> id)
);
CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id),
    csrf_token text NOT NULL,
    expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE tasks (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    title text NOT NULL,
    description text NOT NULL,
    status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done')),
    position integer NOT NULL CHECK (position >= 0),
    source_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(source_ids) = 'array'),
    version integer NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, intern_id),
    UNIQUE (intern_id, position)
);
CREATE TABLE conversations (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    task_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, intern_id),
    FOREIGN KEY (task_id, intern_id) REFERENCES tasks(id, intern_id)
);
CREATE UNIQUE INDEX conversations_general_uq ON conversations(intern_id) WHERE task_id IS NULL;
CREATE UNIQUE INDEX conversations_task_uq ON conversations(intern_id,task_id) WHERE task_id IS NOT NULL;
CREATE TABLE messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    role text NOT NULL CHECK (role IN ('user','assistant')),
    content text NOT NULL,
    status text NOT NULL CHECK (status IN ('completed','failed','cancelled','interrupted')),
    run_id uuid,
    sources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sources) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_conversation_idx ON messages(conversation_id,created_at,id);
CREATE TABLE runs (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES conversations(id),
    user_message_id uuid NOT NULL REFERENCES messages(id),
    assistant_message_id uuid REFERENCES messages(id),
    retry_of uuid REFERENCES runs(id),
    status text NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled','interrupted')),
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE messages ADD CONSTRAINT messages_run_fk FOREIGN KEY (run_id) REFERENCES runs(id);
CREATE UNIQUE INDEX runs_active_uq ON runs(conversation_id) WHERE status IN ('queued','running');
CREATE INDEX runs_user_message_idx ON runs(user_message_id);
CREATE TABLE actions (
    id uuid PRIMARY KEY,
    intern_id uuid NOT NULL REFERENCES users(id),
    conversation_id uuid NOT NULL,
    task_id uuid,
    run_id uuid REFERENCES runs(id),
    type text NOT NULL CHECK (type IN ('create_access_request','escalate_to_buddy','update_task_status')),
    parameters jsonb NOT NULL CHECK (jsonb_typeof(parameters) = 'object'),
    preview jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
    status text NOT NULL CHECK (status IN ('pending_confirmation','executing','succeeded','failed','unknown','cancelled','expired')),
    expires_at timestamptz NOT NULL,
    result jsonb,
    error_code text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, intern_id),
    FOREIGN KEY (conversation_id,intern_id) REFERENCES conversations(id,intern_id),
    FOREIGN KEY (task_id,intern_id) REFERENCES tasks(id,intern_id)
);
CREATE INDEX actions_owner_idx ON actions(intern_id,created_at);
CREATE INDEX actions_reconcile_idx ON actions(status) WHERE status IN ('executing','unknown');
CREATE TABLE access_requests (
    id uuid PRIMARY KEY,
    action_id uuid NOT NULL UNIQUE,
    intern_id uuid NOT NULL REFERENCES users(id),
    task_id uuid,
    resource text NOT NULL,
    access_level text NOT NULL CHECK (access_level IN ('read','write')),
    reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
    mock_id text NOT NULL UNIQUE,
    status text NOT NULL CHECK (status IN ('submitted','approved','rejected')),
    sync_status text NOT NULL DEFAULT 'ok' CHECK (sync_status IN ('ok','unavailable')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (action_id,intern_id) REFERENCES actions(id,intern_id),
    FOREIGN KEY (task_id,intern_id) REFERENCES tasks(id,intern_id)
);
CREATE INDEX access_requests_owner_idx ON access_requests(intern_id,created_at);
CREATE TABLE escalations (
    id uuid PRIMARY KEY,
    action_id uuid NOT NULL UNIQUE,
    intern_id uuid NOT NULL REFERENCES users(id),
    buddy_id uuid NOT NULL REFERENCES users(id),
    task_id uuid,
    question text NOT NULL CHECK (length(question) BETWEEN 1 AND 4000),
    summary text NOT NULL CHECK (length(summary) <= 2000),
    source_ids jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(source_ids) = 'array'),
    status text NOT NULL CHECK (status IN ('open','resolved')),
    answer text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CHECK ((status='open' AND answer IS NULL AND resolved_at IS NULL) OR
           (status='resolved' AND answer IS NOT NULL AND length(answer) BETWEEN 1 AND 4000 AND resolved_at IS NOT NULL)),
    FOREIGN KEY (action_id,intern_id) REFERENCES actions(id,intern_id),
    FOREIGN KEY (task_id,intern_id) REFERENCES tasks(id,intern_id)
);
CREATE INDEX escalations_buddy_idx ON escalations(buddy_id,created_at);
CREATE INDEX escalations_intern_idx ON escalations(intern_id,created_at);
CREATE TABLE audit_events (
    id uuid PRIMARY KEY,
    actor_id uuid NOT NULL REFERENCES users(id),
    action_id uuid REFERENCES actions(id),
    event_type text NOT NULL,
    result text NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_action_idx ON audit_events(action_id);
CREATE TABLE idempotency_keys (
    user_id uuid NOT NULL REFERENCES users(id),
    route text NOT NULL,
    key uuid NOT NULL,
    body_hash text NOT NULL,
    response_status integer,
    response jsonb,
    resource_id uuid,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (user_id,route,key)
);
