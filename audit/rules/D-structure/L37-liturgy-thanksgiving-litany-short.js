'use strict';

// Litany of Thanksgiving length guard (discovered 2026-07-05): the post-
// Communion Litany of Thanksgiving is the SHORT litany — three deacon
// petitions ("Having partaken…" → "Help us, save us" → "…the whole day…
// perfect, holy, peaceful and sinless… let us commit…"), then the priest's
// exclamation. It had wrongly inherited the six supplicatory "Grant this, O
// Lord" petitions (angel of peace, pardon and remission, all things good and
// profitable, complete the remaining time, a Christian ending) that belong to
// the Litany of Completion at Vespers/Matins.
//
// Guard: the Litany of Thanksgiving section must contain no "Grant this, O
// Lord" response (the supplicatory-petition marker) and no more than a handful
// of deacon petitions.

const MAX_DEACON_PETITIONS = 4;

module.exports = {
  id:             'L37-liturgy-thanksgiving-litany-short',
  family:         'structure',
  severity:       'high',
  description:    'The post-Communion Litany of Thanksgiving is the short litany (no "Grant this, O Lord" supplication petitions). [discovered 2026-07-05]',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = (ctx.assembled?.blocks || []).filter(b => b.section === 'Litany of Thanksgiving');
    if (!blocks.length) return [];
    const issues = [];

    const hasGrant = blocks.some(b =>
      b.type === 'response' && /^Grant this, O Lord/i.test(b.text || ''));
    if (hasGrant) {
      issues.push({
        message: 'Litany of Thanksgiving contains a "Grant this, O Lord" supplication petition — those belong to the Litany of Completion, not the post-Communion thanksgiving litany.',
        hint:    'Remove the `petitions` array from fixed-texts/liturgy-fixed.json#litany-thanksgiving; keep only the short 3-petition shape.',
      });
    }

    const deaconPetitions = blocks.filter(b => b.type === 'prayer' && b.speaker === 'deacon').length;
    if (deaconPetitions > MAX_DEACON_PETITIONS) {
      issues.push({
        message: `Litany of Thanksgiving has ${deaconPetitions} deacon petitions; the short litany has at most ${MAX_DEACON_PETITIONS}.`,
        hint:    'The post-Communion thanksgiving litany is: "Having partaken…", "Help us, save us", and the "whole day perfect…" commit.',
      });
    }
    return issues;
  },
};
