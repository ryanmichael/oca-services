-- Parish practice picks.
--
-- Named SHAPE presets a parish selects from fixed-texts/practice-library/ —
-- which units of a canonical text are actually sung. The sibling of
-- parish_variant_picks, which selects WORDING from the variant library.
--
-- Kept as its own table rather than folded into parish_variant_picks because
-- the two payloads are not interchangeable: a variant supplies a VALUE that
-- replaces what is at the target path, a preset supplies an OPERATION applied
-- to the canonical value there. Sharing a table would also break
-- validateParishVariantPicks, which resolves every row against the variant
-- library and would report practice rows as unresolvable.
--
-- Bespoke one-parish practices continue to live inline in
-- parish_settings.rubrics_extra_json.practice[]; an inline entry overrides a
-- preset targeting the same path. See fixed-texts/practice-library/CONTRACT.md
-- for the promotion path from inline to preset.
--
-- Idempotent: re-running produces the same row set.

BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS parish_practice_picks (
  parish_id    TEXT NOT NULL,
  practice_key TEXT NOT NULL,
  preset_id    TEXT NOT NULL,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (parish_id, practice_key),
  FOREIGN KEY (parish_id) REFERENCES parish_settings(parish_id) ON DELETE CASCADE
);

-- Backfill: St. John of Damascus (Tyler) sings the Krasnostovsky abridged form
-- of both typical antiphons, confirmed with the parish 2026-08-08. These were
-- authored as inline entries when the practice layer shipped (658d4f9); the
-- inline copies are removed below so the preset is the single source.
INSERT OR IGNORE INTO parish_practice_picks (parish_id, practice_key, preset_id)
SELECT parish_id, 'typical-antiphon-1', 'krasnostovsky-abridged'
  FROM parish_settings WHERE parish_id = 'st-john-damascus-tyler';

INSERT OR IGNORE INTO parish_practice_picks (parish_id, practice_key, preset_id)
SELECT parish_id, 'typical-antiphon-2', 'krasnostovsky-abridged'
  FROM parish_settings WHERE parish_id = 'st-john-damascus-tyler';

-- Drop the now-redundant inline practice entries. json_remove is a no-op when
-- the key is already absent, so this is safe to re-run. Every other key in
-- rubrics_extra_json (principalOverrides, antiphonSet) is preserved.
UPDATE parish_settings
   SET rubrics_extra_json = json_remove(rubrics_extra_json, '$.practice')
 WHERE parish_id = 'st-john-damascus-tyler'
   AND json_valid(rubrics_extra_json)
   AND json_extract(rubrics_extra_json, '$.practice') IS NOT NULL;

COMMIT;
