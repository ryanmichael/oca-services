'use strict';

// On every Sunday Liturgy the Troparia section must lead with the Resurrection
// troparion (Octoechos tone of the day). Patron-of-temple troparia and saints'
// troparia follow. Violations show up when the Sunday gets misclassified
// (e.g., a polyeleos+ saint suppressing the resurrection troparion) or when
// the patron-of-temple ordering ends up ahead of resurrection — the rule
// catches both classes from a single signal.
//
// Probe: the first rubric inside the Troparia section announces what comes
// next. For the resurrection troparion that rubric reads "Troparion of the
// Resurrection, …". If the first hymn in the section is preceded by a
// non-resurrection rubric, flag it.
//
// Pascha through Bright Saturday is excluded — those days substitute the
// paschal troparion "Christ is risen…" and use a different rubric.

module.exports = {
  id:             'L8-sunday-resurrection-troparion-first',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Liturgy Troparia section leads with the Resurrection troparion before patron/saint troparia.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.isBrightWeek) return false;            // paschal troparion substitutes
    if (ctx.daysSincePascha === 0) return false;   // Pascha itself
    if (ctx.daysSincePascha === -7) return false;  // Palm Sunday
    if (ctx.daysSincePascha === 7)  return false;  // Thomas Sunday (paschal cycle)
    if (ctx.daysSincePascha === 49) return false;  // Pentecost
    // Sundays of Great Lent still get resurrection troparion at Liturgy.
    return true;
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const trop   = blocks.filter(b => b.section === 'Troparia');
    if (!trop.length) return [];

    // Some fixed-date Great Feasts displace the resurrection troparion when
    // they fall on a Sunday. Skip when assembled tags this as a great-feast
    // Sunday (label contains a Lord's-feast marker).
    const label = (ctx.assembled?.liturgicalLabel || '').toLowerCase();
    if (/transfiguration|nativity of (christ|our lord)|theophany|elevation of the cross|meeting of (the )?lord|annunciation/.test(label)) {
      return [];
    }

    // First rubric → first hymn pair.
    const firstRubricIdx = trop.findIndex(b => b.type === 'rubric');
    if (firstRubricIdx === -1) return [];
    const firstRubric = trop[firstRubricIdx];
    const text = (firstRubric.text || '').toLowerCase();

    // Accept either "Troparion of the Resurrection" or paschal-period variants
    // that explicitly mark the resurrection ("…risen from the dead").
    if (/troparion of the resurrection/.test(text)) return [];
    if (/resurrectional troparion/.test(text)) return [];

    return [{
      message: `Sunday Troparia leads with rubric "${(firstRubric.text || '').slice(0, 80)}" — expected Resurrection troparion first.`,
      hint:    'Check the troparia builder for this date: a patron-of-temple or saint troparion may be sorting ahead of the resurrection slot.',
    }];
  },
};
