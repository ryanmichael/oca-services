-- N1, date 1-13: repair the Afterfeast of the Theophany aposticha.
--
-- Source: https://st-sergius.org/services/Emenaion/01-13.pdf, "AT VESPERS".
-- Same defect as 8-12: the parser overran the aposticha block and swallowed the
-- concluding troparia. The source prints 3 stichera of the feast (T2), then
--   Glory ..., in Tone VIII       — "Having attained the angelic life..."
--     (of the venerable fathers slain at Sinai and Raithu, whose feast is 1-14)
--   Both now ..., in the same tone — "The armies of the angels were filled..."
-- and THEN the troparia, which landed at order=4, 0 and -1 and evicted both.
--
-- Removed rows preserved in audit/misparsed-troparia-rows.json. Checked before
-- deleting, each text confirmed still available elsewhere:
--   8274 generic martyrs troparion — comm 86 carries the martyrs' own proper
--        troparion (36978), so nothing functional is lost.
--   8275 "O God of our fathers" — present 44 times in `troparia`, including
--        36993 on 1-14 for the Holy Monastic Fathers slain at Sinai and Raithu,
--        which is precisely these venerable fathers.
--   8276 Theophany troparion — comm 85 already holds it as troparion 36975
--        ("When Thou, O Lord were baptized in the Jordan", Tone 1).
--
-- Note the parser also scrambled tones: 8275 was stored at Tone 8, inherited
-- from the real Glory it displaced, though its own rubric reads "in the same
-- tone" (Tone IV).
BEGIN;

DELETE FROM stichera WHERE id IN (8274, 8275, 8276);

INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES
 (85, 'aposticha',  0, 8, 'the venerable fathers',
  'Having attained the angelic life with the pangs of asceticism, O venerable fathers, and having enslaved the body through abstinence, ye made it subject to your spirit, becoming doers of the commandments of the Lord. Ye preserved the pristine beauty of your countenance and accomplished struggles of asceticism with the sweat of fasting. Having been adorned with twofold crowns, pray ye earnestly to the Savior, that we be saved.',
  '', 'stSergius', NULL),
 (85, 'aposticha', -1, 8, 'the feast',
  'The armies of the angels were filled with awe by what they saw today in the Jordan, when Thou didst stand naked in the waters, O Savior, bowing Thy pure head to be baptized by John. For when Thou didst beggar Thyself of Thine own will, the world was enriched. Glory be to Thee, O Lord!',
  '', 'stSergius', NULL);

COMMIT;
