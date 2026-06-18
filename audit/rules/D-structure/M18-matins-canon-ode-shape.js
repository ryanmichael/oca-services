'use strict';

// The Matins Canon has 8 odes — 1, 3, 4, 5, 6, 7, 8, 9 (Ode 2 is omitted in
// most canons per long-standing liturgical convention; only Lenten / penitential
// canons retain it). Each ode begins with an Irmos labeled "Ode N — Irmos".
// A regression that drops an entire ode is invisible without a rule — the
// section header still renders, just with one fewer ode.
//
// This rule asserts the canonical 8 irmoi are present on Sundays + festal
// days. Lenten-weekday Matins uses a different canon shape (Triodion canon
// with reduced odes) — skip greatLent + holyWeek for now.

const REQUIRED_ODES = [1, 3, 4, 5, 6, 7, 8, 9];

module.exports = {
  id:             'M18-matins-canon-ode-shape',
  family:         'structure',
  severity:       'high',
  description:    `Matins Canon contains an Irmos for each of Odes ${REQUIRED_ODES.join(', ')}.`,
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'matins') return false;
    if (ctx.season === 'greatLent' || ctx.season === 'holyWeek') return false;
    return true;
  },
  check: (ctx) => {
    const canon = (ctx.assembled?.blocks || []).filter(b => b.section === 'Canon');
    if (!canon.length) return [];
    // Many weekday Matins dates currently render a single placeholder rubric
    // ("[The Canon is chanted here. Odes 1–9 with troparia and katavasia.]")
    // pending content authoring. This is a documented gap, not a regression
    // — skip the ode-shape check when only the placeholder is present.
    const joined = canon.map(b => (b.text || '').toLowerCase()).join(' ');
    if (canon.length <= 2 && /\[the canon is chanted here/.test(joined)) return [];
    // Single-canon Sundays mark each ode in `label` as "Ode N — Irmos";
    // two- and three-canon festal days mark the canon name in `label` and
    // the ode number in the rubric `text` ("Ode N — First Canon"). Look in
    // both fields so the rule works for both shapes.
    const allMarkers = canon.flatMap(b => [
      (b.label || '').toLowerCase(),
      (b.type === 'rubric' ? (b.text || '') : '').toLowerCase(),
    ]).filter(Boolean);
    const missing = REQUIRED_ODES.filter(n =>
      !allMarkers.some(m => new RegExp(`\\bode ${n}\\b`).test(m))
    );
    if (!missing.length) return [];
    return [{
      message: `Matins Canon missing Ode marker(s): ${missing.join(', ')}.`,
      hint:    'Check the Canon builder for this date — an ode may have been dropped.',
    }];
  },
};
