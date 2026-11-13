-- Additive transition: applied 001/002 and existing user progress remain unchanged.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='app.users'::regclass
    AND contype='c' AND pg_get_constraintdef(oid) LIKE '%role%'
  LOOP EXECUTE format('ALTER TABLE app.users DROP CONSTRAINT %I', c.conname); END LOOP;
END $$;
ALTER TABLE users ADD CONSTRAINT users_v2_role CHECK(role IN ('intern','buddy','access_approver','documentation_owner'));
ALTER TABLE users ADD COLUMN policy_revision bigint NOT NULL DEFAULT 1;
CREATE TABLE resource_policies (
 resource_id text PRIMARY KEY, team_id text NOT NULL, title text NOT NULL,
 requestable_roles jsonb NOT NULL, approver_id uuid NOT NULL REFERENCES users(id)
);
CREATE TABLE resource_approvers (
 resource_id text NOT NULL REFERENCES resource_policies(resource_id), user_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(resource_id,user_id)
);
ALTER TABLE conversations ADD COLUMN goal_id uuid REFERENCES goals(id);
ALTER TABLE conversations ADD COLUMN step_id text;
ALTER TABLE conversations ADD CONSTRAINT conversations_v2_context CHECK ((goal_id IS NULL)=(step_id IS NULL));
DROP INDEX conversations_general_uq;
CREATE UNIQUE INDEX conversations_general_uq ON conversations(intern_id) WHERE task_id IS NULL AND goal_id IS NULL;
CREATE UNIQUE INDEX conversations_goal_uq ON conversations(intern_id,goal_id,step_id) WHERE goal_id IS NOT NULL;
ALTER TABLE actions ADD COLUMN goal_id uuid REFERENCES goals(id);
ALTER TABLE actions ADD COLUMN step_id text;
ALTER TABLE actions ADD COLUMN goal_version integer;
ALTER TABLE actions ADD COLUMN scope_hash text;
ALTER TABLE actions ADD COLUMN recipient_id uuid REFERENCES users(id);
ALTER TABLE access_requests ADD COLUMN goal_id uuid REFERENCES goals(id);
ALTER TABLE access_requests ADD COLUMN step_id text;
ALTER TABLE access_requests ADD COLUMN resource_id text;
ALTER TABLE access_requests ADD COLUMN requested_role text;
ALTER TABLE access_requests ADD COLUMN grant_state text NOT NULL DEFAULT 'absent' CHECK(grant_state IN ('absent','pending','present','unknown'));
ALTER TABLE access_requests ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE verification_checks ADD COLUMN safe_options jsonb NOT NULL DEFAULT '{}';
ALTER TABLE escalations ADD COLUMN goal_id uuid REFERENCES goals(id);
ALTER TABLE escalations ADD COLUMN step_id text;
ALTER TABLE escalations ADD COLUMN blocker_id uuid REFERENCES blockers(id);
ALTER TABLE escalations ADD COLUMN diagnostic_snapshot jsonb;
ALTER TABLE escalations ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE knowledge_gap_candidates (
 id uuid PRIMARY KEY, journey_id text NOT NULL, step_id text NOT NULL, error_code text NOT NULL,
 team_id text NOT NULL, resource_id text NOT NULL, instruction_refs jsonb NOT NULL,
 affected_count integer NOT NULL CHECK(affected_count>=2), hypothesis text NOT NULL, proposed_fix text NOT NULL,
 state text NOT NULL CHECK(state IN ('proposed','under_review','accepted','rejected','resolved')),
 enrichment_status text NOT NULL CHECK(enrichment_status IN ('pending','completed','failed')),
 version integer NOT NULL DEFAULT 1, resolved_reference jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(journey_id,step_id,error_code,team_id,resource_id),
 CHECK ((state='resolved')=(resolved_reference IS NOT NULL))
);
CREATE TABLE candidate_contributions (
 candidate_id uuid NOT NULL REFERENCES knowledge_gap_candidates(id), intern_id uuid NOT NULL REFERENCES users(id),
 PRIMARY KEY(candidate_id,intern_id)
);
CREATE TABLE candidate_reviews (
 id uuid PRIMARY KEY, candidate_id uuid NOT NULL REFERENCES knowledge_gap_candidates(id),
 actor_id uuid NOT NULL REFERENCES users(id), decision text NOT NULL, reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE goals ADD CONSTRAINT goals_template_fk FOREIGN KEY(journey_id,journey_version) REFERENCES journey_templates(journey_id,version);
ALTER TABLE verification_checks ADD CONSTRAINT checks_step_fk FOREIGN KEY(goal_id,step_id) REFERENCES step_progress(goal_id,step_id);
