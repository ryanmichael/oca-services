-- Parish rubrics registry table.
--
-- Refactors the typed per-rubric columns on parish_settings into a single
-- generic (parish_id, rubric_id, value) key-value table driven by
-- data/rubric-registry.json. The typed columns remain in place for now;
-- writes go to BOTH during a dual-write bake-in period (see
-- features/rubric-registry.md).
--
-- This migration creates parish_rubrics and backfills it from every existing
-- typed rubric column whose value differs from the default. Idempotent:
-- re-running produces the same row set.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS parish_rubrics (
  parish_id  TEXT NOT NULL,
  rubric_id  TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parish_id, rubric_id),
  FOREIGN KEY (parish_id) REFERENCES parish_settings(parish_id) ON DELETE CASCADE
);

-- Backfill: boolean rubrics (insert only where flag != 0).
INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'confessFirst', CAST(rubric_confess_first AS TEXT)
    FROM parish_settings WHERE rubric_confess_first != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'omitPreTrisagionLitany', CAST(rubric_omit_pre_trisagion_litany AS TEXT)
    FROM parish_settings WHERE rubric_omit_pre_trisagion_litany != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'includeLesserSaints', CAST(rubric_include_lesser_saints AS TEXT)
    FROM parish_settings WHERE rubric_include_lesser_saints != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'includeSecondGospel', CAST(rubric_include_second_gospel AS TEXT)
    FROM parish_settings WHERE rubric_include_second_gospel != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'includeSecondKoinonikon', CAST(rubric_include_second_koinonikon AS TEXT)
    FROM parish_settings WHERE rubric_include_second_koinonikon != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'paschalCommunionYearRound', CAST(rubric_paschal_communion_year_round AS TEXT)
    FROM parish_settings WHERE rubric_paschal_communion_year_round != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'beatitudesTropariaReaderLed', CAST(rubric_beatitudes_reader_led AS TEXT)
    FROM parish_settings WHERE rubric_beatitudes_reader_led != 0;

INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'faithful2Long', CAST(rubric_faithful_litany_2_long AS TEXT)
    FROM parish_settings WHERE rubric_faithful_litany_2_long != 0;

-- csv-strings: raw csv text, only when non-empty.
INSERT OR IGNORE INTO parish_rubrics (parish_id, rubric_id, value)
  SELECT parish_id, 'omitCatechumensSeasons', rubric_omit_catechumens_seasons
    FROM parish_settings WHERE rubric_omit_catechumens_seasons != '';

COMMIT;
