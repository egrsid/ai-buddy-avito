ALTER TABLE access_requests DROP CONSTRAINT access_requests_resource_check;
ALTER TABLE access_requests ADD COLUMN requested_role text NOT NULL DEFAULT 'db_reader' CHECK(requested_role='db_reader');
ALTER TABLE access_requests ADD COLUMN grant_state text NOT NULL DEFAULT 'absent' CHECK(grant_state IN ('absent','pending','present','unknown'));
CREATE TABLE resource_approvers (
 resource_id text NOT NULL REFERENCES resources(resource_id), subject_id uuid NOT NULL,
 PRIMARY KEY(resource_id,subject_id)
);
CREATE TABLE decisions (
 operation_key uuid PRIMARY KEY, mock_id text NOT NULL REFERENCES access_requests(mock_id), payload_hash text NOT NULL
);
CREATE TABLE check_results (
 check_id uuid PRIMARY KEY, payload_hash text NOT NULL, result jsonb NOT NULL
);
