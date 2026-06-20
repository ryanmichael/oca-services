'use strict';

// Octoechos Saturday-eve Vespers aposticha source completeness check.
// Asserts every tone (1..8) has at least 4 hymns in the saturday-vespers
// aposticha block and that hymn `order` values are contiguous 1..N with
// no gaps. Catches scraper drift like the Tone 2 gap discovered 2026-06-20
// (missing first idiomelon "Thy Resurrection, O Christ our Savior, has
// enlightened the whole universe…").
//
// Runs once per audit invocation (anchored on Jan 1 vespers); validates
// the source file directly, independent of any specific date.

const path = require('path');

const EXPECTED_MIN_HYMNS = 4;

module.exports = {
  id:             'D13-octoechos-aposticha-count',
  family:         'structure',
  severity:       'high',
  description:    'Octoechos Saturday-eve Vespers aposticha source has ≥4 hymns and contiguous order values for every tone.',
  needsAssembled: false,
  appliesTo: (ctx) => ctx.date === '2026-01-01' && ctx.service === 'vespers',
  check: () => {
    const findings = [];
    const octoechos = require(path.resolve(__dirname, '..', '..', '..', 'variable-sources', 'octoechos.json'));

    for (let t = 1; t <= 8; t++) {
      const hymns = octoechos[`tone${t}`]?.saturday?.vespers?.aposticha?.hymns;
      if (!Array.isArray(hymns)) {
        findings.push({
          message: `Tone ${t} Saturday-eve Vespers aposticha.hymns missing or not an array`,
          hint:    `variable-sources/octoechos.json → tone${t}.saturday.vespers.aposticha.hymns`,
        });
        continue;
      }
      if (hymns.length < EXPECTED_MIN_HYMNS) {
        findings.push({
          message: `Tone ${t} Saturday-eve Vespers aposticha has ${hymns.length} hymn(s), expected ≥${EXPECTED_MIN_HYMNS}.`,
          hint:    `OCA Sunday Vespers convention prints 4 idiomelon stichera; verify against OCA-published Tone-${t} source before adding the missing entry.`,
        });
      }
      // Contiguity check: orders must be 1..N with no gaps and no dupes.
      const orders = hymns.map(h => h.order).filter(Number.isInteger).sort((a, b) => a - b);
      for (let i = 0; i < orders.length; i++) {
        if (orders[i] !== i + 1) {
          findings.push({
            message: `Tone ${t} aposticha hymn orders are non-contiguous: got [${orders.join(',')}], expected 1..${orders.length}.`,
            hint:    `variable-sources/octoechos.json → tone${t}.saturday.vespers.aposticha.hymns: renumber to a 1-indexed contiguous sequence.`,
          });
          break;
        }
      }
    }
    return findings;
  },
};
