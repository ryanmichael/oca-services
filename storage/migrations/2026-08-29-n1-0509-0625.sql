-- N1, dates 5-09 and 6-25.
--
-- 5-09 (Prophet Isaiah + Martyr Christopher), comm 923. The source's Vespers
-- reads "Glory ..., Both now ..., from the Pentecostarion." — the Menaion
-- supplies NO Glory here — and then two concluding troparia. Both were swallowed:
-- the prophet's troparion landed at order=6 as a sixth sticheron and the martyr's
-- Glory-troparion at order=0. This date is therefore delete-only; leaving order=0
-- empty is correct, because the Pentecostarion owns that slot.
--   8563 "Celebrating the memory of Thy prophet Isaiah" — the generic prophet
--        troparion; present as troparia 38169 (5-1, Prophet Jeremiah) and in
--        general_menaion, which is the prophet-category fallback.
--   8564 "Arrayed in vesture dyed with thine own blood" — comm 924 holds it as
--        troparion 38246, "Adorned with garments woven from thine own blood".
--
-- 6-25 (Afterfeast of the Nativity of the Forerunner + Martyred Nun Febronia),
-- comm 1276. The source takes its numbered aposticha from the Octoechos and
-- gives one combined "Glory ..., Both now ..., in Tone VI" — "Elizabeth
-- conceived the forerunner of grace" — which was absent from the DB. Both
-- concluding troparia were swallowed in its place.
--   8737 "O prophet and forerunner of the coming of Christ" — troparia 38780 on
--        6-24, the very feast this is the afterfeast of.
--   8738 "Thy ewe-lamb Febronia" — comm 1276 holds it as troparion 38803,
--        "Thy lamb Febronia, calls out to Thee, O Jesus, in a loud voice".
--
-- Note 8737 was stored at Tone 6, inherited from the Glory it displaced; its own
-- rubric reads Tone IV. Same tone-scrambling seen on 1-13.
BEGIN;

DELETE FROM stichera WHERE id IN (8563, 8564, 8737, 8738);

-- 6-25: the combined Glory/Both-now the troparia had evicted.
-- Inserted at order=0. The source sings it at BOTH connectors, but the
-- assembler only sets combinesGloryNow for a Great Feast, so the Now still
-- falls to the Octoechos Theotokion here — recorded as N15 defect 4.
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES
 (1276, 'aposticha', 0, 6, 'the forerunner',
  'Elizabeth conceived the forerunner of grace, and the Virgin conceived the Lord of glory. Both mothers kissed each other, and the babe leapt up, for within her womb the servant praised the Master. And the mother of the forerunner marveled and cried aloud: "Whence is this to me, that the Mother of my Lord should come to me? May He Who hath great mercy save a despairing people!"',
  '', 'stSergius', NULL);

COMMIT;
