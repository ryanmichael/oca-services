-- Add Synaxis of All Saints of North America aposticha doxastichon (Tone 4)
-- and saint-specific Theotokion (Tone 5) under commemoration_id 1196.
-- Verbatim from OCA Service Book for 2026-06-14 (files.oca.org/service-texts).
-- order=0 follows the existing convention for aposticha glory doxastichon;
-- order=-1 is the new convention for the saint-specific aposticha Theotokion,
-- consumed by the assembler in server-lib/assemble/for-date.js when
-- isSaturdayInjection && !isGreatFeast.

BEGIN TRANSACTION;

INSERT INTO stichera (commemoration_id, "order", section, tone, label, text, source) VALUES
(1196, 0, 'aposticha', 4, 'Synaxis of the Saints of North America',
'Today, as we celebrate the memory of all the Saints of North America,
let us praise them as is fitting,
for they lived all of Christ''s beatitudes.
Deprived of material wealth, they became rich in spirit;
meek, they inherited the earth;
mourning, they were comforted;
thirsting for righteousness, they were satisfied;
merciful, they obtained mercy;
pure in heart, they beheld the image of God;
as peacemakers, they became God''s children;
persecuted and tortured for righteousness'' sake, they now rejoice in heaven;//
and they pray fervently to the Lord that He may have mercy on our souls.',
'oca-feast');

INSERT INTO stichera (commemoration_id, "order", section, tone, label, text, source) VALUES
(1196, -1, 'aposticha', 5, 'Synaxis of the Saints of North America',
'Let us sound a hymn on the trumpet
and praise with one accord the Protectress of our land,
our Queen, the Theotokos:
Rejoice, for thou hast crowned our land with thy favor,
pouring abundant grace upon it!
Therefore, the Church in America joyously celebrates thy precious protection
and commemorates the multitude of thy miracles.
And now deprive us not of thy mercies, O Lady!
Look with favor upon us in our adversities and afflictions//
and raise us up by thy powerful intercession!',
'oca-feast');

COMMIT;
