-- N1, the last four dates: 10-15, 10-22, 11-04, 11-07.
--
-- All four are the now-familiar overrun. Deletions were checked against each
-- commemoration's OWN troparia rather than by text search — a substring match
-- reported "not found anywhere" for five of these eight rows and was wrong on
-- every one of them, because the corpus holds the same hymn in a different
-- translation. Examples: 9273 "In thee, O father, the image of God was
-- preserved" is comm 2127's troparion "The image of God was truly preserved in
-- thee, O Father"; 9377 "With prayerful vigils and outpourings of thy tears" is
-- comm 2293's "Thou didst water thy pillar with prayerful vigils".
BEGIN;

-- ── 10-15, comm 2127 (Ven. Euthymius the New), aposticha ─────────────────
-- Source: "On the Aposticha, Glory ..., in Tone V" then "Both now ...,
-- Theotokion, or this Stavrotheotokion, in Tone V". The Glory sat one slot low.
DELETE FROM stichera WHERE id IN (9273, 9274);
UPDATE stichera SET "order" = 0 WHERE id = 9272;
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES (2127, 'aposticha', -1, 5, 'Stavrotheotokion',
  'Upon seeing her Lamb hastening to the slaughter * the Ewe-lamb eagerly followed Him crying aloud: * "Whence goest Thou, O my sweetest Child? * O most beloved Jesus, * sinless Lord, rich in mercy, * O longsuffering Christ, * why dost Thou so swiftly and so fearlessly proceed? * Speak to me Thy handmaiden, * O my well-beloved Son: * pass not by me, Thy Mother, without a word, * O all-compassionate God, ** who grantest the world great mercy."',
  '', 'stSergius', 'stavrotheotokion');

-- ── 10-22, comm 2180 (St Averkios), Lord-I-Call ──────────────────────────
-- The source gives no Glory of the saint here, so order=0 is correctly left
-- empty; only the "Both now ..., Theotokion, or this Stavrotheotokion, in
-- Tone III" was missing.
DELETE FROM stichera WHERE id IN (9304, 9305);
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES (2180, 'lordICall', -1, 3, 'Stavrotheotokion',
  'A sword pierced thy heart, O most pure one, * when thou didst behold thy Son upon the Cross; * whereupon thou didst cry aloud: * "Show me not to be childless, O my Son and my God, ** Thou Who hast kept me a Virgin even after I gave birth!"',
  '', 'stSergius', 'stavrotheotokion');

-- ── 11-04, comm 2273, aposticha ──────────────────────────────────────────
-- Source: Octoechos stichera, "and Glory ..., in Tone VIII" (of Ven.
-- Joannicius), then the Stavrotheotokion in the same tone.
DELETE FROM stichera WHERE id IN (9351, 9352);
UPDATE stichera SET "order" = 0 WHERE id = 9350;
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES (2273, 'aposticha', -1, 8, 'Stavrotheotokion',
  'Beholding Thee O Lord Jesus, * nailed upon the cross and voluntarily accepting the passion, * the Virgin Mother cried aloud: * Woe is me, O my sweet Child! * how dost Thou wrongfully endure such wounds? * O compassionate Physician * and healer of the infirmities of mankind, * Thou hast redeemed all from corruption ** by Thy tender compassion.',
  '', 'stSergius', 'stavrotheotokion');

-- ── 11-07, comm 2292 (33 Martyrs of Melitene), Lord-I-Call ───────────────
-- The Stavrotheotokion (9378) is already correctly at order=-1 and tagged; only
-- the two swallowed troparia need removing.
DELETE FROM stichera WHERE id IN (9376, 9377);

COMMIT;
