CREATE TABLE documents (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    content text NOT NULL,
    version integer NOT NULL CHECK (version > 0),
    content_hash text NOT NULL,
    visibility text NOT NULL CHECK (visibility = 'demo_public'),
    synthetic boolean NOT NULL CHECK (synthetic),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE index_metadata (
    id integer PRIMARY KEY CHECK (id = 1),
    embedding_model text NOT NULL,
    dimensions integer NOT NULL CHECK (dimensions > 0),
    dataset_version text NOT NULL,
    indexed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chunks (
    id uuid PRIMARY KEY,
    document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 0),
    content text NOT NULL,
    embedding public.vector NOT NULL,
    embedding_model text NOT NULL,
    document_version integer NOT NULL,
    UNIQUE (document_id,position)
);
