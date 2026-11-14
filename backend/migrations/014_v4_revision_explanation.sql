-- A short, reviewable explanation, never model chain-of-thought or arbitrary patches.
ALTER TABLE revision_proposals ADD COLUMN rationale text CHECK (length(rationale) <= 2000);
