-- Knowledge index for permission-aware RAG (owner: AI Engineer).
-- 1) Document ACL: visibility public/team/restricted/private plus team/resource.
--    demo_public stays only for the legacy seed rows until TL removes them;
--    the AI ACL never opens it and ingest deletes it.
-- 2) Embeddings: bge-m3 via Ollama, 1024 dimensions. Mock ingest stores chunks
--    without vectors (lexical search only), so the vector columns are nullable.
-- 3) index_metadata records which index is loaded: mock or live + model.
ALTER TABLE documents DROP CONSTRAINT documents_visibility_check;
ALTER TABLE documents
    ADD COLUMN team_id text,
    ADD COLUMN resource_id text,
    ADD CONSTRAINT documents_visibility_check
        CHECK (visibility IN ('public', 'team', 'restricted', 'private', 'demo_public')),
    ADD CONSTRAINT documents_team_required
        CHECK (visibility NOT IN ('team', 'restricted') OR team_id IS NOT NULL),
    ADD CONSTRAINT documents_resource_required
        CHECK (visibility <> 'restricted' OR resource_id IS NOT NULL);

ALTER TABLE chunks
    ALTER COLUMN embedding TYPE public.vector(1024),
    ALTER COLUMN embedding DROP NOT NULL,
    ALTER COLUMN embedding_model DROP NOT NULL,
    ADD CONSTRAINT chunks_embedding_with_model
        CHECK ((embedding IS NULL) = (embedding_model IS NULL));

ALTER TABLE index_metadata
    ALTER COLUMN embedding_model DROP NOT NULL,
    ALTER COLUMN dimensions DROP NOT NULL,
    ADD COLUMN mode text NOT NULL,
    ADD CONSTRAINT index_metadata_mode
        CHECK (
            (mode = 'mock' AND embedding_model IS NULL AND dimensions IS NULL)
            OR (mode = 'live' AND embedding_model IS NOT NULL AND dimensions = 1024)
        );
