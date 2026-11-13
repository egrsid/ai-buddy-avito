-- Relational guards for the same owner/goal/step correlations checked by Go.
ALTER TABLE goals ADD CONSTRAINT goals_owner_uq UNIQUE(id,intern_id);
ALTER TABLE conversations ADD CONSTRAINT conversations_goal_owner_fk FOREIGN KEY(goal_id,intern_id) REFERENCES goals(id,intern_id);
ALTER TABLE actions ADD CONSTRAINT actions_goal_owner_fk FOREIGN KEY(goal_id,intern_id) REFERENCES goals(id,intern_id);
ALTER TABLE access_requests ADD CONSTRAINT requests_goal_owner_fk FOREIGN KEY(goal_id,intern_id) REFERENCES goals(id,intern_id);
ALTER TABLE escalations ADD CONSTRAINT escalations_goal_owner_fk FOREIGN KEY(goal_id,intern_id) REFERENCES goals(id,intern_id);
ALTER TABLE verification_checks ADD CONSTRAINT checks_context_uq UNIQUE(id,goal_id,step_id);
ALTER TABLE evidence ADD CONSTRAINT evidence_check_context_fk FOREIGN KEY(check_id,goal_id,step_id) REFERENCES verification_checks(id,goal_id,step_id);
ALTER TABLE evidence ADD CONSTRAINT evidence_subject_fk FOREIGN KEY(goal_id,subject_id) REFERENCES goals(id,intern_id);
ALTER TABLE friction_events ADD CONSTRAINT friction_subject_fk FOREIGN KEY(goal_id,intern_id) REFERENCES goals(id,intern_id);
CREATE UNIQUE INDEX blockers_open_code_uq ON blockers(goal_id,step_id,error_code) WHERE status='open';
