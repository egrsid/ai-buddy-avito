-- Preserve legacy proposals; new generations pin the complete brief revision and preview.
ALTER TABLE revision_proposals DROP CONSTRAINT revision_proposals_status_check;
ALTER TABLE revision_proposals ADD CONSTRAINT revision_proposals_status_check CHECK (
    status IN ('generating','ready','needs_input','unavailable','applied','discarded','expired')
);
ALTER TABLE revision_proposals
    ADD COLUMN generation_token uuid,
    ADD COLUMN base_revision integer CHECK (base_revision > 0),
    ADD COLUMN base_fields jsonb CHECK (jsonb_typeof(base_fields) = 'array'),
    ADD COLUMN origin_detail jsonb CHECK (jsonb_typeof(origin_detail) = 'object');
