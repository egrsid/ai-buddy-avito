#!/bin/sh
set -eu
# Executed by the official postgres entrypoint only for a new local volume.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set app_password="$APP_DB_PASSWORD" --set ai_password="$AI_DB_PASSWORD" \
  --set mock_password="$MOCK_DB_PASSWORD" <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;
CREATE ROLE app_owner NOLOGIN;
CREATE ROLE kb_owner NOLOGIN;
CREATE ROLE corporate_owner NOLOGIN;
SELECT format('CREATE ROLE app_service LOGIN PASSWORD %L', :'app_password') \gexec
SELECT format('CREATE ROLE ai_service LOGIN PASSWORD %L', :'ai_password') \gexec
SELECT format('CREATE ROLE mock_service LOGIN PASSWORD %L', :'mock_password') \gexec
CREATE SCHEMA app AUTHORIZATION app_owner;
CREATE SCHEMA kb AUTHORIZATION kb_owner;
CREATE SCHEMA corporate AUTHORIZATION corporate_owner;
GRANT USAGE ON SCHEMA app TO app_service;
GRANT USAGE ON SCHEMA kb TO ai_service;
GRANT USAGE ON SCHEMA corporate TO mock_service;
ALTER DEFAULT PRIVILEGES FOR ROLE app_owner IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_service;
ALTER DEFAULT PRIVILEGES FOR ROLE kb_owner IN SCHEMA kb
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_service;
ALTER DEFAULT PRIVILEGES FOR ROLE corporate_owner IN SCHEMA corporate
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mock_service;
SQL
