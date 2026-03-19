/**
 * booklet-impose.js
 *
 * Reorders an array of pages for saddle-stitch booklet printing.
 * Calibrated for actual printer behavior: front sides print reversed
 * and upside-down; back sides print normal and right-side up.
 *
 * Required browser print settings:
 *   - Orientation:  Landscape
 *   - Pages/sheet:  2 (browser handles the 2-up layout)
 *   - Two-sided:    Long-edge binding
 *   - Paper:        US Letter (8.5" × 11")
 *
 * Returns an array of { page, rotate } objects. Pages with rotate:true
 * must be rendered with transform:rotate(180deg) to counteract the
 * printer's upside-down rendering of front-side pages.
 *
 * For n = 8 content pages, output sequence (page values):
 *   [1↻, 8↻, 2, 7, 3↻, 6↻, 4, 5]
 *
 * Printer produces:
 *   Sheet 1 front: 8 | 1  (pre-rotated pages flip to right-side-up)
 *   Sheet 1 back:  2 | 7
 *   Sheet 2 front: 6 | 3
 *   Sheet 2 back:  4 | 5
 *
 * Fold result reads: 1, 2, 3, 4, 5, 6, 7, 8 ✓
 */

'use strict';

/**
 * @param {Array} pages  Content pages in reading order (index 0 = page 1).
 *                       null / undefined entries are treated as blank pages.
 * @returns {{ page: any, rotate: boolean }[]}  Imposed sequence.
 */
function imposeBooklet(pages) {
  const padded = pages.slice();
  while (padded.length % 4 !== 0) padded.push(null);
  const n = padded.length;
  const out = [];
  for (let k = 0; k < n / 4; k++) {
    // Front side: printer reverses order and flips upside-down →
    // pre-rotate and send right-page first so it lands in correct position
    out.push({ page: padded[2 * k],         rotate: true  }); // front right
    out.push({ page: padded[n - 1 - 2 * k], rotate: true  }); // front left
    // Back side: printer outputs normal, right-side up
    out.push({ page: padded[2 * k + 1],     rotate: false }); // back left
    out.push({ page: padded[n - 2 - 2 * k], rotate: false }); // back right
  }
  return out;
}

// ── Export ───────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined') {
  module.exports = { imposeBooklet };
} else {
  window.imposeBooklet = imposeBooklet;
}

// ── Unit tests (node booklet-impose.js) ──────────────────────────────────────

if (typeof require !== 'undefined' && require.main === module) {
  let pass = 0, fail = 0;

  function test(label, input, expectedPages, expectedRotates) {
    const result = imposeBooklet(input);
    const pages   = result.map(r => r.page);
    const rotates = result.map(r => r.rotate);
    const okPages   = JSON.stringify(pages)   === JSON.stringify(expectedPages);
    const okRotates = JSON.stringify(rotates) === JSON.stringify(expectedRotates);
    const ok = okPages && okRotates;
    console.log((ok ? '✓' : '✗') + ' ' + label);
    if (!okPages) {
      console.log('  pages expected:', JSON.stringify(expectedPages));
      console.log('  pages got:     ', JSON.stringify(pages));
      fail++;
    }
    if (!okRotates) {
      console.log('  rotates expected:', JSON.stringify(expectedRotates));
      console.log('  rotates got:     ', JSON.stringify(rotates));
      if (okPages) fail++;
    } else if (okPages) { pass++; }
  }

  const seq = n => Array.from({ length: n }, (_, i) => i + 1);
  const rot = n => Array.from({ length: n / 4 }, () => [true, true, false, false]).flat();

  // 8 pages: [1↻, 8↻, 2, 7, 3↻, 6↻, 4, 5]
  test('8 pages',
    seq(8),
    [1, 8, 2, 7, 3, 6, 4, 5],
    rot(8));

  // 16 pages
  test('16 pages',
    seq(16),
    [1, 16, 2, 15, 3, 14, 4, 13, 5, 12, 6, 11, 7, 10, 8, 9],
    rot(16));

  // 20 pages
  test('20 pages',
    seq(20),
    [1, 20, 2, 19, 3, 18, 4, 17, 5, 16, 6, 15, 7, 14, 8, 13, 9, 12, 10, 11],
    rot(20));

  // 18 pages → padded to 20 (blanks on back cover and penultimate inside page)
  test('18 pages → padded to 20',
    seq(18),
    [1, null, 2, null, 3, 18, 4, 17, 5, 16, 6, 15, 7, 14, 8, 13, 9, 12, 10, 11],
    rot(20));

  // 32 pages
  test('32 pages',
    seq(32),
    [1, 32, 2, 31, 3, 30, 4, 29, 5, 28, 6, 27, 7, 26, 8, 25,
     9, 24, 10, 23, 11, 22, 12, 21, 13, 20, 14, 19, 15, 18, 16, 17],
    rot(32));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
