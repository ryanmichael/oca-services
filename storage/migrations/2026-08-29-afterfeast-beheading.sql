-- N2 step 3: the Afterfeast of the Beheading of the Forerunner (August 30).
--
-- orthocal does not list this window at all, so the commemoration has to come
-- from oca.db. `reference/orders/2026-0830-order-services.txt` names it in the
-- header and appoints the Forerunner's troparion (Tone 2) at Vespers and the
-- Liturgy, and his kontakion (Tone 5) at the Liturgy.
--
-- Template: commemoration 1573, Afterfeast of the Transfiguration.
-- Hymns are copied from commemoration 1756 (the feast itself, August 29),
-- in BOTH pronoun registers, preserving each row's `source`.
BEGIN;

INSERT INTO commemorations (month, day, rank, title, oca_slug, tone, saint_type)
VALUES (8, 30, '', 'Afterfeast of the Beheading of the Holy Glorious Prophet, Forerunner, and Baptist John', '', NULL, '');

INSERT INTO troparia (commemoration_id, type, tone, text, pronoun, source)
SELECT (SELECT id FROM commemorations
        WHERE month=8 AND day=30 AND title LIKE 'Afterfeast of the Beheading%'),
       type, tone, text, pronoun, source
FROM troparia
WHERE commemoration_id = 1756;

COMMIT;
