'use strict';

// Every Matins Little Litany (after Kathisma 1, after Kathisma 2, after the
// Polyeleios, after Odes 3/6/9) opens with the deacon's "Again and again
// in peace, let us pray to the Lord." Universal across all instances —
// each Little Litany section should anchor on this opening.

module.exports = {
  id:             'M26-matins-little-litany-opening',
  family:         'structure',
  severity:       'high',
  description:    'Each Matins Little Litany opens with "Again and again in peace, let us pray to the Lord".',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'matins',
  check: (ctx) => {
    const sections = new Set(
      (ctx.assembled?.blocks || [])
        .map(b => b.section)
        .filter(s => s && /^Little Litany/i.test(s))
    );
    const issues = [];
    for (const sec of sections) {
      const blocks = ctx.assembled.blocks.filter(b => b.section === sec);
      const first  = blocks.find(b => b.type === 'prayer');
      if (!first) continue;
      if (/again and again in peace[, ]+let us pray to the lord/i.test(first.text || '')) continue;
      issues.push({
        message: `Matins "${sec}" opens with "${(first.text || '').slice(0, 60)}" — expected "Again and again in peace, let us pray to the Lord".`,
        hint:    'First petition is wrong — check the Little Litany builder.',
      });
    }
    return issues;
  },
};
