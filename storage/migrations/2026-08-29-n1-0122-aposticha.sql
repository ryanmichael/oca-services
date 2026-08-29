-- N1, date 1-22: repair the Apostle Timothy aposticha.
--
-- Source: https://st-sergius.org/services/Emenaion/01-22.pdf, "AT VESPERS".
-- The source prints ONE proper sticheron (Tone I, "Come, ye people, let us hymn
-- the apostle Timothy"), then
--   Glory ..., in Tone II                        — "O Christ, Thou didst magnify
--     the power of the precious Cross..." (of the Martyr Anastasius the Persian)
--   Both now ..., Theotokion, or this Stavrotheotokion in Tone II
--     — "Having endured many pangs during the crucifixion of thy Son..."
-- and THEN the concluding troparia, which the parser swallowed: the apostle's
-- troparion landed at order=2 and the martyr's Glory-troparion at order=0.
--
-- Removed rows preserved in audit/misparsed-troparia-rows.json. Both texts
-- confirmed still available before deleting:
--   8319 "Learning goodness..."  — comm 165 already holds this troparion as
--        37099, "Having learned goodness and maintaining continence in all
--        things" (Tone 4). A different translation of the same hymn; a naive
--        substring search misses it, so it was checked against the
--        commemoration's own troparia directly.
--   8320 "...Thy martyr Anastasius" — comm 166 (Monastic Martyr Anastasius the
--        Persian) holds it as troparion 37103, Tone 4.
--
-- The Both-now is explicitly offered as an ALTERNATIVE stavrotheotokion, so it
-- is tagged group_role='stavrotheotokion'. for-date.js deliberately skips those
-- when choosing a Saturday Now-and-ever (a stavrotheotokion belongs to Wed/Fri),
-- and that guard only works if the row is tagged.
BEGIN;

DELETE FROM stichera WHERE id IN (8319, 8320);

INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source, group_role)
VALUES
 (165, 'aposticha',  0, 2, 'the martyr',
  'O Christ, Thou didst magnify the power of the precious Cross in Judea and in Babylon, for because of it they came to know the feast of Thy life-creating resurrection: And now the right laudable and glorious athlete Anastasius, a martyr of countless miracles, hath become for them a liberator from the captivity and the madness of idolatry, joining chorus with the angels and praying on behalf of our souls.',
  '', 'stSergius', NULL),
 (165, 'aposticha', -1, 2, 'Stavrotheotokion',
  'Having endured many pangs during the crucifixion of thy Son and God, O most pure one, thou didst groan, weeping and crying aloud: "Woe is me, O my sweet Child! How is it that thou sufferest unjustly, desiring to deliver the mortal descendents of Adam?" Wherefore, O most pure Virgin, we entreat thee with faith: Render Him merciful unto us!',
  '', 'stSergius', 'stavrotheotokion');

COMMIT;
