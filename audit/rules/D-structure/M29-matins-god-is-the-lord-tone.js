'use strict';

// "God is the Lord" is sung in the tone of the troparion that immediately
// follows it — that is the whole point of announcing a tone there. On a Sunday
// with no Great Feast the resurrectional troparion governs (the tone of the
// week); on any feast, the feast/saint troparion does.
//
// M5 already asserts the hymn is PRESENT and carries the right words. It never
// looks at `tone`, so on 9-08 the Nativity of the Theotokos rendered "God is
// the Lord" in Tone 5 — the tone of the week — immediately before a Tone 4
// troparion, and M5 passed clean. Root cause: most menaion files omit
// `_meta.tone`, and server-lib/sources/matins-spec.js fell straight through to
// the weekly tone. Found 2026-09-07 reviewing the 9-08 vigil.
//
// Same class as feedback_assert_structure_not_labels.md: the label was right,
// the number attached to it was not.

module.exports = {
  id:             'M29-matins-god-is-the-lord-tone',
  family:         'structure',
  severity:       'medium',
  description:    'Matins "God is the Lord" must carry the tone of the troparion that follows it, not the tone of the week. Regression found 2026-09-07 (9-08 Nativity of the Theotokos rendered Tone 5 against a Tone 4 troparion).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const gitl = blocks.filter(b => b.section === 'God is the Lord' && b.type === 'hymn');
    if (!gitl.length) return [];                       // M5 owns the absence case
    const gitlTone = gitl.find(b => b.tone != null)?.tone;
    if (gitlTone == null) return [];                   // no tone claimed — nothing to contradict

    // The troparion that follows: first hymn of the Troparia section carrying a tone.
    const trop = blocks.find(b => b.section === 'Troparia' && b.type === 'hymn' && b.tone != null);
    if (!trop) return [];

    if (Number(gitlTone) === Number(trop.tone)) return [];

    return [{
      message:
        `Matins "God is the Lord" announces Tone ${gitlTone} but the troparion that ` +
        `follows it is Tone ${trop.tone}.`,
      hint:
        'spec.tone in server-lib/sources/matins-spec.js drives this. A menaion file ' +
        'without `_meta.tone` falls back to the weekly tone; it should fall back to ' +
        'the feast/saint troparion tone unless the Sunday resurrectional cycle governs.',
    }];
  },
};
