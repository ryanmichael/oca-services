-- Choir-correction audit trail.
-- See docs/parish-self-service-design.md §11 (deferred) and the choir-correction
-- skill at ~/.claude/skills/choir-correction/SKILL.md.
--
-- Every correction routed by the choir-correction workflow appends a row here.
-- Append-only, written at correction-apply time (not request time) — so this
-- table does not reopen Track E concerns about runtime DB churn.
--
-- One row per correction. If a single choir-director artifact produces several
-- edits, each one gets its own row sharing source_artifact + applied_at.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS corrections_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  applied_at          INTEGER NOT NULL,
  applied_by          TEXT,                                 -- 'admin' | token-hash-prefix
  parish_id           TEXT,                                 -- nullable: structure/base edits may be parish-agnostic
  source_artifact     TEXT,                                 -- e.g. 'choir-director-email-2026-06-20.pdf' or free text
  source_citation     TEXT,                                 -- OCA rubric ref, HTM page, etc.

  -- Classification (one of the 7 branches in the decision tree)
  branch              TEXT NOT NULL CHECK(branch IN (
                        'variant-pick',
                        'rubric-flag',
                        'text-overlay',
                        'library-add',
                        'text-base',
                        'structure',
                        'calendar-data'
                      )),
  rejected_branches   TEXT,                                 -- JSON array of {branch, reason} considered + rejected

  -- Target slot (always populated for text branches; structure rows point at the assembler step)
  target_service      TEXT,                                 -- 'liturgy' | 'vespers' | 'matins' | ...
  target_path         TEXT,                                 -- dotted-path or assembler function name

  -- Diff identity
  before_sha          TEXT,                                 -- sha256 of pre-correction rendering at the slot
  after_sha           TEXT,                                 -- sha256 of post-correction rendering
  before_preview      TEXT,                                 -- short excerpt (first ~200 chars)
  after_preview       TEXT,

  -- Trace into other systems
  variant_id          TEXT,                                 -- if branch produced/picked a library variant
  audit_rule_id       TEXT,                                 -- if branch added/updated an audit rule
  applied_commit      TEXT,                                 -- git SHA after apply (filled by the skill post-commit)
  notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_corrections_parish    ON corrections_log(parish_id, applied_at);
CREATE INDEX IF NOT EXISTS idx_corrections_branch    ON corrections_log(branch, applied_at);
CREATE INDEX IF NOT EXISTS idx_corrections_slot      ON corrections_log(target_service, target_path);

COMMIT;
