-- 9-13: Forefeast of the Elevation (comm 1880) / Founding of the Church of the
-- Resurrection (1881) / Hieromartyr Cornelius (1882).
--
-- Reviewed 2026-09-13 against the Tyler 09.12.26 Great Vespers packet and the
-- OCA order (reference/orders/2026-0913-order-services.txt). The scraper had
-- glued the entire 2024-09-13 weekday text onto comm 1880:
--
--   * Aposticha stichera 2 and 3 ("Rejoice, O Cross of the Lord" / "Rejoice, O
--     guide of the blind") and the Glory ("We glorify Thee, O Lord", Tone 2,
--     Anatolius, for the Founding) were SKIPPED; the Now-and-ever ("The Cross
--     of the Giver of life", Tone 2) sat at order 2 as if it were a numbered
--     sticheron.
--   * The Vespers troparia block was glued into the aposticha as rows
--     7801-7803, with the Cornelius troparion at the Glory slot (order 0) — so
--     Saturday-eve Vespers sang a troparion labelled "Forefeast" at "Glory…"
--     and the Octoechos Theotokion at "Now…" where the order appoints the
--     Founding doxastichon and the Forefeast sticheron.
--   * The three Cornelius Lord-I-Call stichera (7793-7795) were keyed to the
--     Forefeast; comm 1882 meanwhile carried a Lambertsen fill (10386-10392)
--     that duplicates BOTH the Founding stichera and the Cornelius ones.
--
-- Target shape (OCA order, Saturday eve): Lord I Call = 4 Resurrection +
-- 3 Founding (Tone 6) + 3 Forefeast "from the Vespers Aposticha" (Tone 5);
-- Glory Founding (Tone 6); Now Dogmatikon. Aposticha = Resurrection; Glory
-- Founding (Tone 2); Now Forefeast (Tone 2). The assembler reads the
-- PRINCIPAL's rows only (for-date.js: sticheraData[0]), so the Founding and
-- Forefeast hymns stay on 1880 and only Cornelius moves to his own row. The
-- Tone-5 "Rejoice" stichera live at aposticha 1-3 (their home) AND at
-- lordICall 4-6: Daily Vespers caps Lord I Call at 3, so slots 4-6 are only
-- ever sung on a Saturday eve — exactly when the order borrows them.
--
-- Source texts: reference/scrape/2024-09-13.docx (OCA DLMT).
-- Backup: storage/oca.db.bak.2026-09-13-0913
BEGIN;

-- ── Drop the glued troparia (they live in the troparia table already) ─────
DELETE FROM stichera WHERE id IN (7801, 7802, 7803);

-- ── Aposticha on 1880 ────────────────────────────────────────────────────
-- Now-and-ever: Forefeast, Tone 2 (was numbered as order 2).
UPDATE stichera SET "order" = -1 WHERE id = 7800;
-- Sticheron 1: re-space the scraper-glued text.
UPDATE stichera SET text =
  'Rejoice, O life-bearing Cross: invincible triumph of godliness, gate of Paradise, and protection of the faithful! The Cross is the might of the Church, through which corruption is abolished, through which the power of death is crushed, and we are raised from earth to heaven. O invincible weapon, the adversary of demons, the glory of martyrs, the true adornment of ven’rable saints, and the haven of salvation,' || char(10) || 'which grants the world great mercy.'
  WHERE id = 7799;
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source)
VALUES
  (1880, 'aposticha', 2, 5, '(for the Forefeast)',
   'Rejoice, O Cross of the Lord, through which mankind has been delivered from the curse! Thou art a sign of true joy, shattering our enemies by thine Exaltation. O Cross, worthy of all honor, thou art our help, thou art the strength of kings. Thou art the power of the righteous. Thou art the majesty of priests. All who sign themselves with thee are freed from danger. O rod of strength, under which we like sheep are tended, thou art a weapon of peace round which the angels stand in fear. Thou art the divine glory of Christ,' || char(10) || 'Who grants the world great mercy.',
   '2024-09-13', 'oca-menaion'),
  (1880, 'aposticha', 3, 5, '(for the Forefeast)',
   'Rejoice, O guide of the blind, physician of the sick and resurrection of all the dead; thou hast raised us up when we were fallen into mortality, O precious Cross! Through thee corruption has been destroyed, and incorruption has blossomed forth. We mortals are made divine, and the devil is completely overthrown. Today, as we see thee exalted by the hands of bishops, we exalt Him Who was lifted up upon thee, and we fall down in worship before thee,' || char(10) || 'drawing rich streams of great mercy.',
   '2024-09-13', 'oca-menaion'),
  (1880, 'aposticha', 0, 2, '(for the Founding, by Anatolius)',
   'We glorify Thee, O Lord, as we celebrate the dedication of the most holy temple of Thy Resurrection. Thou didst sanctify it and perfect it with Thine all-perfect grace. Thou art adorned in it by the faithful with sacrifices that are sanctifying, mystical and holy, receiving them bloodless and all-pure from the hands of Thy servants. To all those who rightly make offering,' || char(10) || 'Thou dost give great mercy and cleansing from sins.',
   '2024-09-13', 'oca-menaion');

-- ── Lord I Call on 1880 ──────────────────────────────────────────────────
-- Weekday Now-and-ever: Forefeast, Tone 6 (was numbered as order 7).
UPDATE stichera SET "order" = -1 WHERE id = 7796;
-- Cornelius' three stichera go to his own commemoration (orders 1-3 there),
-- replacing the Lambertsen fill, which duplicated the Founding stichera under
-- the wrong saint and the Cornelius stichera in a second translation.
DELETE FROM stichera WHERE id IN (10386, 10387, 10388, 10389, 10390, 10391, 10392);
UPDATE stichera SET commemoration_id = 1882, "order" = 1 WHERE id = 7793;
UPDATE stichera SET commemoration_id = 1882, "order" = 2 WHERE id = 7794;
UPDATE stichera SET commemoration_id = 1882, "order" = 3 WHERE id = 7795;
-- Slots 4-6: the Forefeast stichera the Saturday-eve order borrows from the
-- Aposticha (Tone 5).
INSERT INTO stichera (commemoration_id, section, "order", tone, label, text, source_date, source)
SELECT 1880, 'lordICall', "order" + 3, tone, '(for the Forefeast, from the Aposticha)', text, source_date, source
  FROM stichera WHERE commemoration_id = 1880 AND section = 'aposticha' AND "order" IN (1, 2, 3);

COMMIT;
