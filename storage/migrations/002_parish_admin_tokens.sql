-- Phase 1 — magic-link auth for parish self-service settings.
-- See docs/parish-self-service-design.md §5 and §8 (write-path security).

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS parish_admin_tokens (
  token_hash   TEXT PRIMARY KEY,            -- sha-256 of the raw token
  parish_id    TEXT NOT NULL,
  label        TEXT,                        -- e.g. 'Father John (priest)'
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (parish_id) REFERENCES parish_settings(parish_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parish_tokens_parish ON parish_admin_tokens(parish_id);

COMMIT;
