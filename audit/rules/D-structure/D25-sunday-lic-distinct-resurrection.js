'use strict';

// Sunday Great Vespers "Lord, I Call" — the number of DISTINCT resurrectional
// stichera must reach the count the OCA Order of Services appoints.
//
// Discovered 2026-11-25 reviewing the St John of Damascus (Tyler) packet for
// Great Vespers 2026-11-28 (content 11-29, Tone 1, Martyr Paramon). The order
// reads "7 stichera of the Resurrection, Tone 1 / 3 stichera of St. Paramon /
// Glory… now and ever… Dogmatic Theotokion", and the sheet numbers the Tone 1
// block 10-4 ending on "Let us praise the Word, coeternal with the Father".
// We rendered six: the OCA base padded the seventh slot by singing "Accept our
// evening prayers" TWICE, and Tyler (licNoLeadingRepeat) sang six and nine in
// all. The seventh text sat in the tone's `glory` node, sung at Glory instead.
//
// WHY D21 DID NOT CATCH IT: D21 counts resurrectional hymns by LABEL, so the
// doubled first sticheron counted as the seventh and the base read 7 = 7. A
// repeat is not a sticheron. This rule counts distinct texts.
//
// The fix is per tone (`_alsoNumberedSticheron` in variable-sources/
// octoechos.json, plus for-date.js promoting it when the order asks for more
// than the tone publishes). Tones 4 and 8 (2026-10-24, 2026-08-02) and Tone 1
// (2026-11-25) are verified against Tyler sheets; Tone 5 publishes seven.
// The rest are NOT verified — and Tone 3's doxastichon is Glory-framed ("we
// offer our evening song"), so promoting it would be wrong — so they are a
// documented SOURCE gap here, not a structural finding. Remove a tone from
// this map only with a packet in hand (memory
// project_lic_seventh_resurrection_sticheron).
const KNOWN_SOURCE_GAPS = {
  2: 'Tone 2 7th resurrectional sticheron unverified against a parish sheet',
  3: 'Tone 3 doxastichon is Glory-framed; the 7th needs the 4th Anatolikon sourced',
  6: 'Tone 6 7th resurrectional sticheron unverified against a parish sheet',
  7: 'Tone 7 7th resurrectional sticheron unverified against a parish sheet',
};

const { orderResurrectionCount } = require('../../../server-lib/sources/order-of-services');

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resurrectional numbered stichera rendered at Lord I Call: { distinct, total, tone }. */
function resurrectional(blocks) {
  const texts = [];
  let tone = null;
  for (const b of blocks) {
    if ((b.section || '') !== 'Lord, I Have Cried') continue;
    // Numbered stichera end at "Glory…". A resurrectional text sung UNDER the
    // Glory is a doxastichon, not a sticheron of the count — counting it is
    // exactly how 11-29 passed while singing six (falsified 2026-11-25).
    if (b.type === 'doxology') break;
    if (b.type !== 'hymn') continue;
    const label = b.label || '';
    if (/theotokion|dogmatik/i.test(label)) continue;
    if (!/resurrection/i.test(label)) continue;
    texts.push((b.text || '').replace(/\s+/g, ' ').trim());
    tone = tone ?? b.tone ?? null;
  }
  return { distinct: new Set(texts).size, total: texts.length, tone };
}

module.exports = {
  id:             'D25-sunday-lic-distinct-resurrection',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Great Vespers Lord-I-Call sings as many DISTINCT resurrectional stichera as the OCA order appoints — a repeated sticheron does not count. Added 2026-11-25 after 2026-11-29 rendered six (the base doubling the first) where the order appoints seven.',
  needsAssembled: true,

  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    const d = new Date(`${ctx.date}T12:00:00Z`);
    if (d.getUTCDay() !== 6) return false;
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    return orderResurrectionCount(sunday) !== null;
  },

  check: (ctx) => {
    const d      = new Date(`${ctx.date}T12:00:00Z`);
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    const want   = orderResurrectionCount(sunday);
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const { distinct, total, tone } = resurrectional(blocks);
    // A Great Feast on a Sunday replaces the resurrectional set; nothing to compare.
    if (total === 0) return [];
    if (distinct >= want) return [];
    if (tone != null && KNOWN_SOURCE_GAPS[tone]) return [];

    return [{
      message: `Sunday ${sunday} (Tone ${tone}) Lord-I-Call sings ${distinct} distinct resurrectional stichera`
             + `${total !== distinct ? ` (${total} with repeats)` : ''}; the OCA order appoints ${want}.`,
      hint:    `reference/orders/${sunday.slice(0, 4)}-${sunday.slice(5, 7)}${sunday.slice(8)}-order-services.txt. `
             + `If the tone's \`glory\` text is a numbered sticheron, flag it \`_alsoNumberedSticheron\` in `
             + `variable-sources/octoechos.json (with a parish sheet as evidence); if the Menaion took the slots, see D21.`,
    }];
  },
};
