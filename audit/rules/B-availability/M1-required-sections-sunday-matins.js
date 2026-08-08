'use strict';

// Sunday Matins skeleton. If any of these sections is missing from the
// assembled output, the assembler has dropped a load-bearing piece (catches
// generator regressions and missing-builder cases).
//
// Extended 2026-08-08. The original seven left most of the service unguarded,
// and several Matins rules open with `if (!X.length) return []` — a safe early
// exit only when something else reports the section missing. Nothing did. The
// Matins Prokeimenon rendered EMPTY on 15 of 51 Sundays in 2026 and no rule
// noticed, because M14 also treated absence as not-applicable (see d85e3a3).
//
// The additions are derived from the intersection of section labels across all
// 51 non-Paschal Sundays of 2026, then filtered by hand: per-psalm labels
// ('Psalm 9'…'Psalm 23'), 'Kathisma 1'/'Kathisma 2' and the per-ode Little
// Litanies are deliberately EXCLUDED even though they held for all 51, because
// kathisma numbering and ode counts are season-dependent and pinning 2026's
// happens to be over-fitting. 'Polyeleios' is excluded for the same reason —
// its use is seasonal in principle, so enforcing it would enshrine current
// behaviour rather than a rubric.
const REQUIRED = [
  'Opening',
  'Six Psalms',
  'The Peace Litany',
  'God is the Lord',
  'Troparia',
  'Matins Prokeimenon',
  'Let Everything That Breathes',
  'Matins Gospel',
  'Psalm 50',
  'Canon',
  'Lauds',
  'Great Doxology',
  'Litany of Fervent Supplication',
  'Morning Litany',
  'Dismissal',
];

module.exports = {
  id:             'M1-sunday-matins-sections',
  family:         'availability',
  severity:       'high',
  description:    'Sunday Matins must include the standard skeleton sections.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins' && ctx.dow === 'sunday',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    // An empty render is itself the failure — this rule is the backstop for the
    // others, so it must not decline on absence.
    if (!blocks.length) {
      return [{
        message: 'Sunday Matins rendered no blocks at all.',
        hint:    'The assembler produced an empty service; check buildMatinsSpec for this date.',
      }];
    }
    // Pascha: /api/matins serves Paschal Matins (procession, paschal canon,
    // catechetical homily, no Six Psalms / Gospel / Lauds / Great Doxology).
    // The Sunday Matins skeleton doesn't apply.
    if (ctx.assembled?.serviceName === 'Paschal Matins') return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED.filter(s => !present.has(s));
    if (!missing.length) return [];
    return [{
      message: `Sunday Matins missing section(s): ${missing.join(', ')}`,
      hint:    'Check buildMatinsSpec / _buildSundayMatinsFromOctoechos for the relevant tone.',
    }];
  },
};
