'use strict';

// 9-13 Great Vespers (served 9-12 eve): Forefeast of the Elevation + Founding
// of the Church of the Resurrection. OCA order 2026-0913:
//   Lord I Call: 4 Resurrection / 3 Founding (Tone 6) / 3 Forefeast "from the
//                Vespers Aposticha" (Tone 5) / Glory Founding (Tone 6) /
//                Now Dogmatikon
//   OT readings: 3 Kings 8:22-23, 27-30 / Proverbs 3:19-34 / Proverbs 9:1-11
//   Aposticha:   Resurrection / Glory Founding (Tone 2) / Now Forefeast (Tone 2)
//   Troparia:    Resurrection / Glory Founding (Tone 4) / Now Forefeast (Tone 4)
//
// Before 2026-09-13 the scraper had glued the whole weekday text onto the
// Forefeast row: the Aposticha "Glory" was singing the CORNELIUS TROPARION,
// the Now was the Octoechos Theotokion, the Lord-I-Call slots 4-6 were
// Cornelius, no lessons rendered, and the Founding troparion was absent.
// Every rule passed. Positional assertions, keyed to the texts themselves.

const FOUNDING_LIC   = /^(Dedication is to be honored|Be dedicated anew|O Christ, the pre-eternal Word)/;
const FOREFEAST_LIC  = /^Rejoice, O (life-bearing Cross|Cross of the Lord|guide of the blind)/;
const FOUNDING_GLORY = /^Celebrating the memory of the dedication/;
const APOST_GLORY    = /^We glorify Thee, O Lord, as we celebrate the dedication/;
const APOST_NOW      = /^The Cross of the Giver of life/;
const TROP_FOUNDING  = /^Thou hast revealed the beauty of the holy dwelling place/;
const TROP_FOREFEAST = /^We offer in supplication/;

module.exports = {
  id:             'D22-founding-church-vespers',
  family:         'structure',
  severity:       'high',
  description:    '9-13 Great Vespers (9-12 eve) renders the Founding of the Church and the Forefeast of the Cross in the OCA order’s slots: LIC 3 Founding then 3 Forefeast, Founding at every Glory, Forefeast at the Aposticha and troparia Now, three OT lessons. Opened 2026-09-13.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers' && (ctx.date || '').slice(5) === '09-12',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const f = [];
    const hymns = sec => blocks.filter(b => b.section === sec && b.type === 'hymn');
    const dox   = sec => blocks.filter(b => b.section === sec && (b.type === 'hymn' || b.type === 'doxology'));

    // Lord I Call: the 3 Founding stichera, then the 3 Forefeast, then Glory Founding.
    const lic = hymns('Lord, I Have Cried');
    const fnd = lic.map((b, i) => FOUNDING_LIC.test(b.text) ? i : -1).filter(i => i >= 0);
    const fore = lic.map((b, i) => FOREFEAST_LIC.test(b.text) ? i : -1).filter(i => i >= 0);
    if (fnd.length !== 3 || fore.length !== 3 || Math.max(...fnd) > Math.min(...fore)) {
      f.push({ message: `Lord I Call: ${fnd.length} Founding + ${fore.length} Forefeast stichera (expected 3 + 3, Founding first). Positions: Founding ${fnd.join(',')}, Forefeast ${fore.join(',')}.`,
               hint: 'DB comm 1880 lordICall orders 1-3 (Founding) and 4-6 (Forefeast, Tone 5). See storage/migrations/2026-09-13-founding-forefeast-0913.sql.' });
    }
    if (fore.some(i => lic[i].tone !== 5)) f.push({ message: 'Forefeast Lord-I-Call stichera are not in Tone 5.' });
    const licSeq = dox('Lord, I Have Cried');
    const gIdx = licSeq.findIndex(b => b.type === 'doxology' && /^Glory to the Father/.test(b.text) && !/now and ever/i.test(b.text));
    if (gIdx < 0 || !FOUNDING_GLORY.test(licSeq[gIdx + 1]?.text || '')) {
      f.push({ message: 'Lord I Call Glory is not the Founding doxastichon "Celebrating the memory of the dedication…".' });
    }

    // OT lessons.
    const ot = blocks.filter(b => b.section === 'Old Testament Readings' && b.type === 'rubric' && /^(3 Kings 8|Proverbs 3|Proverbs 9)/.test(b.text || ''));
    if (ot.length !== 3) f.push({ message: `OT readings: ${ot.length} of 3 rendered (3 Kings 8 / Proverbs 3 / Proverbs 9).`,
                                  hint: 'vespers.otReadings in variable-sources/menaion/september-13.json; attachPolyeleosParemias in calendar/entry.js.' });

    // Aposticha: Glory Founding Tone 2, Now Forefeast Tone 2, in that order after the Resurrection stichera.
    const ap = dox('Aposticha');
    const apG = ap.findIndex(b => b.type === 'doxology' && /^Glory to the Father/.test(b.text) && !/now and ever/i.test(b.text));
    const apN = ap.findIndex(b => b.type === 'doxology' && /now and ever/i.test(b.text));
    if (apG < 0 || !APOST_GLORY.test(ap[apG + 1]?.text || '') || ap[apG + 1]?.tone !== 2) {
      f.push({ message: `Aposticha Glory is "${(ap[apG + 1]?.text || '').slice(0, 40)}" (Tone ${ap[apG + 1]?.tone}); expected "We glorify Thee, O Lord…" Tone 2.` });
    }
    if (apN < apG || !APOST_NOW.test(ap[apN + 1]?.text || '') || ap[apN + 1]?.tone !== 2) {
      f.push({ message: `Aposticha Now is "${(ap[apN + 1]?.text || '').slice(0, 40)}"; expected "The Cross of the Giver of life…" Tone 2.` });
    }
    if (hymns('Aposticha').some(b => /^By sharing in the ways of the Apostles/.test(b.text))) {
      f.push({ message: 'The Cornelius troparion is being sung as an Aposticha sticheron.' });
    }

    // Troparia: Resurrection / Glory Founding / Now Forefeast.
    const tr = dox('Troparia');
    const tG = tr.findIndex(b => b.type === 'doxology' && /^Glory to the Father/.test(b.text) && !/now and ever/i.test(b.text));
    const tN = tr.findIndex(b => b.type === 'doxology' && /now and ever/i.test(b.text));
    if (tG < 0 || !TROP_FOUNDING.test(tr[tG + 1]?.text || '')) f.push({ message: 'Troparia Glory is not the Founding troparion.' });
    if (tN < tG || !TROP_FOREFEAST.test(tr[tN + 1]?.text || '')) f.push({ message: 'Troparia Now is not the Forefeast troparion.' });
    return f;
  },
};
