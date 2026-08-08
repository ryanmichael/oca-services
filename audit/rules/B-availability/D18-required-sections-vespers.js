'use strict';

// Vespers skeleton — the sections that must be present on every Vespers, Great
// or Daily.
//
// WHY THIS EXISTS. Liturgy has L5 and Sunday Matins has M1, but Vespers had NO
// required-sections rule at all. That mattered because roughly a dozen Vespers
// rules open with `if (!blocks.length) return []` — a reasonable early exit ONLY
// when something else reports the section missing. With nothing behind them, an
// entire Vespers section could vanish and the audit would stay green: every rule
// that cared would quietly decline to run.
//
// That is the same shape of blind spot that let the Sunday Matins prokeimenon
// render empty on 15 of 51 Sundays (see d85e3a3 and M14's absence check).
//
// The list is DERIVED, not guessed: it is the intersection of section labels
// across all 365 days of 2026, so it holds for Great Vespers, Daily Vespers,
// Lenten weekdays and the Pentecostarion alike. Anything that varies by season
// or rank — Kathisma, The Entrance, Aposticha, Troparia, Little Litany — is
// deliberately absent, because a rule that fires on legitimate variation gets
// suppressed and then protects nothing.
const REQUIRED = [
  'Opening',
  'Psalm 103',
  'The Peace Litany',
  'Lord, I Have Cried',
  'Gladsome Light',
  'Evening Prokeimenon',
  'Vouchsafe, O Lord',
  'Litany of Completion',
  'Nunc Dimittis',
  'Litany of Fervent Supplication',
  'Dismissal',
];

module.exports = {
  id:             'D18-vespers-required-sections',
  family:         'availability',
  severity:       'high',
  description:    'Vespers must include the skeleton sections common to every form.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    // Unlike the rules this backstops, an EMPTY render is itself the failure —
    // do not return clean on it.
    if (!blocks.length) {
      return [{
        message: 'Vespers rendered no blocks at all.',
        hint:    'The assembler produced an empty service; check the calendar entry for this date.',
      }];
    }

    // Vesperal Liturgy and Kneeling Vespers are served through their own
    // endpoints and assemblers with different skeletons; they are audited by the
    // V*/HW* rules, not this one.
    const name = ctx.assembled?.serviceName || '';
    if (/Vesperal Liturgy|Kneeling/i.test(name)) return [];

    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED.filter(s => !present.has(s));
    if (!missing.length) return [];
    return [{
      message: `Vespers missing required section(s): ${missing.join(', ')}.`,
      hint:    'A load-bearing section was dropped before render. Check assembleVespers and the '
             + 'service-structure spec for the branch this date took (Great vs Daily, Lenten, Pentecostarion).',
    }];
  },
};
