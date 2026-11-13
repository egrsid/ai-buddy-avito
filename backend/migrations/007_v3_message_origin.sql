-- v3: who actually answered in chat (primary/secondary/offline model, live or mock, complete or
-- interrupted), as reported by the AI service and stored by Go. NULL = message from before v3.
ALTER TABLE messages ADD COLUMN origin jsonb CHECK (origin IS NULL OR jsonb_typeof(origin) = 'object');
