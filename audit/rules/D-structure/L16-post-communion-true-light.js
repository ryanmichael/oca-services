'use strict';

// "We have seen the true Light" is the canonical post-Communion hymn sung
// universally at the Liturgy of John Chrysostom and Basil after the chalice
// returns to the altar. Lives in the "Post-Communion Blessing" section
// alongside "Save, O God, Thy people". A regression that drops the hymn
// (variant path returning the rubric/prayer only) leaves the section frame
// rendered — invisible without a content check.
//
// Paschal-cycle + Pentecost substitution: from Pascha through Apodosis of
// Pentecost (~daysSincePascha 0..56), OCA practice replaces "We have seen
// the true Light" with the festal troparion — "Christ is risen" during
// Bright Week / paschal cycle, the Pentecost troparion ("Blessed art Thou,
// O Christ our God, who hast revealed the fishermen as most wise…") from
// Pentecost through its Apodosis. Accept any of these forms in the window.

module.exports = {
  id:             'L16-post-communion-true-light',
  family:         'structure',
  severity:       'high',
  description:    'Post-Communion Blessing contains "We have seen the true Light" (or paschal "Christ is risen" substitute during the paschal cycle).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Post-Communion Blessing');
    if (!blocks.length) return [];
    const joined = blocks.map(b => (b.text || '').toLowerCase()).join(' ');
    if (/seen the true light/.test(joined)) return [];
    // Paschal cycle through Apodosis of Pentecost (daysSincePascha 0..56)
    // substitutes the festal troparion. Three sub-windows:
    //   0..38  — Pascha through Apodosis of Pascha: "Christ is risen"
    //   39..48 — Ascension + afterfeast: "Thou didst ascend in glory"
    //   49..56 — Pentecost + afterfeast: "Blessed art Thou… fishermen as most wise"
    if (ctx.daysSincePascha >= 0 && ctx.daysSincePascha <= 56 &&
        /christ is risen|ascend in glory|fishermen as most wise/.test(joined)) return [];
    return [{
      message: 'Post-Communion Blessing has no "We have seen the true Light" hymn.',
      hint:    'Check post-Communion section builder for this date — a variant path may have dropped the hymn.',
    }];
  },
};
