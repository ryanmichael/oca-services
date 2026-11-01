'use strict';

/**
 * Feature contract (browser): a booklet page cut never slices a line of text.
 * Spec: features/booklet-density-tiers.md § "Why 11.5pt"
 *
 * A block too tall for the space left on a page is CLIPPED and continued on
 * the next, with the remainder pulled up by a negative margin. For that to be
 * invisible, the clip height and the continuation offset must both land on a
 * whole line of the element being cut.
 *
 * `booklet.js` snapped both to a single module constant derived from the BODY
 * type (15pt x 1.75 = 35px). That was right while every block was body size.
 * Density tiers broke it: `compact` is 11.5pt/1.5 = 23px, `cue` 10.5pt/1.3 =
 * 18px. Snapping a compact block to 35px steps cuts at 35/70/105 while its
 * lines end at 23/46/69 — so page 2 of a Great Vespers printed Psalm 103 with
 * its top line sliced in half, caught on paper 2026-10-31. Measured on that
 * date: 7 mid-line cuts before the fix, 0 after, every one of them `compact`.
 *
 * A SECOND defect was found the same way while answering "why do some pages
 * leave so much bottom margin?". `paginate()` measures each item in an
 * absolutely positioned probe div — which is a block formatting context, so
 * the child's margins do NOT collapse out and the measured height already
 * includes them. The code added `marginBottom` on top, double-counting it on
 * every item: 8px per `prayer`, 6px per `compact`, 3px per `cue`, 10px per
 * section head. The paginator believed its pages held ~680 of 706px while
 * they rendered at ~630 — 47px short per page, ~2 pages per Great Vespers,
 * present since the booklet's first commit.
 *
 * This lives in e2e rather than test/contracts because both defects exist
 * only in laid-out pixels — the node suites render no geometry and reported
 * green the whole time the booklet was cutting text in half and leaving a
 * sixth of every page blank.
 *
 * Every test here has been verified to FAIL when its defect is reintroduced.
 * A fourth test ("the probe agrees with a real half-page") was written and
 * deleted: it rebuilt the probe from a copy of the constant instead of
 * reading booklet.js, so no mutation could make it fail.
 *
 * Run: npm run test:e2e
 */

const { test, expect } = require('@playwright/test');

const SRC = encodeURIComponent(
  '/api/service?date=2026-10-31&pronoun=tt&translation=st-john-damascus-tyler');
const URL_ = `/booklet?src=${SRC}&title=GREAT+VESPERS&sub=test`;

/** Every clipped slice, with the geometry needed to judge where it cut. */
async function slices(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#bk-root .bk-half > div[style*="overflow:hidden"]')
      .forEach((clip) => {
        const wrap = clip.firstElementChild;
        if (!wrap) return;
        // A continuation slice wraps the element in an offset div; a first
        // slice holds the element directly.
        const offset = (wrap.style && wrap.style.marginTop)
          ? Math.abs(parseFloat(wrap.style.marginTop)) : 0;
        const el = offset ? wrap.firstElementChild : wrap;
        if (!el) return;
        out.push({
          cls: el.className,
          height: parseFloat(clip.style.height),
          lineHeight: parseFloat(getComputedStyle(el).lineHeight),
          offset,
          // Is there more of this element after the clip? If not, the slice
          // legitimately ends where the text ends and needs no snapping.
          continues: clip.scrollHeight - clip.clientHeight > 1,
        });
      });
    return out;
  });
}

const onLine = (px, lineHeight) =>
  Math.abs((px / lineHeight) - Math.round(px / lineHeight)) < 0.02;

test.describe('booklet pagination', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL_);
    await page.waitForFunction(
      () => document.querySelectorAll('#bk-root .bk-spread').length > 0,
      null, { timeout: 60_000 });
  });

  test('a Great Vespers actually splits blocks across pages', async ({ page }) => {
    // Guard the guard: if nothing is ever clipped the assertions below are
    // vacuous and would pass against any amount of breakage.
    const found = await slices(page);
    expect(found.length, 'expected clipped slices to inspect').toBeGreaterThan(5);
    expect(found.some(s => /compact/.test(s.cls)),
      'expected at least one CLIPPED compact block — the tier whose line '
      + 'height differs from the body, which is the whole point of this test')
      .toBe(true);
  });

  test('pages are packed, not left half empty', async ({ page }) => {
    const gaps = await page.evaluate(() => {
      const CEILING = (8.5 - 0.45 - 0.45) * 96 - 24; // what paginate() targets
      const out = [];
      document.querySelectorAll('#bk-root .bk-half').forEach((h) => {
        if (!h.textContent.trim()) return;
        let used = 0;
        [...h.children].forEach((c) => {
          const cs = getComputedStyle(c);
          used += c.getBoundingClientRect().height
                + (parseFloat(cs.marginTop) || 0)
                + (parseFloat(cs.marginBottom) || 0);
        });
        out.push(Math.round(CEILING - used));
      });
      return out;
    });

    // The MEDIAN gap, not a count over a threshold. One or two pages
    // legitimately end early — the last page of the service, and any page
    // where the next block genuinely could not be split — so a count is
    // noisy. A systematic over-reservation moves the whole distribution, and
    // the median sees that and ignores the outliers.
    //
    // Calibrated 2026-10-31 on the Great Vespers AND Divine Liturgy booklets:
    //   with the double-counted margin   median 75 / 88   (12 and 31 pages >80px)
    //   with it removed                  median 26 / 37   (1 and 1, both the last page)
    // 60 sits in the gap with room on both sides.
    const sorted = gaps.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median,
      `median page leaves ${median}px unused — the paginator is reserving `
      + `space it does not use, so every page comes out short. Gaps: `
      + sorted.join(', ')).toBeLessThanOrEqual(60);
  });

  test('no heading is stranded alone at the foot of a page', async ({ page }) => {
    // `keepWithNext` exists to stop a section heading printing with nothing
    // under it. It had a hole: the branch that places a header whose chain
    // overflows tested the room left BEFORE placing the header, so a header
    // could land at the foot of a page with too little space behind it for
    // any content, and the next block would open a new page. Six such widows
    // across Great Vespers and Matins on 2026-10-31 — visible on paper as a
    // heading floating above a blank third of a page.
    const widows = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#bk-root .bk-half').forEach((h) => {
        const kids = [...h.children];
        if (!kids.length || !h.textContent.trim()) return;
        const last = kids[kids.length - 1];
        if (last.classList.contains('svc-head')
            || last.classList.contains('stich-label')) {
          out.push(last.textContent.trim().slice(0, 40));
        }
      });
      return out;
    });
    expect(widows, 'these headings print with nothing beneath them')
      .toEqual([]);
  });

  test('no page cut lands in the middle of a line of text', async ({ page }) => {
    const bad = (await slices(page)).filter(s =>
      !onLine(s.offset, s.lineHeight) ||
      (s.continues && !onLine(s.offset + s.height, s.lineHeight)));

    expect(bad, 'slices cut through a line of text: '
      + JSON.stringify(bad, null, 2)).toEqual([]);
  });
});
