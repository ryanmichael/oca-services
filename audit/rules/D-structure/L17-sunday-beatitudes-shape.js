'use strict';

// On Sundays the Third Antiphon (Beatitudes) is sung block-by-block: each
// Beatitude verse followed by a troparion or irmos from the Octoechos
// resurrection canon. The canonical Sunday shape produces ≥6 hymn-type
// blocks (the 8 Beatitudes blend with canon-derived troparia + theotokion).
// A regression that collapses Beatitudes to a single hymn block — or drops
// them entirely — would render a Third Antiphon header followed by almost
// nothing. This rule catches that shape collapse.
//
// Excluded: Pascha + Bright Week (paschal antiphons substitute for the
// Beatitudes entirely) and Lord's-feast Sundays whose feast canon may use
// a different blend.

const MIN_SUNDAY_BEATITUDE_HYMNS = 6;

module.exports = {
  id:             'L17-sunday-beatitudes-shape',
  family:         'structure',
  severity:       'high',
  description:    `Sunday Third Antiphon (Beatitudes) renders at least ${MIN_SUNDAY_BEATITUDE_HYMNS} hymn-type blocks.`,
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.isBrightWeek) return false;
    if (ctx.daysSincePascha === 0)  return false;
    if (ctx.daysSincePascha === -7) return false;   // Palm
    if (ctx.daysSincePascha === 49) return false;   // Pentecost
    return true;
  },
  check: (ctx) => {
    const third = (ctx.assembled?.blocks || []).filter(b => b.section === 'Third Antiphon');
    if (!third.length) return [];   // L5 reports missing section
    const hymns = third.filter(b => b.type === 'hymn');
    if (hymns.length >= MIN_SUNDAY_BEATITUDE_HYMNS) return [];
    return [{
      message: `Sunday Third Antiphon has ${hymns.length} hymn block(s); expected ≥${MIN_SUNDAY_BEATITUDE_HYMNS} (Beatitudes blend with canon troparia).`,
      hint:    'Check the Beatitudes builder — a variant path may be returning a single block instead of the full blend.',
    }];
  },
};
