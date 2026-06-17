'use strict';

// Orphan "Now and ever" doxology: when a section emits the Now-and-ever
// label but the Theotokion source key didn't resolve, the renderer emits
// the doxology block with no following hymn. The result is a visible
// "Now and ever and unto ages of ages. Amen." block with nothing under it —
// a dead-end at render time, almost always caused by a key typo or a
// missing octoechos.json entry.
//
// Applies to LIC, Aposticha, and Troparia sections of Vespers. The
// Now-and-ever doxology there must be followed by a hymn block within the
// same section before the section ends.

const SECTIONS = new Set(['Lord, I Have Cried', 'Aposticha', 'Troparia']);

module.exports = {
  id:             'D7-vespers-orphan-now-doxology',
  family:         'structure',
  severity:       'high',
  description:    'A "Now and ever" doxology block in LIC / Aposticha / Troparia must be followed by a hymn block within the same section.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const issues = [];

    for (const section of SECTIONS) {
      const sec = blocks.filter(b => b.section === section);
      for (let i = 0; i < sec.length; i++) {
        const b = sec[i];
        if (b.type !== 'doxology') continue;
        if (!/^Now and ever/i.test(b.text || '')) continue;
        // Look ahead within the same section for a hymn.
        const tail   = sec.slice(i + 1);
        const hasHymn = tail.some(x => x.type === 'hymn');
        if (!hasHymn) {
          issues.push({
            message: `${section}: "Now and ever" doxology at block ${i} is not followed by a hymn within the section.`,
            hint:    'Likely a Theotokion source key that did not resolve. Check the `now` slot keys against octoechos.json/menaion data.',
          });
        }
      }
    }
    return issues;
  },
};
