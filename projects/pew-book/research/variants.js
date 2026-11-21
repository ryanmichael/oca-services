const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  p.on('pageerror', e => console.log('PAGEERROR', e.message));
  await p.goto('file://' + process.argv[2]); await p.waitForFunction(() => document.body.dataset.halfPages, null, { timeout: 20000 });
  const book = await p.evaluate(() => [...document.querySelectorAll('#book-pages .content')].map(c => c.offsetHeight));
  console.log('book page heights', book);
  for (const [sz, bt] of [['sz-15','bt-sheet'],['sz-13','bt-sheet'],['sz-15','bt-book'],['sz-13','bt-book']]) {
    await p.click('#' + sz); await p.click('#' + bt);
    console.log(await p.evaluate(() => document.body.dataset.variant), 'half-pages', await p.evaluate(() => document.body.dataset.halfPages), await p.textContent('#fit-status'));
  }
  await p.click('#sz-15'); await p.click('#bt-sheet');
  await p.screenshot({ path: process.argv[3], fullPage: true });
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(300);
  console.log('phone scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  await b.close();
})();
