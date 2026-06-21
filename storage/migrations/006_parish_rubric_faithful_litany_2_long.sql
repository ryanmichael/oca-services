-- Parish rubric: long form of the 2nd Litany of the Faithful.
--
-- The OCA Sluzhebnik (St Tikhon's Press, 2010) prescribes the short form
-- — opening + Help-us + Wisdom + priest's exclamation — for the 2nd
-- Litany of the Faithful. Some older Russian-tradition Liturgika carry
-- a long form with four great-litany-style petitions ("For the peace
-- from above..." etc.) before "Help us, save us...". Parishes that
-- follow the long form opt in here; default 0 = Sluzhebnik short form.
--
-- St. John of Damascus (Tyler, TX) follows the short form, confirmed
-- by direct observation 2026-06-21 (overrides the older 2026-05-09
-- session note that previously left them on the long form).

BEGIN TRANSACTION;

ALTER TABLE parish_settings
  ADD COLUMN rubric_faithful_litany_2_long INTEGER NOT NULL DEFAULT 0
    CHECK(rubric_faithful_litany_2_long IN (0, 1));

COMMIT;
