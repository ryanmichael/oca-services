/**
 * Feature contract: booklet printing
 * Spec: features/booklet-print.md
 *
 * The booklet is its own page (/booklet). It began as a popup, which phones
 * block; building it inside the app document instead meant fighting the app
 * shell, and it lost differently each round — print clipped to one page by
 * `html, body { overflow: hidden }`, a panel transform capturing fixed
 * children, an absolutely positioned measure node escaping its clip and
 * painting over the service list. A separate page has no shell to collide
 * with. These assertions are what that is worth.
 *
 * docs/BOOKLET-CONTEXT.md called the booklet "the one significant output in
 * this project with no rule at all", because nothing could reach inside a
 * popup at print time.
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

const PHONE = { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true };
const DESK  = { viewport: { width: 1280, height: 900 } };

/** Open a service in the app. Waits for the slide-in transform to settle — it
 *  is the containing block for the fixed controls, so measuring during the
 *  transition reports them off-screen. */
async function openService(page) {
  await page.goto(`${BASE}/?date=2026-10-10`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.svc-row:not(.dimmed)', { timeout: 20000 });
  await page.locator('.svc-row:not(.dimmed)').first().click();
  await page.waitForFunction(() => {
    const b = document.getElementById('p-body');
    return b && b.innerHTML.trim().length > 500;
  }, { timeout: 25000 });
  await page.waitForFunction(() => {
    const t = getComputedStyle(document.getElementById('panel')).transform;
    return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
  }, { timeout: 8000 });
}

/** The booklet page, built and ready. */
async function openBooklet(page) {
  const src = encodeURIComponent('/api/service?date=2026-10-10&pronoun=tt');
  await page.goto(`${BASE}/booklet?src=${src}&title=TEST%20BOOKLET&sub=diag`,
    { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => /sheet/.test(document.getElementById('bk-sub').textContent), { timeout: 40000 });
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

describe('Booklet printing', () => {
  it('INV-1: duplex imposition puts the right half-pages on each side of the fold', async function () {
    if (!chromium) return;
    const page = await browser.newPage(DESK);
    await openBooklet(page);
    const seq = await page.evaluate(() => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ['p' + n]);
      return window.OcaBooklet.buildSpreadsDuplex(pages, true)
        .map(s => (s.left ? s.left[0] : '_') + '|' + (s.right ? s.right[0] : '_') + (s.rotate ? '*' : ''));
    });
    // Sheet 1 front [8|1], back [2|7]; sheet 2 front [6|3], back [4|5].
    // Folded, that reads 1..8. Backs carry rotate for the long-edge flip.
    assert.deepEqual(seq, ['p8|p1', 'p2|p7*', 'p6|p3', 'p4|p5*']);
    await page.close();
  });

  it('INV-2: a page count that is not a multiple of four is padded, never truncated', async function () {
    if (!chromium) return;
    const page = await browser.newPage(DESK);
    await openBooklet(page);
    const out = await page.evaluate(() => {
      const r = {};
      [1, 5, 6, 7, 9].forEach((n) => {
        const pages = Array.from({ length: n }, (_, i) => ['p' + (i + 1)]);
        const spreads = window.OcaBooklet.buildSpreadsDuplex(pages, false);
        const kept = spreads.flatMap(s => [s.left, s.right]).filter(Boolean).map(x => x[0]);
        r[n] = { spreads: spreads.length, kept: kept.length };
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
    const page = await browser.newPage(DESK);
    await openBooklet(page);
    const seq = await page.evaluate(() => {
      const pages = [1, 2, 3, 4, 5, 6, 7, 8].map(n => ['p' + n]);
      return window.OcaBooklet.buildSpreadsSingle(pages)
        .map(s => (s.left ? s.left[0] : '_') + '|' + (s.right ? s.right[0] : '_'));
    });
    assert.deepEqual(seq, ['p8|p1', 'p6|p3', 'p2|p7', 'p4|p5']);
    await page.close();
  });

  it('INV-4: /booklet is a page of its own, with no app shell to collide with', async function () {
    if (!chromium) return;
    const page = await browser.newPage(PHONE);
    await openBooklet(page);
    const m = await page.evaluate(() => {
      const h = getComputedStyle(document.documentElement);
      const b = getComputedStyle(document.body);
      const sp = document.querySelectorAll('#bk-root .bk-spread');
      const first = sp[0] ? sp[0].getBoundingClientRect() : null;
      return {
        hasAppShell: !!document.getElementById('view-main') || !!document.getElementById('panel'),
        htmlOverflow: h.overflow, bodyOverflow: b.overflow,
        docH: document.documentElement.scrollHeight, viewportH: window.innerHeight,
        spreads: sp.length,
        firstW: first ? Math.round(first.width) : 0,
        firstH: first ? Math.round(first.height) : 0,
        viewportW: window.innerWidth,
        halvesPerSpread: [...sp].map(s => s.querySelectorAll(':scope > .bk-half').length),
      };
    });
    assert.ok(!m.hasAppShell, 'the booklet page must not carry the app shell');
    assert.notEqual(m.htmlOverflow, 'hidden', 'html must not clip the printed output');
    assert.notEqual(m.bodyOverflow, 'hidden', 'body must not clip the printed output');
    assert.ok(m.docH > m.viewportH * 2, `the document must be taller than one page, got ${m.docH}`);
    assert.ok(m.spreads > 1, 'more than one spread, so pagination is exercised');
    assert.ok(m.halvesPerSpread.every(n => n === 2), 'each spread is exactly two half-pages');
    // On screen the spreads are zoomed to fit the viewport: a spread is 11in
    // (1056px) wide, and the first half-page of an imposed booklet is the back
    // cover — often blank — so unscaled, a phone shows a wall of white with the
    // content off-screen to the right. True size is asserted under print media
    // in INV-11.
    assert.ok(m.firstW <= m.viewportW + 2,
      `a spread must fit the viewport on screen, got ${m.firstW} in ${m.viewportW}`);
    assert.ok(m.firstH > 0 && m.firstW > 0, 'the spread has real geometry');
    assert.ok(Math.abs(m.firstW / m.firstH - 1056 / 816) < 0.02,
      'the spread keeps its 11:8.5 proportion when zoomed');
    await page.close();
  });

  it('INV-5: the booklet is reachable by NAVIGATION, never a popup', async function () {
    if (!chromium) return;
    // Phones block popups by default, which is what made the booklet
    // unreachable from a phone in the first place.
    const page = await browser.newPage(PHONE);
    let popups = 0;
    page.on('popup', () => { popups += 1; });
    await openService(page);
    await page.click('#btn-print');
    await page.waitForURL(/\/booklet\?/, { timeout: 15000 });
    assert.equal(popups, 0, 'nothing may open a popup');
    assert.match(page.url(), /\/booklet\?src=%2Fapi%2F/, 'navigates with an API source');
    await page.close();
  });

  it('INV-6: the app carries no booklet DOM — it cannot paint over the page', async function () {
    if (!chromium) return;
    // The booklet used to render inside the app, where an absolutely
    // positioned measure node escaped its clip and drew the service text
    // across the date list. The app no longer contains any of it.
    const page = await browser.newPage(PHONE);
    await openService(page);
    const m = await page.evaluate(() => ({
      bkRoot: !!document.getElementById('bk-root'),
      bkSheets: !!document.getElementById('bk-sheets'),
      bkMeasure: !!document.getElementById('bk-measure'),
      bookletScript: !!window.OcaBooklet,
      doc: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
    }));
    assert.ok(!m.bkRoot && !m.bkSheets && !m.bkMeasure, 'no booklet DOM in the app');
    assert.ok(!m.bookletScript, 'the app does not load the booklet module');
    assert.ok(m.doc <= m.viewport * 1.5, `the app document must not be inflated, got ${m.doc}`);
    await page.close();
  });

  it('INV-7: a phone has a print control at all, as a floating action', async function () {
    if (!chromium) return;
    // It was `display: none` below 768px — printing was absent, not degraded.
    const page = await browser.newPage(PHONE);
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
        labelled: el.getAttribute('aria-label'),
        iconShown: getComputedStyle(el.querySelector('.btn-print-icon')).display !== 'none',
      };
    });
    assert.notEqual(fab.display, 'none', 'the print control must exist on a phone');
    assert.equal(fab.position, 'fixed');
    assert.ok(fab.w >= 44 && fab.h >= 44, `touch target ${fab.w}x${fab.h} must clear 44px`);
    assert.ok(fab.right >= 0 && fab.right < 60, `anchored right, got ${fab.right}`);
    assert.ok(fab.bottom >= 0 && fab.bottom < 80, `anchored bottom, got ${fab.bottom}`);
    assert.ok(fab.labelled && fab.iconShown, 'icon-only control needs an accessible name');
    await page.close();
  });

  it('INV-8: print is one tap, and the action reads as an action', async function () {
    if (!chromium) return;
    // There used to be a chooser screen whose only job was to ask "booklet or
    // standard?". Its Booklet card was gold-filled, which reads as a SELECTED
    // state rather than a thing to tap — people saw it as already chosen. The
    // booklet page answers the question better by showing the booklet, so the
    // screen is gone and the action is a filled button that says what it does.
    const page = await browser.newPage(PHONE);
    await openService(page);
    await page.click('#btn-print');
    await page.waitForURL(/\/booklet\?/, { timeout: 15000 });
    await page.waitForFunction(
      () => /sheet/.test(document.getElementById('bk-sub').textContent), { timeout: 40000 });

    const m = await page.evaluate(() => {
      const b = document.getElementById('btn-print');
      const cs = getComputedStyle(b);
      return {
        label: b.textContent.replace(/\s+/g, ' ').trim(),
        bg: cs.backgroundColor,
        height: Math.round(b.getBoundingClientRect().height),
        disabled: b.disabled,
        links: [...document.querySelectorAll('.bk-link')].map(l => l.textContent.trim()),
        chooserGone: !document.getElementById('view-print') && !document.getElementById('pd-booklet'),
      };
    });
    assert.match(m.label, /print booklet/i, 'the button says what it does');
    assert.notEqual(m.bg, 'rgba(0, 0, 0, 0)', 'a filled button reads as an action, not a state');
    assert.ok(m.height >= 44, `touch target ${m.height} must clear 44px`);
    assert.ok(!m.disabled, 'enabled once the booklet is built');
    assert.ok(m.links.some(l => /standard print/i.test(l)),
      'Standard print stays reachable, as a quiet link');
    await page.close();
  });

  it('INV-8b: the app no longer carries a print chooser', async function () {
    if (!chromium) return;
    const page = await browser.newPage(DESK);
    await openService(page);
    const gone = await page.evaluate(() => ({
      view: !!document.getElementById('view-print'),
      booklet: !!document.getElementById('pd-booklet'),
      standard: !!document.getElementById('pd-standard'),
    }));
    assert.ok(!gone.view && !gone.booklet && !gone.standard, 'the chooser screen is gone');
    // .pd-option is still used by the liturgy-variant and service-text pickers;
    // the booklet restyle of it was removed with the screen so theirs is intact.
    const stacked = await page.evaluate(() => {
      const o = document.querySelector('#view-liturgy-variant .pd-option');
      if (!o) return null;
      const name = o.querySelector('.pd-option-name');
      const desc = o.querySelector('.pd-option-desc');
      if (!name || !desc) return null;
      return desc.getBoundingClientRect().top >= name.getBoundingClientRect().bottom - 1;
    });
    if (stacked !== null) {
      assert.ok(stacked, 'the other pickers still stack name above description');
    }
    await page.close();
  });

  it('INV-9: duplex defaults off on a phone and on at a desk', async function () {
    if (!chromium) return;
    // A phone user is often not at a duplexing copier. Guessing wrong there
    // wastes a stack of paper; guessing wrong the other way costs one toggle.
    const phone = await browser.newPage(PHONE);
    await openBooklet(phone);
    assert.equal(await phone.evaluate(() => window.OcaBooklet.defaultDuplex()), false);
    assert.equal(await phone.evaluate(() => document.getElementById('cb-duplex').checked), false);
    assert.equal(await phone.evaluate(() => document.getElementById('note-single').hidden), false,
      'the one-sided re-feed note shows when duplex is off');
    await phone.close();

    const desk = await browser.newPage(DESK);
    await openBooklet(desk);
    assert.equal(await desk.evaluate(() => window.OcaBooklet.defaultDuplex()), true);
    await desk.close();
  });

  it('INV-11: under PRINT media the booklet page renders full-size spreads', async function () {
    if (!chromium) return;
    // The gap that let two blank-preview bugs ship: every check looked at the
    // page on SCREEN. main.css carries the app's print rules, and one of them —
    // `body:not(.bk-printing) #bk-root { display: none !important }`, written so
    // the app never prints a stray booklet — hid the entire booklet here. On
    // screen everything looked perfect; under print media the document was
    // empty, and an iPhone reported "Page 1 of 1", blank.
    const page = await browser.newPage(PHONE);
    await openBooklet(page);

    await page.emulateMedia({ media: 'screen' });
    const screen = await page.evaluate(() => {
      const sp = document.querySelectorAll('#bk-root .bk-spread');
      const r = sp[0].getBoundingClientRect();
      return { w: Math.round(r.width), viewport: window.innerWidth,
               barHidden: getComputedStyle(document.querySelector('.bk-bar')).display === 'none' };
    });
    assert.ok(screen.w <= screen.viewport + 2,
      `on screen a spread must fit the viewport, got ${screen.w} in ${screen.viewport}`);
    assert.ok(!screen.barHidden, 'the controls show on screen');

    await page.emulateMedia({ media: 'print' });
    const print = await page.evaluate(() => {
      const root = document.getElementById('bk-root');
      const sp = document.querySelectorAll('#bk-root .bk-spread');
      const r = sp[0] ? sp[0].getBoundingClientRect() : null;
      return {
        rootDisplay: getComputedStyle(root).display,
        spreads: sp.length,
        w: r ? Math.round(r.width) : 0,
        h: r ? Math.round(r.height) : 0,
        docH: document.documentElement.scrollHeight,
        barHidden: getComputedStyle(document.querySelector('.bk-bar')).display === 'none',
      };
    });
    assert.notEqual(print.rootDisplay, 'none', 'the booklet must not be hidden when printing');
    assert.ok(print.spreads > 1, 'more than one spread to print');
    assert.equal(print.w, 1056, 'printed at true size, 11in — the screen zoom must not carry over');
    assert.equal(print.h, 816, 'printed at true size, 8.5in');
    assert.ok(print.docH > print.h * 2,
      `the print document must hold every spread, got ${print.docH}`);
    assert.ok(print.barHidden, 'the controls must not print');
    await page.close();
  });

  it('INV-10: the booklet page refuses a source that is not a same-origin API path', async function () {
    if (!chromium) return;
    // `src` arrives from a query string.
    const page = await browser.newPage(DESK);
    for (const bad of ['https://evil.example/x', '//evil.example/x', '/etc/passwd']) {
      await page.goto(`${BASE}/booklet?src=${encodeURIComponent(bad)}`, { waitUntil: 'networkidle' });
      const txt = await page.evaluate(() => document.getElementById('bk-sub').textContent);
      assert.match(txt, /Bad booklet link/, `rejected: ${bad}`);
      const spreads = await page.evaluate(() => document.querySelectorAll('.bk-spread').length);
      assert.equal(spreads, 0, `nothing rendered for ${bad}`);
    }
    await page.close();
  });
});
