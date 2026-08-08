'use strict';

const cal = require('../../../calendar-rules.js');

// On a Vigil- or Polyeleos-rank saint that falls on a weekday (i.e. not Sunday
// and not one of the 12 Great Feasts which take their own dedicated branch),
// OCA practice is to SUPPRESS the daily-cycle propers and use only the saint's:
//
//   - Prokeimenon: saint's prokeimenon only — no Monday "angels", Tuesday
//     "Forerunner", etc., daily prokeimenon.
//   - Alleluia: same.
//   - Communion Hymn (koinonikon): same.
//   - Epistle / Gospel: feast reading primary; daily reading dropped.
//
// This rule asserts the prokeimenon's PRIMARY REFRAIN doesn't match a known
// weekday-daily refrain. (Earlier version checked tone-equality only — false-
// positived on Prophet Elijah Monday because the prophet's gmp.prokeimenon
// happens to be Tone 4, the same as Monday's daily tone.)
//
// Discovered 2026-06-28 auditing 2026-06-29 (Mon, SS Peter and Paul).
//
// SAFETY NOTE: this rule deliberately does NOT fire when the saint's category
// has no General Menaion propers entry (Forerunner, Theotokos icons, generic
// synaxes). In those cases the builder falls back to the weekday daily cycle —
// that's a known data-gap, tracked separately under variable-sources/
// general-menaion-propers.json category coverage.

// Identifying fragments from the daily refrain text (variable-sources/
// prokeimena.json + alleluia.json). Matched case-insensitively against the
// first hymn block's text.
const DAILY_PROK_FRAGMENTS = {
  monday:    'His angels spirits',
  tuesday:   'The righteous shall rejoice',
  wednesday: 'My soul doth magnify the Lord',
  thursday:  'Their proclamation has gone out',  // apostles' Thursday daily (Ps 18)
  friday:    'Thou, O Lord, shalt keep us',      // intersects with prophet — disambiguated below
  saturday:  'Their souls shall dwell',
};

// Categories whose canonical propers SHARE text with a daily refrain.
// When the principal saint's title implies one of these categories, the
// "weekday daily" refrain match is actually the saint's own — not a bleed.
// Disambiguates collisions like Prophet's prokeimenon ↔ Friday daily.
const CATEGORY_REFRAIN_COLLISIONS = [
  { day: 'thursday', frag: 'Their proclamation has gone out', titleRe: /\bApostle/i },
  { day: 'friday',   frag: 'Thou, O Lord, shalt keep us',     titleRe: /\bProphet\b/i },
];

module.exports = {
  id:             'L25-weekday-feast-suppresses-daily-propers',
  family:         'structure',
  severity:       'high',
  description:    'Vigil/Polyeleos-rank weekday feast suppresses daily-cycle prokeimenon refrain.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow === 'sunday') return false;
    const rank = cal.getFeastRank(ctx.d);
    if (rank !== 'vigil' && rank !== 'polyeleos') return false;
    if (cal.getGreatFeastKey(ctx.d) !== null) return false;
    return true;
  },
  check: (ctx) => {
    const fragment = DAILY_PROK_FRAGMENTS[ctx.dow];
    if (!fragment) return [];
    const blocks = ctx.assembled?.blocks || [];
    const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    const first = prokHymns[0];
    if (!first || !first.text) return [];
    if (!first.text.toLowerCase().includes(fragment.toLowerCase())) return [];

    // Collision allowlist: if the principal saint's category legitimately
    // shares text with the daily refrain, the daily-bleed is actually the
    // saint's own proper, not a bug.
    //
    // `calendarEntry.commemoration` does not exist — the principal lives in
    // `commemorations[]`, flagged `isPrincipal` (or first). This read had always
    // resolved to '' , so the allowlist never once fired: every collision it was
    // written to excuse would have been reported as a bug. It went unnoticed
    // because no Apostle-on-Thursday date carried polyeleos rank until the
    // 2026-08-08 rank-coverage batch added 4-30 and 6-11. Same shape as the
    // M3/M14 escape hatches: a guard that cannot fire protects nothing.
    // Read from `assembled`, NOT `calendarEntry`. `generateCalendarEntry()`
    // returns commemorations: [] — the titles are attached later by the
    // assembler — so the raw entry has no principal at all.
    const comms = ctx.assembled?.commemorations || [];
    const principalTitle = (comms.find(c => c && c.isPrincipal) || comms[0] || {}).title || '';
    const collision = CATEGORY_REFRAIN_COLLISIONS.find(c =>
      c.day === ctx.dow && c.frag === fragment && c.titleRe.test(principalTitle));
    if (collision) return [];

    return [{
      message: `Weekday daily Prokeimenon refrain ("${fragment}…") emitted on a vigil/polyeleos-rank ${ctx.dow} feast. Saint's prokeimenon should replace it.`,
      hint:    'Check liturgy-from-orthocal.js isWeekdayGreatSaintFeast gating; ensure GENERAL_MENAION_PROPERS has an entry for the principal saint\'s category, or add a CATEGORY_REFRAIN_COLLISIONS entry if the saint legitimately shares the daily refrain.',
    }];
  },
};
