-- N15: two aposticha Theotokion rows carry a rubric fragment at the head of the
-- sung text. Harmless while the weekday branch never read them; the moment it
-- does (same commit), a choir reads "; or this The unblemished heifer..." aloud.
--
-- Neither is caught by RUBRIC_BLEED_PATTERNS: "; or this" has no genre word and
-- "in the same tone:" is lower-case, where the existing pattern matches only the
-- Roman-numeral form "in Tone VIII:". Two more rows invisible to the rule — see
-- backlog N1/N4.
BEGIN;

-- 2-17, comm 360. "Both now ..., Theotokion, or this Stavrotheotokion in Tone
-- VIII:" — the parser kept the tail of the rubric. The hymn is plainly at the
-- Cross ("beholding her Bullock willingly nailed to the Tree"), so it is tagged
-- as a Stavrotheotokion: 2-17 is a Tuesday in 2026, not a Cross day, and the
-- tag is what makes the assembler skip it and fall back to the Octoechos.
UPDATE stichera
   SET text = replace(text, '; or this ', ''),
       group_role = 'stavrotheotokion'
 WHERE id = 8457;

-- 12-30, comm 2623. Nativity Theotokion; "in the same tone: " is the rubric.
-- Not a Stavrotheotokion, so it stands on any weekday.
UPDATE stichera
   SET text = replace(text, 'in the same tone: ', '')
 WHERE id = 9572;

COMMIT;
