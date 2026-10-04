'use strict';

const path = require('path');
const { familyOfText, LABEL } =
  require(path.join(__dirname, '..', '..', '..', 'server-lib', 'sources', 'translation-provenance'));

// One service should be sung in ONE English translation.
//
// `CLAUDE.md` has always said so ("Don't mix translations within a service").
// Nothing enforced it, and on 2026-10-03 a parishioner at St John of Damascus
// heard the result: the seven Resurrection stichera in the OCA Obikhod's English
// beside St Hierotheus's three in st-sergius.org's. The register shifts audibly
// where they meet.
//
// WHY NOTHING ELSE CATCHES IT:
//   * `block.source` is the BOOK (octoechos / menaion), not the translation.
//   * `block.provenance` is unreliable — it reads only the first DB row of a
//     slot and maps everything that is not stSergius to 'OCA', so lambertsen and
//     raphaela rows report as OCA. This rule deliberately does not trust it and
//     resolves the translation from the stored text instead.
//   * drift:check's source-mixing tripwire compares General-Menaion against
//     day-specific sources, not translations.
//   * D21 counts stichera; D22 checks which day's hymn. Neither can see wording.
//
// SEVERITY IS 'low' ON PURPOSE, FOR NOW. The mix is corpus-wide: roughly 55% of
// stichera rows are not OCA, because OCA publishes propers only for the ~32% of
// days that are liturgically significant and the rest of the calendar is filled
// from Lambertsen / st-sergius.org / Myrrh-bearers. Raising this to high today
// would turn the CI gate red on a known, unfixable-in-one-step condition. It is
// here to MEASURE and to stop new mixes appearing unseen; the severity should
// rise as the convertible subset is converted.

const SUNG_SECTIONS = new Set([
  'Lord, I Have Cried', 'Aposticha', 'Litya', 'Lauds', 'Praises',
]);

module.exports = {
  id:             'D23-translation-mix-within-service',
  family:         'structure',
  severity:       'low',
  description:    'A service should be sung in one English translation. Flags stichera drawn from two or more. [discovered 2026-10-03, heard in church at Great Vespers for 10-04]',
  needsAssembled: true,

  appliesTo: (ctx) => ctx.service === 'vespers' || ctx.service === 'matins' || ctx.service === 'vigil',

  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const seen = new Map();   // family -> { count, sample }
    for (const b of blocks) {
      if (b.type !== 'hymn') continue;
      if (!SUNG_SECTIONS.has(b.section || '')) continue;
      const fam = familyOfText(b.text);
      // 'unknown' means the text is not in either ground-truth home — a
      // generated or transformed hymn, not evidence of a second translation.
      if (fam === 'unknown') continue;
      if (!seen.has(fam)) seen.set(fam, { count: 0, sample: b });
      seen.get(fam).count++;
    }

    if (seen.size < 2) return [];

    const parts = [...seen.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .map(([fam, v]) => `${LABEL[fam] || fam} ×${v.count}`);

    // Name the minority translation and one of its hymns: that is the thing a
    // human can act on, and the thing a singer actually hears.
    const minority = [...seen.entries()].sort((a, b) => a[1].count - b[1].count)[0];
    const sample = (minority[1].sample.text || '').replace(/\s+/g, ' ').slice(0, 56);

    return [{
      message: `Lord-I-Call/Aposticha stichera mix ${seen.size} translations: ${parts.join(', ')}.`,
      hint:    `The minority is ${LABEL[minority[0]] || minority[0]} — e.g. "${sample}…" ` +
               `(${minority[1].sample.section}, tone ${minority[1].sample.tone}). ` +
               'Convert it to OCA if files.oca.org publishes that day, else record the day as ' +
               'weekday-cycle (see features/translation-mix.md).',
    }];
  },
};
