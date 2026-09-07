'use strict';

// The Post-Gospel Stichera section has a fixed skeleton:
//
//   Glory…                                   (doxology)
//   Through the prayers of <celebrant>…      (verse)
//   Now and ever…                            (doxology)
//   Through the prayers of the Theotokos…    (verse)
//   Have mercy on me, O God…                 (verse, Ps 50:1)
//   <the sticheron on Psalm 50>              (hymn)  ← LAST
//
// Two invariants, both violated on 9-08 and both invisible to M27, which only
// asserts that SOME substantive hymn exists somewhere in the section:
//
//  1. The sticheron is sung on Psalm 50 and therefore comes AFTER "Have mercy
//     on me, O God" — it is not an interjection between the Glory and its
//     Now-and-ever. It was emitted two slots early, splitting the Glory/Now
//     pair that frames it.
//
//  2. The Glory intercession names the day's celebrant. On a feast of the
//     Theotokos BOTH slots take the Theotokos form; the hardcoded "Through the
//     prayers of the Apostles" asked the Apostles to intercede on the
//     Theotokos's own feast.
//
// Both verified against OCA 2025-0908-texts-tt.docx. Found 2026-09-07.
//
// KNOWN_SOURCE_GAPS: on a non-Theotokos saint's feast the Glory should name the
// saint ("…of Thy saint N."); fixed-texts/matins-fixed.json carries only the
// Apostles and Theotokos forms, and postGospel._source is marked unverified.
// The rule therefore checks the Theotokos case only, and stays silent
// elsewhere rather than reporting a gap it cannot yet distinguish from correct.

const SECTION = 'Post-Gospel Stichera';

// The matins SPEC (which carries spec.feastType) is not reachable from the
// audit context: ctx.assembled is the raw /api/matins JSON, and the calendar
// entry has no `matins` key at all. The feast identity IS visible as
// liturgicalContext.greatFeast, so resolve the type through the variants file
// the same way the spec builder does. Checked 2026-09-07 — an earlier draft of
// this rule read ctx.assembled.spec.feastType, which is always undefined, so
// the intercessor half silently never ran.
const GREAT_FEAST_VARIANTS = require('../../../variable-sources/great-feast-variants.json');

function resolveFeastType(ctx) {
  const key = ctx.calendarEntry?.liturgicalContext?.greatFeast;
  if (!key) return null;
  return GREAT_FEAST_VARIANTS[key]?.type ?? null;
}

module.exports = {
  id:             'M30-matins-post-gospel-order',
  family:         'structure',
  severity:       'high',
  description:    'Matins post-Gospel sticheron must follow "Have mercy on me, O God" (it is sung on Psalm 50), and on a Theotokos feast the Glory intercession must name the Theotokos, not the Apostles. Regressions found 2026-09-07 (9-08 vigil).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const sec = (ctx.assembled?.blocks || []).filter(b => b.section === SECTION);
    if (!sec.length) return [];

    const issues = [];
    const txt = (b) => String(b?.text || '').replace(/\s+/g, ' ').trim();

    const ps50Idx     = sec.findIndex(b => /^Have mercy on me, O God/i.test(txt(b)));
    const sticheronIdx = sec.findIndex(b => b.type === 'hymn' && txt(b).length >= 30);

    // 1. Position: sticheron after Psalm 50 verse.
    if (ps50Idx !== -1 && sticheronIdx !== -1 && sticheronIdx < ps50Idx) {
      issues.push({
        message:
          `${SECTION}: the sticheron is emitted at block ${sticheronIdx}, before ` +
          `"Have mercy on me, O God" at block ${ps50Idx}. It is the sticheron ON ` +
          `Psalm 50 and must follow that verse; emitted early it splits the ` +
          `Glory from its Now-and-ever.`,
        hint: 'Block order lives in assemblers/matins.js §14 — push pg-sticheron after pg-ps50-verse.',
      });
    }

    // 2. Intercessor: on a Theotokos feast the Glory verse must not name the Apostles.
    const feastType = resolveFeastType(ctx);
    if (feastType === 'theotokos') {
      const gloryIdx = sec.findIndex(b => /^Glory to the Father/i.test(txt(b)));
      const gloryVerse = gloryIdx !== -1
        ? sec.slice(gloryIdx + 1).find(b => b.type === 'verse')
        : null;
      if (gloryVerse && /prayers of the Apostles/i.test(txt(gloryVerse))) {
        issues.push({
          message:
            `${SECTION}: the Glory intercession reads "Through the prayers of the ` +
            `Apostles" on a feast of the Theotokos; both the Glory and the ` +
            `Now-and-ever take the Theotokos form.`,
          hint: 'assemblers/matins.js §14 selects on spec.feastType; check the menaion file declares `_meta.feastType: "theotokos"`.',
        });
      }
    }

    return issues;
  },
};
