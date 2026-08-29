-- N1, dates 4-26 and 4-28: a different sub-shape of the same overrun.
--
-- Sources: st-sergius.org/services/Emenaion/04-26.pdf and 04-28.pdf, "AT VESPERS".
-- Both are Paschal-period Sundays where the Glory/Both-now is the Pentecostarion
-- doxasticon, and the Menaion offers two ALTERNATIVES for that slot:
--   "Glory ..., Both now ..., Doxasticon from the Pentecostarion; or this
--    Theotokion, in Tone IV and the same melody:"   <- a plain Theotokion
--   "Stavrotheotokion: ..."                          <- for Wednesday and Friday
--
-- The parser put the Theotokion in the GLORY slot (order=0) with the rubric
-- glued to its head, and left the Stavrotheotokion as an ordinary numbered
-- sticheron. So 4-26 sang "Upon beholding Thee, the Lamb and Shepherd, upon the
-- Cross" as its fourth Lord-I-Call hymn on Myrrhbearers Sunday.
--
-- Only ONE row per date (8530, 8537) was in the N4 burn-down; the other two
-- carry no genre heading and are invisible to RUBRIC_BLEED_PATTERNS.
BEGIN;

-- 4-26, comm 840 (Sunday of the Holy Myrrhbearing Women).
UPDATE stichera
   SET text  = replace(text, 'Doxasticon from the Pentecostarion; or this Theotokion, in Tone IV and the same melody: ', ''),
       "order" = -1,
       label = 'Theotokion'
 WHERE id = 8530;
UPDATE stichera SET group_role = 'stavrotheotokion' WHERE id = 8529;

-- 4-28, comm 848 (Apostles Jason and Sosipater).
UPDATE stichera
   SET text  = replace(text, 'Doxasticon from the Pentecostarion, or this Theotokion, in the same melody: ', ''),
       "order" = -1,
       label = 'Theotokion'
 WHERE id = 8537;
UPDATE stichera SET group_role = 'stavrotheotokion' WHERE id = 8535;

-- Concluding troparion of the holy apostles, swallowed as a 7th sticheron.
-- Comm 848 already holds it as troparion 38135 ("O holy Apostles Jason and
-- Sosipater, pray to the merciful God"), a different translation of the same
-- hymn, so nothing is lost. Preserved in audit/misparsed-troparia-rows.json.
DELETE FROM stichera WHERE id = 8536;

COMMIT;
