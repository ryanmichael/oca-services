-- N1, date 1-30 (the Three Hierarchs) — the last of the fifteen, and the one
-- that does not fit the pattern.
--
-- Its rows are `oca-menaion`, not `stSergius`: this date came from the OCA
-- scrape. The St Sergius page for 01-30 also carries a full LITTLE Vespers
-- before Great Vespers, which is why its structure never lined up with the
-- other fourteen.
--
-- comm 231 aposticha held: order=1 the first Great Vespers sticheron (Tone I),
-- order=2 the "Both now ..., of the coming feast" (Tone II, the Meeting), and
-- order=0 the concluding troparion. So the Both-now was being sung as a numbered
-- sticheron and a troparion was being sung as the Glory.
--
-- Minimal repair only: drop the troparion and put the Both-now in its own slot.
-- The two missing Tone I stichera and the Tone II Glory are NOT inserted from
-- St Sergius — mixing a second translation into an oca-menaion section is
-- exactly what the `Stichera source-mixing` drift rule exists to catch. They
-- must come from the OCA source. Logged as N16.
--
-- 6971's text ("As sharers of the Apostles' life and character and teachers of
-- the universe") appears NOWHERE else in the corpus — checked against comm 231's
-- own troparion 37216 (a different hymn) and corpus-wide; the nearest match,
-- troparia 38846, is Peter and Paul's "First-enthroned of the apostles".
-- UNIQUE(commemoration_id, type, pronoun) blocks adding it beside 37216, so
-- audit/misparsed-troparia-rows.json is currently its only home. See N16.
BEGIN;

DELETE FROM stichera WHERE id = 6971;          -- frees order=0
UPDATE stichera SET "order" = -1 WHERE id = 6970;

COMMIT;

-- ── Follow-up, same day ──────────────────────────────────────────────────
-- The minimal repair above made 1-30 WORSE in the render: the menaion aposticha
-- branch in for-date.js is wholly gated on a Glory existing, so deleting the
-- troparion at order=0 skipped the block, left one sticheron to be repeated
-- three times, and made the Both-now at order=-1 unreachable.
--
-- So the two missing Tone I stichera and the Tone II Glory are supplied after
-- all, from St Sergius. The source-mixing concern noted above is real and is
-- checked by `drift:check` after this migration; the alternative — a section
-- that sings its first hymn three times and drops the Both-now — is plainly
-- worse than a section in two translations.
BEGIN;

INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES
 (231, 'aposticha', 2, 1, 'the hierarchs',
  'As is meet, let us praise with hymns * the foundations of the Faith, * the godly and vigilant minds, * the most radiant rivers of golden streams and the honored luminaries, * the champions of the Trinity, * the receptacles of the grace of the Spirit, * the unshakeable pillars, ** the confirmation of the Church.',
  '', 'stSergius', NULL),
 (231, 'aposticha', 3, 1, 'the hierarchs',
  'O thrice-blessed Basil, * divinely wise Gregory * and most golden and honored John, * ye instruments of the Spirit, * trumpets of the divine thunder, * lightning-flashes of preaching, most radiant beacons, * rendered golden and luminous by God: ** entreat Christ, that He save those who honor you.',
  '', 'stSergius', NULL),
 (231, 'aposticha', 0, 2, 'the hierarchs',
  'Today are the souls of mortals borne up on high from earthly things; today do they become heavenly on the day of the saints'' commemoration; for the gates of heaven are opened, and the words of the Master are spoken unto us. Words proclaim the Word, and tongues hymn His wonders. And we cry out to the Savior: Glory to Thee, O Christ God, for through them hath peace been given to the faithful!',
  '', 'stSergius', NULL);

COMMIT;
