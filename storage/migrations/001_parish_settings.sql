-- Phase 1 MVP — parish self-service tables.
-- See docs/parish-self-service-design.md §2.2 for rationale.
--
-- Three tables:
--   parish_settings        — form fields + typed rubric columns (source of truth)
--   parish_variant_picks   — normalized library references
--   parish_settings_history — append-only audit log
--
-- parish_admin_tokens (auth) lands in 002_parish_auth.sql with P1.7.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS parish_settings (
  -- Slug + identity
  parish_id            TEXT PRIMARY KEY
                        CHECK(parish_id GLOB '[a-z0-9][a-z0-9-]*'
                              AND length(parish_id) BETWEEN 3 AND 50),
  name                 TEXT NOT NULL,
  city                 TEXT,
  jurisdiction         TEXT NOT NULL,                    -- 'oca' | 'rocor' | 'antiochian' | 'serbian' | 'georgian'
  extends_chain        TEXT NOT NULL,                    -- JSON array of overlay ids in resolution order

  -- Hierarchs (free-text full titles — drive derivation templates)
  primate_name         TEXT,
  ruling_hierarch_name TEXT,

  -- Patron-of-temple (stable natural key, not opaque commemorationId)
  patron_natural_key   TEXT,                             -- e.g. '12-04/john-of-damascus'
  patron_title         TEXT,                             -- display title

  -- Rubric flags (7 known; closed set). All bool unless noted.
  rubric_confess_first                 INTEGER NOT NULL DEFAULT 0 CHECK(rubric_confess_first IN (0, 1)),
  rubric_omit_pre_trisagion_litany     INTEGER NOT NULL DEFAULT 0 CHECK(rubric_omit_pre_trisagion_litany IN (0, 1)),
  rubric_include_lesser_saints         INTEGER NOT NULL DEFAULT 0 CHECK(rubric_include_lesser_saints IN (0, 1)),
  rubric_include_second_gospel         INTEGER NOT NULL DEFAULT 0 CHECK(rubric_include_second_gospel IN (0, 1)),
  rubric_include_second_koinonikon     INTEGER NOT NULL DEFAULT 0 CHECK(rubric_include_second_koinonikon IN (0, 1)),
  rubric_omit_catechumens_seasons      TEXT    NOT NULL DEFAULT '',  -- comma-joined season ids, '' = none
  rubric_paschal_communion_year_round  INTEGER NOT NULL DEFAULT 0 CHECK(rubric_paschal_communion_year_round IN (0, 1)),
  rubrics_extra_json                   TEXT,                          -- overflow only (future unmodelled flags)

  -- Bucket D carryover: parishes with custom text overrides still file-based
  -- until Phase 6 (upload flow). The loader stacks this file overlay UNDER the
  -- in-memory parish overlay, so DB fields win where they overlap.
  legacy_overlay_path  TEXT,

  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS parish_variant_picks (
  parish_id    TEXT NOT NULL,
  variant_key  TEXT NOT NULL,                            -- library file basename (e.g. 'pre-communion-prayer')
  variant_id   TEXT NOT NULL,                            -- id-or-alias resolved against the library
  PRIMARY KEY (parish_id, variant_key),
  FOREIGN KEY (parish_id) REFERENCES parish_settings(parish_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parish_settings_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  parish_id    TEXT    NOT NULL,
  changed_at   INTEGER NOT NULL,
  actor        TEXT,                                     -- token hash prefix or 'admin' or 'migration'
  field        TEXT    NOT NULL,                         -- column name OR 'variant_picks.<key>'
  old_value    TEXT,
  new_value    TEXT
);

CREATE INDEX IF NOT EXISTS idx_parish_history_parish ON parish_settings_history(parish_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_parish_picks_key      ON parish_variant_picks(variant_key, variant_id);

COMMIT;
