'use strict';

// Embedded refrain/verse marker in a sung hymn (discovered 2026-07-05 on
// Sun 07-05 Great Vespers Aposticha): the Tone 4 Saturday Aposticha stichera
// in octoechos.json had the following psalm-verse refrain glued onto the end
// of the sticheron text (e.g. "…saving Resurrection. R. The Lord is King; He
// is robed in majesty!"), a scrape artifact. The verse already renders as its
// own `verse` block, so the marker text is a duplicate bleed inside the choir's
// sung sticheron.
//
// A refrain/verse marker ("R." for response, "V." for verse) belongs only in a
// standalone `verse` block, never inside a `hymn`. This rule is source-agnostic
// at the rendered layer: it catches the same bleed whether it originates in
// octoechos.json, the Triodion/Pentecostarion, or the stichera DB.

const MARKER = /(^|\s)[RV]\.\s+\S/;   // " R. …" or " V. …" (or at string start)

module.exports = {
  id:             'D17-vespers-embedded-refrain-marker',
  family:         'structure',
  severity:       'high',
  description:    'A sung hymn block must not contain an embedded refrain/verse marker ("R." / "V.") — that text belongs in a standalone verse block. [discovered 2026-07-05, Sun 07-05 Aposticha]',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const issues = [];
    for (const b of blocks) {
      if (b.type !== 'hymn') continue;          // verse blocks legitimately carry the marker
      if (!b.text || !MARKER.test(b.text)) continue;
      const m = b.text.match(MARKER);
      const at = b.text.indexOf(m[0]);
      issues.push({
        message: `${b.section} hymn "${(b.label || '').slice(0, 40)}" contains an embedded refrain/verse marker: "…${b.text.slice(Math.max(0, at - 15), at + 30).replace(/\n/g, ' ')}…".`,
        hint:    'Strip the trailing "R./V. <refrain>" from the source hymn text — the verse renders as its own block.',
      });
    }
    return issues;
  },
};
