'use strict';

// 9-13 on a Sunday: the OCA order (2026-0913) appoints at the Beatitudes
//     6 troparia of the Resurrection, Tone 6
//     4 troparia from Ode 3 of the Canon of the Founding, Tone 4
// The Canon of the Founding (John the Monk, Tone 4) is NOT in the corpus —
// variable-sources/menaion/september-13.json carries the Forefeast and
// Cornelius canons and says in `_authors` that the Dedication troparia were
// omitted. So the render falls back to the plain-Sunday shape (6 + Octoechos
// Glory/Now), which is wrong by omission and invisible to every count rule.
//
// This rule keeps the gap visible at `low` until Ode 3 of the Dedication canon
// is ingested into variable-sources/feast-canons/ and registered with
// `beatitudesReplaceGloryNow: true`. Do NOT wire a partial set: the renderer
// right-aligns into twelve slots (see L40's header for the 2026-08-16 failure).
// Source for the canon: St. Sergius e-Menaion 09-13.pdf (cited in the file).

module.exports = {
  id:             'L43-founding-church-beatitudes-gap',
  family:         'structure',
  severity:       'low',
  description:    '9-13 Founding of the Church on a Sunday should blend 4 Ode-3 troparia of the Founding canon into the Beatitudes; the canon is not in the corpus. Tracked gap, opened 2026-09-13.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy' && ctx.dow === 'sunday'
                   && (ctx.date || '').slice(5) === '09-13',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const feastTrops = blocks.filter(b =>
      b.section === 'Third Antiphon' && b.type === 'hymn' && b.source === 'feast');
    if (feastTrops.length >= 4) return [];
    return [{
      message: `Beatitudes render ${feastTrops.length} Founding troparia; the OCA order appoints 4 from Ode 3 of the Canon of the Founding (Tone 4). Known source gap: the Dedication canon is not in variable-sources/.`,
      hint:    'Ingest Ode 3 of the Canon of the Founding (St. Sergius 09-13.pdf) into feast-canons/ with beatitudesReplaceGloryNow, then register it for 9-13 in beatitudes.js.',
    }];
  },
};
