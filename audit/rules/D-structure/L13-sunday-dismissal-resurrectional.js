'use strict';

// Every non-paschal Sunday Liturgy ends with the resurrectional dismissal:
// "May He Who rose from the dead, Christ our true God…". A weekday or feast
// dismissal accidentally selected on a Sunday loses this formula and is the
// kind of bug that's invisible without a rule because the section still
// renders, just with the wrong opening clause.
//
// Excluded: Pascha + Bright Week (paschal greeting frame), Pentecost (kneeling
// service appends its own dismissal), and Great Feast Sundays that take the
// feast-specific formula. Match those by liturgicalLabel rather than by date
// list so the rule stays self-maintaining as feasts move.

module.exports = {
  id:             'L13-sunday-dismissal-resurrectional',
  family:         'structure',
  severity:       'high',
  description:    'Non-paschal Sunday Liturgy dismissal mentions "rose from the dead".',
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
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Dismissal');
    if (!blocks.length) return [];

    // Lord's-feast Sundays use feast-specific dismissal formulas. Afterfeast
    // of the Ascension (the Sundays between Ascension and Pentecost) likewise
    // substitutes "Who ascended in glory from us into heaven…" — exclude by
    // matching label rather than enumerating dates.
    const label = (ctx.assembled?.liturgicalLabel || '').toLowerCase();
    if (/transfiguration|nativity of (christ|our lord)|theophany|elevation of the cross|meeting of (the )?lord|annunciation|ascension/.test(label)) {
      return [];
    }

    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/rose from the dead/.test(joined)) return [];
    return [{
      message: 'Sunday Dismissal does not include "rose from the dead" — resurrectional formula missing.',
      hint:    'Check the dismissal builder — a weekday/feast formula may be selected on this Sunday.',
    }];
  },
};
