-- N1, dates 7-18, 9-03 and 10-11.
--
-- 7-18 (Martyr Emilian), comm 1441 — lordICall. The whole block is shifted by
-- one: the three proper stichera occupy orders 0, 1 and 2, so the FIRST of them
-- was being sung as the Glory. Behind them sit the Theotokion (rubric glued),
-- the Stavrotheotokion, and the concluding troparion. The source gives no Glory
-- of the saint here — "Glory .., Both now ..., Theotokion" is the only doxastic
-- slot — so order=0 is correctly left empty after renumbering.
--
-- 9-03 (Hieromartyr Anthimus + Ven. Theoctistus), comm 1793 — aposticha. The
-- source takes numbered stichera from the Octoechos and gives "Glory ..., in
-- Tone VI" ("O venerable father, word of thy corrections") plus "Both now ...,
-- Theotokion, or this Stavrotheotokion, in Tone VI". The Glory was parsed one
-- slot low at order=1, the Both-now was never captured, and two troparia took
-- its place.
--
-- 10-11 (Apostle Philip of the Seventy), comm 2095 — lordICall. Stavrotheotokion
-- left as a numbered sticheron, concluding troparia at orders 8 and 0, and the
-- "Glory ..., Both now ..., Theotokion" absent.
--
-- Deletions checked against the corpus first; every text survives elsewhere:
--   8854 -> comm 1441 troparia 39050/39051.   9066 -> troparia 39590 (same day,
--   comm 1799).   9067 -> generic venerable troparion, 36900/36918.
--   9252 -> comm 2097 troparia 40046/40047.   9253 -> troparia 38632 (6-11).
BEGIN;

-- ── 7-18 ──────────────────────────────────────────────────────────────────
-- Renumber in an order that never collides with the UNIQUE(comm, section, order)
-- constraint: free slot 3 first, then walk the stichera up one at a time.
UPDATE stichera SET "order" = -1, label = 'Theotokion',
       text = replace(text, 'Glory .., Both now ..., Theotokion, in the same melody: ', '')
 WHERE id = 8852;
UPDATE stichera SET "order" = 3 WHERE id = 8851;
UPDATE stichera SET "order" = 2 WHERE id = 8850;
UPDATE stichera SET "order" = 1 WHERE id = 8849;
UPDATE stichera SET group_role = 'stavrotheotokion' WHERE id = 8853;
DELETE FROM stichera WHERE id = 8854;

-- ── 9-03 ──────────────────────────────────────────────────────────────────
DELETE FROM stichera WHERE id IN (9066, 9067);   -- frees order=0
UPDATE stichera SET "order" = 0 WHERE id = 9065; -- the real Glory, Tone VI
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES (1793, 'aposticha', -1, 6, 'Stavrotheotokion',
  'Beholding Thee crucified, O Christ, * she who gave birth to Thee cried aloud: * "What is this strange mystery which I see, O my Son? * How is it that Thou diest, * suspended in the flesh upon the Tree, ** O Bestower of life?"',
  '', 'stSergius', 'stavrotheotokion');

-- ── 10-11 ─────────────────────────────────────────────────────────────────
UPDATE stichera SET group_role = 'stavrotheotokion' WHERE id = 9251;
DELETE FROM stichera WHERE id IN (9252, 9253);   -- frees order=0
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES (2095, 'lordICall', -1, 6, 'Theotokion',
  'Having stumbled * because of mine evil disposition, * and been enslaved to wicked deception, O Bride of God, * wretch that I am, I flee to thine all-wondrous loving-kindness * and thy fervent aid, * O most holy maiden. * Deliver me from the bonds of temptations and grief, * O most immaculate one, * and save me from the assaults of the demons, * that I may glorify thee, * and hymn and bow down before thee with love, ** magnifying thee, O Sovereign Lady, as ever-blessed.',
  '', 'stSergius', NULL);

COMMIT;
