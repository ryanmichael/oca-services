-- Parish rubric: reader-led Beatitudes canon-troparia.
--
-- Some OCA Sluzhebnik parishes have the Reader recite the canon troparia
-- interpolated between the Beatitude verses at the Third Antiphon, while
-- the choir sings only the Beatitude verses themselves. Other parishes
-- have the choir sing both. This flag opts the parish into reader-led
-- troparia; default 0 preserves choir-led behavior.
--
-- St. John of Damascus (Tyler, TX) follows the reader-led practice and
-- is enabled in the same migration.

BEGIN TRANSACTION;

ALTER TABLE parish_settings
  ADD COLUMN rubric_beatitudes_reader_led INTEGER NOT NULL DEFAULT 0
    CHECK(rubric_beatitudes_reader_led IN (0, 1));

UPDATE parish_settings
   SET rubric_beatitudes_reader_led = 1,
       updated_at = strftime('%s', 'now')
 WHERE parish_id = 'st-john-damascus-tyler';

COMMIT;
