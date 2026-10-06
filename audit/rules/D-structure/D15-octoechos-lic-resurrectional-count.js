'use strict';

// Sunday Great Vespers must sing every resurrectional sticheron it holds.
//
// ── WHY THIS RULE WAS REWRITTEN (2026-10-06) ─────────────────────────────────
//
// Its first form could not fire. Four reasons, stacked:
//
//   * `appliesTo: ctx.date === '2026-01-01'` — it ran on ONE date a year.
//   * `needsAssembled: false` — it asserted the SOURCE FILE held >= 7 hymns per
//     tone and never looked at a rendered page, so it could not see whether any
//     of them reached the choir.
//   * `KNOWN_SOURCE_GAPS` listed all 8 tones, making the guard
//     `hymns.length < 7 && !KNOWN_SOURCE_GAPS[t]` false for every tone.
//   * The source is in fact short — 6 per tone, 7 for tone 5 — so the condition
//     it was written to catch was live and permanently suppressed.
//
// It returned `[]` by construction, every run, for as long as it existed.
//
// Meanwhile 22 of the 34 ordinary-time Sunday Great Vespers of 2026 were
// rendering FOUR resurrectional stichera where the Octoechos holds six or seven,
// because the Menaion was taking 5-7 slots and the Resurrection got the
// remainder. On 2026-07-11 the choir director's own packet prints the three we
// drop ("We glorify the Leader of our salvation", "The guards were instructed by
// the lawless ones", "O Lord, Thou hast captured hell"). That is the
// sunday-lic-appointed-split class, recurring on dates it was never measured on.
//
// ── WHAT IT ASSERTS NOW ──────────────────────────────────────────────────────
//
// The RENDERED count, against what we actually hold:
//
//     rendered resurrectional  >=  min(APPOINTED, hymns available for that tone)
//
// Two failures are kept apart, because they have different owners:
//
//   * rendered < available  — OUR bug. We hold the hymn and did not sing it.
//                             This is what the rule gates on.
//   * available < APPOINTED — a SOURCE gap. The OCA Octoechos pattern is 3
//                             Resurrectional + 4 Anatolika = 7, and we hold 6 for
//                             seven of the eight tones. Reported as a hint, never
//                             as a failure, because no change to our code fixes it.
//
// Counting is by the structural label, not by position or by `source` alone: an
// octoechos-sourced LIC block may be the Dogmatikon ("Theotokion — Dogmatikon"),
// which is not resurrectional. Counting `source === 'octoechos'` inflated every
// date by one and made 2026-07-11 read as 5 of 7 when it is 4 of 7.

const path = require('path');

// OCA Octoechos pattern for Sat-eve Great Vespers: 3 Resurrectional + 4
// Anatolika fill LIC verses 10..4; verses 3..1 plus the Glory go to the saint.
const APPOINTED = 7;

// The moveable books supply the Lord-I-Call stichera in their own seasons, so
// the Octoechos resurrectional set is legitimately absent or reduced. Without
// this guard the rule reports 18 extra Sundays — the Triodion and Pentecostarion
// doing exactly what they should.
const MOVEABLE_SEASONS = new Set([
  'preLenten', 'greatLent', 'holyWeek', 'brightWeek', 'pentecostarion',
]);

function availableForTone(tone) {
  try {
    const octoechos = require(
      path.resolve(__dirname, '..', '..', '..', 'variable-sources', 'octoechos.json'));
    const hymns = octoechos[`tone${tone}`]?.saturday?.vespers?.lordICall?.resurrectional?.hymns;
    return Array.isArray(hymns) ? hymns.length : 0;
  } catch (_) { return 0; }
}

module.exports = {
  id:             'D15-octoechos-lic-resurrectional-count',
  family:         'structure',
  // `medium` while the 22-date backlog this rule just exposed is paid off. The
  // split fix that clears it raises this to `high` deliberately, in the same
  // commit — the pattern features/translation-mix.md records for D23.
  severity:       'medium',
  description:    'Sunday Great Vespers sings every resurrectional LIC sticheron the Octoechos holds for its tone (min of 7 appointed and what we hold). [rewritten 2026-10-06 — the first form could not fire]',
  needsAssembled: true,

  // The API date is the civil evening, so Saturday opens Sunday. `civilDow` is
  // a NAME ('saturday'), not a JS day number — `=== 6` matched nothing and the
  // rule ran zero checks, which the sweep's new coverage guard caught on the
  // first run rather than reporting as a clean year.
  appliesTo: (ctx) => ctx.service === 'vespers' && ctx.civilDow === 'saturday',

  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const season = ctx.assembled?.season || ctx.season;
    if (MOVEABLE_SEASONS.has(season)) return [];

    // Only a festal Sunday Vespers carries the resurrectional set at all.
    if (!/Great Vespers|Vigil/i.test(String(ctx.assembled?.serviceName || ''))) return [];

    const tone = ctx.assembled?.tone || ctx.tone;
    if (!tone) return [];

    const lic = blocks.filter(b =>
      b.section === 'Lord, I Have Cried' && b.type === 'hymn');
    if (!lic.length) return [];

    // By LABEL, not by source: the Dogmatikon is octoechos-sourced and is not
    // one of the resurrectional stichera.
    const rendered = lic.filter(b =>
      b.source === 'octoechos' && /^Resurrectional$/i.test(String(b.label || ''))).length;
    const menaion  = lic.filter(b => b.source === 'menaion').length;

    const available = availableForTone(tone);
    if (!available) return [];
    const expected = Math.min(APPOINTED, available);

    if (rendered >= expected) return [];

    const sourceShort = available < APPOINTED
      ? ` (the Octoechos pattern appoints ${APPOINTED}; we hold only ${available} for this tone — ` +
        'a separate source gap, not what this finding is about)'
      : '';

    return [{
      message: `Sunday Great Vespers sings ${rendered} resurrectional sticheron(a) at ` +
               `Lord I Call, but the Octoechos holds ${available} for Tone ${tone}; ` +
               `the Menaion took ${menaion} slots.`,
      hint: 'The Resurrection is receiving the REMAINDER after the Menaion is ' +
            'allocated, rather than its appointed share first. See ' +
            'features/sunday-lic-appointed-split.md. Verified against the choir ' +
            `director's packet for 2026-07-11, which prints the stichera we drop.${sourceShort}`,
    }];
  },
};
