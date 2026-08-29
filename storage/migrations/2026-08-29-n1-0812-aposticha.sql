-- N1, date 8-12: repair the Afterfeast of the Transfiguration aposticha.
--
-- Source: https://st-sergius.org/services/Emenaion/08-12.pdf, "AT VESPERS".
-- Header: "AFTERFEAST OF THE TRANSFIGURATION ... COMMEMORATION OF THE HOLY
-- MARTYRS PHOTIUS & ANICETAS AND OUR VENERABLE FATHER MAXIMUS THE CONFESSOR
-- (which is transferred to this date because of the leave-taking...)".
--
-- The source prints: 3 aposticha stichera of the feast (T2), then
--   Glory ..., of the venerable one, in Tone VI  — "O venerable father..."
--   Both now ..., of the feast, in Tone V        — "Disclosing a little..."
-- and THEN three concluding TROPARIA. The parser overran the block and swallowed
-- all three troparia; because insertStichera writes Glory to order=0 and the last
-- "Glory ..." wins, they landed at order=4, 0 and -1 — evicting the two real
-- hymns, which are absent from the DB entirely.
--
-- Removed rows are preserved verbatim in audit/misparsed-troparia-rows.json.
-- Checked before deleting: 8951's text (the feast troparion) already exists as
-- troparia 39247 (8-6) and 39249 (8-7). 8949 and 8950 exist NOWHERE else, so
-- 8950 (St Maximus, Tone VIII) is re-homed below rather than lost. 8949 is the
-- generic martyrs troparion; commemoration 1622 already carries the martyrs'
-- own proper troparion (39326/2627), so nothing functional is lost.
BEGIN;

-- St Maximus is commemorated on this date per the source header, but has no
-- commemoration row. Without one his troparion has nowhere to live.
INSERT INTO commemorations (month, day, rank, title, oca_slug, tone, saint_type)
VALUES (8, 12, '', 'Venerable Maximus the Confessor', '', NULL, 'monastic');

INSERT INTO troparia (commemoration_id, type, tone, text, pronoun, source)
SELECT (SELECT id FROM commemorations WHERE month=8 AND day=12 AND title='Venerable Maximus the Confessor'),
       'troparion', 8,
       'O instructor of Orthodoxy, teacher of piety and purity, * luminary of all the world, divinely inspired adornment of monastics: * O most wise Maximus, by thy doctrines thou hast enlightened all ** O harp of the Spirit, entreat Christ God, that our souls be saved.',
       'tt', 'stSergius';

-- Free order=0 and order=-1 (UNIQUE on commemoration_id, section, "order")
-- before inserting the hymns that belong there.
DELETE FROM stichera WHERE id IN (8949, 8950, 8951);

-- The real aposticha Glory and Both-now, keyed to commemoration 1621 alongside
-- the three numbered stichera the assembler already reads.
--
-- NOT keyed to the new Maximus commemoration, though the Glory is his. Tested:
-- the assembler reads only the PRINCIPAL commemoration's stichera, so moving
-- the row to 2641 makes the hymn vanish from the service entirely. The
-- `Stichera label↔commemoration subject match` drift rule advises exactly that
-- reassignment, and following its advice would delete the hymn — see N15.
--
-- Labels are the source's own wording ("of the venerable one", "of the feast").
-- "the venerable one" has no distinguishing content word, so the renderer prints
-- the slot's title over it (features/hymn-label-choice.md); that display gap is
-- recorded in N15 rather than papered over with an invented label, which would
-- have tripped the drift rule above.
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES
 (1621, 'aposticha',  0, 6, 'the venerable Maximus',
  'O venerable father, word of thy corrections hath gone forth into all the earth. Wherefore, thou hast found the reward of thy labors in the heavens, destroyed hordes of the demons, and attained unto the ranks of the angels, whose life thou didst blamelessly emulate. As thou hast boldness before Christ, ask peace for our souls.',
  '', 'stSergius', NULL),
 (1621, 'aposticha', -1, 5, 'the feast',
  'Disclosing a little of the radiance of Thy divinity to those who ascended the mountain with Thee, O Savior, Thou didst make them lovers of Thy supra-natural glory; wherefore, they cried out in awe: "It is good for us to be here!" And with them we also hymn Thee forever: Christ the transfigured Savior.',
  '', 'stSergius', NULL);

COMMIT;
