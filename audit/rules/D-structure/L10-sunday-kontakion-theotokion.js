'use strict';

// Sunday Kontakia, post-2026-06-14 restructure (see features/sunday-kontakia-
// restructure.md): the section closes with a "Now and ever…" connector followed
// by a hymn. Normally that hymn is the Kontakion-Theotokion ("Protection of
// Christians that cannot be put to shame…"), but inside a feast window the
// Feast's own kontakion legitimately claims that slot and the Theotokion yields
// to it — see the OCA order for 2026-08-09, which prints
// "Now and ever… Kontakion of the Feast, Tone 7" and no Theotokion.
//
// The rule therefore checks the SHAPE (is there a Now-and-ever unit at all?)
// rather than the specific text. Both original regressions still fail: dropping
// the Theotokion outright leaves no Now-and-ever unit, and reverting to the old
// "saint kontakion last" shape leaves no connector either.
//
// Narrowed 2026-08-08 after 14667f0 taught the assembler about feast-window
// kontakia and this rule started firing on every afterfeast Sunday.
//
// Excluded: Pascha + Bright Week (paschal kontakion-only shape) and the few
// Lord's-feast Sundays that displace the Sunday template entirely (Palm
// Sunday, Pentecost — same list as L8). Also excluded: Lenten commemoration
// Sundays (weeks 1-5 of Great Lent), where OCA typikon combines the "Glory /
// Now and ever" connectors onto a single kontakion (Cross, Palamas, Climacus,
// Mary of Egypt, Orthodoxy) and does NOT append a separate Theotokion-
// Kontakion. See features/sunday-kontakia-restructure.md.

const { getWeekOfLent } = require('../../../calendar-rules');

module.exports = {
  id:             'L10-sunday-kontakion-theotokion',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Kontakia closes with a Kontakion-Theotokion rubric + hymn.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.isBrightWeek) return false;
    if (ctx.isPentecostarion) return false;          // paschal-cycle kontakia template differs
    if (ctx.daysSincePascha === 0)  return false;   // Pascha
    if (ctx.daysSincePascha === -7) return false;   // Palm
    if (ctx.daysSincePascha === 49) return false;   // Pentecost
    const week = getWeekOfLent(ctx.d);
    if (week === 1 || week === 2 || week === 3 || week === 4 || week === 5) return false;
    return true;
  },
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Kontakia');
    if (!blocks.length) return [];

    // The standard shape: an explicit Kontakion-Theotokion rubric.
    const hasTheotokion = blocks.some(b =>
      b.type === 'rubric' && /kontakion-theotokion/i.test(b.text || '')
    );
    if (hasTheotokion) return [];

    // Otherwise the section must still CLOSE with a "Now and ever…" connector
    // followed by a hymn — the feast-window case, where the Feast kontakion
    // holds the slot the Theotokion would.
    const nowIdx = blocks.findIndex(b =>
      b.type === 'doxology' && /^\s*Now and ever/i.test(b.text || '')
    );
    const hasHymnAfterNow = nowIdx !== -1
      && blocks.slice(nowIdx + 1).some(b => b.type === 'hymn' && (b.text || '').trim());
    if (hasHymnAfterNow) return [];

    return [{
      message: 'Sunday Kontakia does not close with a "Now and ever" unit — neither a ' +
               'Kontakion-Theotokion nor a feast-window kontakion follows the connector.',
      hint:    'See features/sunday-kontakia-restructure.md. Default Theotokion is "Protection of Christians" at Tone 6; ' +
               'inside a feast window the Feast kontakion takes that slot instead.',
    }];
  },
};
