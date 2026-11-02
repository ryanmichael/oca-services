'use strict';

const path = require('path');
const { familyOfText, LABEL } =
  require(path.join(__dirname, '..', '..', '..', 'server-lib', 'sources', 'translation-provenance'));

// One sung section, one voice.
//
// ── WHY THIS RULE EXISTS ───────────────────────────────────────────────────
//
// On 2026-11-01 the reader's portions of the Third Antiphon were heard to be in
// the wrong English at Liturgy. They were: the six Resurrection troparia came
// from saintjonah.org's Octoechos Beatitudes (family `htm`) and the four
// Unmercenaries troparia from the St-Sergius Emenaion (family `stsergius`),
// while the choir's Beatitude VERSES around them came from the parish's own
// cascaded `fixed-texts` and so were OCA/Dmitri. Three Englishes inside one
// antiphon, with the reader carrying the seam.
//
// Nothing flagged it, for three separate reasons, all now closed:
//   1. D23-translation-mix-within-service is THE translation-mix rule, and its
//      `appliesTo` covers vespers/matins/vigil only. The Liturgy was outside it.
//   2. D23 keys on `roleOf(block)` = octoechos | menaion | moveable. A blend
//      block carries `source: 'feast'`, which maps to no role, so it would have
//      been skipped even with the Liturgy in scope.
//   3. The provenance index itself read only `_source`, while the Beatitudes
//      nodes tag themselves with a bare `source` — so all eight tones of HTM
//      Beatitudes resolved as family `oca`, and the mix was invisible by
//      construction. (translation-provenance.js, fixed the same day.)
//
// ── WHY A SEPARATE RULE AND NOT A WIDER D23 ────────────────────────────────
//
// D23 asks whether a service draws on the parish's DECLARED BOOKS, per role,
// with real weekday-vs-festal nuance. The Liturgy's antiphons ask something
// narrower and structurally different: these sections BLEND two books by
// rubric — the Octoechos spine plus a feast or saint canon — so a mix of
// *books* here is correct practice and not the question. The question is
// whether the two books' ENGLISH matches, because a listener hears one
// continuous section. Folding that into D23's per-role framing would have
// meant teaching it that a role mix is sometimes fine, which is how its first
// form became meaningless (see its own header).
//
// ── WHAT IT ASSERTS ────────────────────────────────────────────────────────
//
// Not a count, not a label, not a sequence: it resolves each hymn's text to a
// translation family through the index and asserts the section resolves to ONE.
// A right-aligned, correctly-ordered, correctly-counted section in two
// Englishes still fails — which is the failure that actually happened.
//
// ── SEVERITY ───────────────────────────────────────────────────────────────
//
// `medium`, deliberately. Measured over 2026 with the Tyler stack: 49 Sundays
// render a Third Antiphon, 8 mix two known families (6 htm+stsergius, 1
// htm+oca, 1 htm+lambertsen). All 8 are real. But the fix is sourcing, not
// code — OCA does not publish the Beatitudes troparia at all
// (project_beatitudes_oca_gap), so there is no OCA text to switch to today and
// a `high` would gate work it cannot unblock. Same posture as D24's tracked
// burn-down. Raise it to `high` when an OCA Beatitudes corpus lands.
//
// NOTE the separate, larger fact this rule does NOT report: 37 of those 49
// Sundays are ENTIRELY `htm`. A uniform wrong family is not an audible seam, so
// it is not a finding here; it is the sourcing gap, tracked in
// features/antiphon-translation-family.md.

// Liturgy sections that blend an Octoechos spine with a feast/saint canon and
// are sung as one continuous unit. Extend deliberately: every section added
// here asserts that everything sung under one heading is one translation.
const BLENDED_SECTIONS = new Set([
  'First Antiphon', 'Second Antiphon', 'Third Antiphon',
]);

module.exports = {
  id:             'L45-antiphon-translation-family',
  family:         'provenance',
  severity:       'medium',
  description:    'A blended Liturgy antiphon should be sung in ONE translation: its hymn texts must resolve to a single translation family. [discovered 2026-11-01 from the kliros]',
  needsAssembled: true,

  appliesTo: (ctx) => ctx.service === 'liturgy',

  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    // section -> family -> { count, sample }
    const bySection = new Map();
    for (const b of blocks) {
      if (b.type !== 'hymn' || !b.text) continue;
      if (!BLENDED_SECTIONS.has(b.section || '')) continue;
      const fam = familyOfText(b.text);
      // 'unknown' is unattributed, not a second translation. Counting it would
      // make every gap in the index look like a defect and bury the real ones.
      if (fam === 'unknown') continue;
      if (!bySection.has(b.section)) bySection.set(b.section, new Map());
      const fams = bySection.get(b.section);
      if (!fams.has(fam)) fams.set(fam, { count: 0, sample: b });
      fams.get(fam).count++;
    }
    if (!bySection.size) return [];

    const name = (f) => LABEL[f] || f;
    const findings = [];

    for (const [section, fams] of bySection) {
      if (fams.size < 2) continue;
      const ranked   = [...fams.entries()].sort((a, b) => b[1].count - a[1].count);
      const minority = ranked[ranked.length - 1];
      findings.push({
        message: `${section} is sung in ${fams.size} translations: ` +
                 `${ranked.map(([f, v]) => `${name(f)} x${v.count}`).join(', ')}. ` +
                 'One section should be one English.',
        hint: `The minority is ${name(minority[0])} — e.g. ` +
              `"${(minority[1].sample.text || '').replace(/\s+/g, ' ').slice(0, 56)}…"` +
              `${minority[1].sample.label ? ` (${minority[1].sample.label})` : ''}. ` +
              'A parish can now be pointed at a different translation of these ' +
              'troparia via variable-sources/translations/<stack>/ — see ' +
              'features/antiphon-translation-family.md.',
      });
    }
    return findings;
  },
};
