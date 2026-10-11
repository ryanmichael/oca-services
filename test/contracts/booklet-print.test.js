/**
 * Feature contract: booklet printing, in-document
 * Spec: features/booklet-print.md
 *
 * The booklet used to run in a popup built by document.write, which is why
 * docs/BOOKLET-CONTEXT.md calls it "the one significant output in this project
 * with no rule at all" — nothing could reach inside a popup at print time.
 * Now that it renders into the live document, these are the first assertions
 * it has ever had.
 *
 * Imposition is asserted directly (pure functions, exported on window), and
 * the rendered result is asserted structurally — never by screenshot, and
 * never by printing.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('node:child_process');

let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { chromium = null; }

const PORT = 3115; // distinct: 3114 was the last taken
const BASE = `http://localhost:${PORT}`;
let serverProcess, browser;

async function waitForServer(maxMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE}/api/days?from=2026-10-10&to=2026-10-10`);
      if (r.ok) return;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('server did not start');
}

/** Open a service and wait for the slide-in transform to settle — it is the
 *  containing block for the fixed-position controls, so measuring during the
 *  transition reports them off-screen. */
async function openService(page) {
  await page.goto(`${BASE}/?date=2026-10-10`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.svc-row', { timeout: 20000 });
  await page.click('.svc-row');
  await page.waitForFunction(() => {
    const b = document.getElementById('p-body');
    return b && b.innerHTML.trim().length > 500;
  }, { timeout: 25000 });
  await page.waitForFunction(() => {
    const t = getComputedStyle(document.getElementById('panel')).transform;
    return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
  }, { timeout: 8000 });
}

before(async () => {
  if (!chromium) return;
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  await waitForServer();
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (serverProcess) serverProcess.kill();
});

describe('Booklet printing (in-document)', () => {
  it('INV-1: duplex imposition puts the right half-pages on each side of the fold', async function () {
    if (!chromium) return; // playwright not installed
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const seq = await page.evaluate(() => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ['p' + n]);
      return window.OcaBooklet.buildSpreadsDuplex(pages, true)
        .map(s => (s.left ? s.left[0] : '_') + '|' + (s.right ? s.right[0] : '_') + (s.rotate ? '*' : ''));
    });
    // Sheet 1 front [8|1], back [2|7]; sheet 2 front [6|3], back [4|5].
    // Folded, that reads 1..8. Backs carry the rotate flag for long-edge flip.
    assert.deepEqual(seq, ['p8|p1', 'p2|p7*', 'p6|p3', 'p4|p5*']);
    await page.close();
  });

  it('INV-2: a page count that is not a multiple of four is padded, never truncated', async function () {
    if (!chromium) return;
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const out = await page.evaluate(() => {
      const r = {};
      [1, 5, 6, 7, 9].forEach((n) => {
        const pages = Array.from({ length: n }, (_, i) => ['p' + (i + 1)]);
        const spreads = window.OcaBooklet.buildSpreadsDuplex(pages, false);
        const seen = spreads.flatMap(s => [s.left, s.right])
          .filter(Boolean).map(x => x[0]);
        r[n] = { spreads: spreads.length, kept: seen.length };
      });
      return r;
    });
    for (const [n, v] of Object.entries(out)) {
      const padded = Math.ceil(Number(n) / 4) * 4;
      assert.equal(v.spreads, padded / 2, `${n} pages -> ${padded / 2} spreads`);
      assert.equal(v.kept, Number(n), `all ${n} content pages survive imposition`);
    }
    await page.close();
  });

  it('INV-3: single-sided emits every front, then every back, for one re-feed', async function () {
    if (!chromium) return;
    const page = await browser.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const seq = await page.evaluate(() => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ['p' + n]);
      return window.OcaBooklet.buildSpreadsSingle(pages)
        .map(s => (s.left ? s.left[0] : '_') + '|' + (s.right ? s.right[0] : '_'));
    });
    assert.deepEqual(seq, ['p8|p1', 'p6|p3', 'p2|p7', 'p4|p5']);
    assert.ok(seq.every(s => !s.includes('*')), 'single-sided never rotates');
    await page.close();
  });

  it('INV-4: the booklet builds in THIS document — no popup, real spreads', async function () {
    if (!chromium) return;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    let popups = 0;
    page.on('popup', () => { popups += 1; });
    await openService(page);
    const built = await page.evaluate(async () => {
      const c = await window.OcaBooklet.prepare({ svc: 'TEST', subtitle: 'sub' });
      return {
        sheets: c.sheets, halfPages: c.halfPages, spreads: c.spreads,
        domSpreads: document.querySelectorAll('#bk-sheets .bk-spread').length,
        halvesPerSpread: [...document.querySelectorAll('#bk-sheets .bk-spread')]
          .map(s => s.querySelectorAll(':scope > .bk-half').length),
        // Imposed, the FIRST half-page on the sheet is the back cover; page 1
        // is the right half of the first spread. That it is not first is the
        // imposition working.
        coverText: document.querySelectorAll('#bk-sheets .bk-spread')[0]
          .querySelectorAll(':scope > .bk-half')[1].textContent.trim().slice(0, 4),
      };
    });
    assert.equal(popups, 0, 'nothing may open a popup — phones block them');
    assert.ok(built.halfPages > 0, 'the service paginated into half-pages');
    assert.equal(built.domSpreads, built.spreads, 'every spread reached the DOM');
    assert.ok(built.halvesPerSpread.every(n => n === 2), 'each spread is exactly two half-pages');
    assert.equal(built.sheets, Math.ceil(built.spreads / 2));
    assert.equal(built.coverText, 'TEST', 'the booklet title opens page 1 (right half of spread 1)');
    await page.close();
  });

  it('INV-5: the booklet stylesheet does not restyle the live service panel', async function () {
    if (!chromium) return;
    // The booklet CSS redefines .svc-head, .rubric, .svc-rule and `*` for
    // print. Unscoped, loading it would repaint the panel the user reads.
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openService(page);
    const sizes = await page.evaluate(() => {
      const r = document.querySelector('#p-body .rubric');
      const h = document.querySelector('#p-body .svc-head');
      return {
        rubric: r ? getComputedStyle(r).fontSize : null,
        head:   h ? getComputedStyle(h).fontSize : null,
      };
    });
    assert.equal(sizes.rubric, '14px', 'panel .rubric keeps the app size, not the booklet 13pt');
    if (sizes.head) assert.notEqual(sizes.head, '10pt');
    await page.close();
  });

  it('INV-6: a phone has a print control at all, as a 56px floating action', async function () {
    if (!chromium) return;
    // It was `display: none` below 768px — printing was absent, not degraded.
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    await openService(page);
    const fab = await page.evaluate(() => {
      const el = document.getElementById('btn-print');
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: cs.display, position: cs.position,
        w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(window.innerWidth - r.right),
        bottom: Math.round(window.innerHeight - r.bottom),
        labelHidden: getComputedStyle(el.querySelector('.btn-print-label')).display === 'none',
        iconShown: getComputedStyle(el.querySelector('.btn-print-icon')).display !== 'none',
        labelled: el.getAttribute('aria-label'),
      };
    });
    assert.notEqual(fab.display, 'none', 'the print control must exist on a phone');
    assert.equal(fab.position, 'fixed');
    assert.ok(fab.w >= 44 && fab.h >= 44, `touch target ${fab.w}x${fab.h} must clear 44px`);
    assert.ok(fab.right >= 0 && fab.right < 60, `anchored to the right edge, got ${fab.right}`);
    assert.ok(fab.bottom >= 0 && fab.bottom < 80, `anchored to the bottom edge, got ${fab.bottom}`);
    assert.ok(fab.labelHidden && fab.iconShown, 'icon-only on a phone');
    assert.ok(fab.labelled, 'an icon-only control needs an accessible name');
    await page.close();
  });

  it('INV-7: Booklet is the first and primary option; Standard is still one tap', async function () {
    if (!chromium) return;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await openService(page);
    await page.click('#btn-print');
    const opts = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#view-print .pd-option')];
      return {
        order: cards.map(c => c.id),
        primaryClass: cards[0].classList.contains('pd-option-primary'),
        standardVisible: getComputedStyle(document.getElementById('pd-standard')).display !== 'none',
      };
    });
    assert.deepEqual(opts.order, ['pd-booklet', 'pd-standard']);
    assert.ok(opts.primaryClass, 'the booklet card carries the primary treatment');
    assert.ok(opts.standardVisible, 'Standard is subordinated, never hidden');
    await page.close();
  });

  it('INV-9: printing is not clipped to one page by the app shell', async function () {
    if (!chromium) return;
    // The shell is `html, body { height: 100%; overflow: hidden }` so the three
    // views scroll independently. Left in place while printing, WebKit clips
    // the output to a single viewport-height page — a 31-sheet booklet printed
    // from an iPhone came out as ONE EMPTY PAGE. Chromium tolerates it, so
    // neither page.pdf() nor the e2e suite saw it; this asserts the computed
    // style directly so it is caught on any engine. Found 2026-10-11.
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    await openService(page);
    await page.evaluate(async () => {
      await window.OcaBooklet.prepare({ svc: 'T', subtitle: 's' });
      document.body.classList.add('bk-printing');
    });
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
      const h = getComputedStyle(document.documentElement);
      const b = getComputedStyle(document.body);
      return {
        htmlOverflow: h.overflow, bodyOverflow: b.overflow,
        htmlH: parseFloat(h.height), bodyH: parseFloat(b.height),
        contentH: document.documentElement.scrollHeight,
        viewportH: window.innerHeight,
      };
    });
    assert.notEqual(m.htmlOverflow, 'hidden', 'html must not clip the printed output');
    assert.notEqual(m.bodyOverflow, 'hidden', 'body must not clip the printed output');
    assert.ok(m.contentH > m.viewportH * 2, 'precondition: this booklet is taller than one page');
    assert.ok(m.htmlH > m.viewportH * 2,
      `html height ${m.htmlH} must grow to the content (${m.contentH}), not stay at the viewport (${m.viewportH})`);
    assert.ok(m.bodyH > m.viewportH * 2, `body height ${m.bodyH} must grow to the content`);
    await page.close();
  });

  it('INV-10: the booklet is IN FLOW when print is called, never out of flow', async function () {
    if (!chromium) return;
    // WebKit prints an out-of-flow subtree (position: fixed/absolute) on the
    // FIRST PAGE ONLY and does not paginate it. #bk-root used to be parked
    // with `position: fixed; left: -10000px`, so an iPhone rendered a
    // 31-sheet booklet as one empty page. Chromium paginated it happily, and
    // emulateMedia could not reproduce it either — it swaps media-query
    // evaluation, not the print layout path. So assert the geometry at the
    // moment print() is called. Found on staging 2026-10-11.
    const page = await browser.newPage({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    await openService(page);
    await page.evaluate(() => {
      window.__snap = null;
      window.print = function () {
        const root = document.getElementById('bk-root');
        const sheets = document.getElementById('bk-sheets');
        const rs = getComputedStyle(root), ss = getComputedStyle(sheets);
        const rr = root.getBoundingClientRect();
        window.__snap = {
          rootPosition: rs.position, rootVisibility: rs.visibility,
          sheetsVisibility: ss.visibility,
          x: Math.round(rr.x), height: Math.round(rr.height),
          spreads: document.querySelectorAll('#bk-sheets .bk-spread').length,
          bodyClass: document.body.className,
        };
      };
    });
    await page.click('#btn-print');
    await page.waitForTimeout(600);
    await page.click('#pd-booklet');
    await page.waitForTimeout(2500);

    const s = await page.evaluate(() => window.__snap);
    assert.ok(s, 'print() must actually be called');
    assert.ok(['static', 'relative'].includes(s.rootPosition),
      `#bk-root must be in flow at print time, got position: ${s.rootPosition}`);
    assert.ok(s.x >= 0, `#bk-root must not be parked off-screen at print time, got x: ${s.x}`);
    assert.equal(s.rootVisibility, 'visible');
    assert.equal(s.sheetsVisibility, 'visible', 'the thing being printed must be visible');
    assert.ok(s.height > 2000, `the subtree must have its full height, got ${s.height}`);
    assert.ok(s.spreads > 1, 'more than one spread, so pagination is actually exercised');
    assert.match(s.bodyClass, /bk-printing/);
    await page.close();
  });

  it('INV-8: duplex defaults off on a phone and on at a desk', async function () {
    if (!chromium) return;
    // A phone user is often not at a duplexing copier. Guessing wrong there
    // wastes a stack of paper and folds into nonsense; guessing wrong the
    // other way costs one toggle.
    const phone = await browser.newPage({ viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
    await phone.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await phone.evaluate(() => window.OcaBooklet.defaultDuplex()), false);
    await phone.close();

    const desk = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await desk.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    assert.equal(await desk.evaluate(() => window.OcaBooklet.defaultDuplex()), true);
    await desk.close();
  });
});
