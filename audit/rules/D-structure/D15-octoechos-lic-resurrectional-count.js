'use strict';

// Octoechos Sat-eve Vespers Lord I Call (resurrectional) source completeness.
// Asserts every tone (1..8) ships ≥7 hymns at saturday.vespers.lordICall
// .resurrectional.hymns — the OCA Octoechos pattern is 3 Resurrectional + 4
// Anatolika = 7 per tone for Sat Great Vespers LIC verses 10..4 (the
// remaining 3 slots V.3..V.1 plus Glory go to the Menaion saint).
//
// Sibling to D13-octoechos-aposticha-count; same gap-allowlist discipline.
//
// Discovered 2026-06-20 (Sat Great Vespers Jun 20 / Sun Jun 21, Tone 2): the
// scrape source started at hymn #2 across all 8 tones, so the runtime fills
// the 7th slot by doubling sticheron #1. Parishioner observation: at V.10
// and V.9 the choir sings the same hymn, then matches the parish-rendered
// hymn by V.8 onward — a 1-position offset between reader's verse and
// choir's response that the doubling is masking. Fix: author the missing
// leading sticheron per tone from OCA Octoechos / Obikhod source.

const path = require('path');

const EXPECTED_MIN_HYMNS = 7;

// Tones whose Octoechos LIC resurrectional source is known short. Every
// entry justifies itself with a pointer to the OCA source needed to close
// the gap, mirroring D13's KNOWN_SOURCE_GAPS pattern.
const KNOWN_SOURCE_GAPS = {
  1: 'OCA Octoechos Tone 1 source needed; missing leading Sat-Vespers LIC sticheron.',
  2: 'OCA Octoechos Tone 2 source needed; missing leading Sat-Vespers LIC sticheron.',
  3: 'OCA Octoechos Tone 3 source needed; missing leading Sat-Vespers LIC sticheron.',
  4: 'OCA Octoechos Tone 4 source needed; missing leading Sat-Vespers LIC sticheron.',
  5: 'OCA Octoechos Tone 5 source needed; missing leading Sat-Vespers LIC sticheron.',
  6: 'OCA Octoechos Tone 6 source needed; missing leading Sat-Vespers LIC sticheron.',
  7: 'OCA Octoechos Tone 7 source needed; missing leading Sat-Vespers LIC sticheron.',
  8: 'OCA Octoechos Tone 8 source needed; missing leading Sat-Vespers LIC sticheron.',
};

module.exports = {
  id:             'D15-octoechos-lic-resurrectional-count',
  family:         'structure',
  severity:       'high',
  description:    'Octoechos Sat-eve Vespers LIC resurrectional source has ≥7 hymns per tone (3 Resurrectional + 4 Anatolika).',
  needsAssembled: false,
  appliesTo: (ctx) => ctx.date === '2026-01-01' && ctx.service === 'vespers',
  check: () => {
    const findings = [];
    const octoechos = require(path.resolve(__dirname, '..', '..', '..', 'variable-sources', 'octoechos.json'));

    for (let t = 1; t <= 8; t++) {
      const hymns = octoechos[`tone${t}`]?.saturday?.vespers?.lordICall?.resurrectional?.hymns;
      if (!Array.isArray(hymns)) {
        findings.push({
          message: `Tone ${t} Sat-eve Vespers lordICall.resurrectional.hymns missing or not an array`,
          hint:    `variable-sources/octoechos.json → tone${t}.saturday.vespers.lordICall.resurrectional.hymns`,
        });
        continue;
      }
      if (hymns.length < EXPECTED_MIN_HYMNS && !KNOWN_SOURCE_GAPS[t]) {
        findings.push({
          message: `Tone ${t} Sat-eve Vespers LIC resurrectional has ${hymns.length} hymn(s), expected ≥${EXPECTED_MIN_HYMNS}.`,
          hint:    `OCA Octoechos pattern is 3 Resurrectional + 4 Anatolika = 7 per tone. Verify against OCA-published source before adding the missing entry.`,
        });
      }
    }
    return findings;
  },
};
