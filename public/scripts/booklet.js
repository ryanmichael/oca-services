'use strict';

/**
 * booklet.js — saddle-stitch booklet printing, in the main document.
 *
 * This used to run in a popup (`window.open` + `document.write`). Phones block
 * popups by default, so the booklet was unreachable from a phone — and the
 * print button was hidden below 768px anyway, which hid the fact. Rendering
 * into the live document instead is what makes it work on a phone, and it also
 * removes the popup-blocker failure on desktop.
 *
 * Two consequences of living in the main document, both load-bearing:
 *
 *   1. The booklet stylesheet redefines GLOBAL selectors (.svc-head, .rubric,
 *      .svc-rule, even `*`). Harmless in a popup; in-document it would restyle
 *      the live service panel. Every rule is therefore scoped under #bk-root in
 *      main.css — and the measuring probe below must be appended INSIDE
 *      #bk-root, or it measures with the app's fonts and every height is wrong.
 *
 *   2. `@page` is document-global and cannot be scoped. The document declares
 *      `size: letter; margin: 1in` for Standard print, and the booklet needs
 *      `size: 11in 8.5in; margin: 0`. So the booklet rule is injected just
 *      before printing and removed after.
 *
 * iOS ignores `@page { size }` entirely and defaults to portrait — verified
 * 2026-10-10 on iOS Chrome. Nothing here can fix that; the print screen tells
 * the user to choose Landscape instead. Desktop Chromium honours it.
 *
 * Imposition and pagination are unchanged from the popup implementation, and
 * are exported so they can be asserted without printing — see
 * test/contracts/booklet.test.js. Previously the booklet was the one
 * significant output in this project with no test at all, because it only
 * existed inside a popup at print time.
 */
(function (global) {

  // Half-page = 5.5in x 8.5in, padding 0.45in top/bottom and 0.5in left/right.
  var PAGE_CONTENT_H = (8.5 - 0.45 - 0.45) * 96;      // 729.6px
  var MEASURE_W      = (5.5 - 0.5 * 2) + 'in';        // 4.5in
  var PAGE_H         = PAGE_CONTENT_H - 24;           // buffer against font-rounding clip
  var LINE_H         = Math.round(15 * 1.75 * 96 / 72); // ~35px, snap splits to lines
  var PAGE_RULE_ID   = 'bk-page-rule';

  function el(id) { return document.getElementById(id); }

  // ── Imposition (pure — tested directly) ───────────────────────────────────
  function buildSpreadsDuplex(pages, rotateBack) {
    var p = pages.slice();
    while (p.length % 4 !== 0) p.push(null);
    var n = p.length, spreads = [];
    for (var k = 0; k < n / 4; k++) {
      spreads.push({ left: p[n-1-2*k], right: p[2*k],     rotate: false });      // sheet k front
      spreads.push({ left: p[2*k+1],   right: p[n-2-2*k], rotate: rotateBack }); // sheet k back
    }
    return spreads;
  }

  function buildSpreadsSingle(pages) {
    var p = pages.slice();
    while (p.length % 4 !== 0) p.push(null);
    var n = p.length, spreads = [];
    for (var k = 0; k < n / 4; k++) {
      spreads.push({ left: p[n-1-2*k], right: p[2*k],     rotate: false }); // sheet k front
    }
    for (var k = 0; k < n / 4; k++) {
      spreads.push({ left: p[2*k+1],   right: p[n-2-2*k], rotate: false }); // sheet k back
    }
    return spreads;
  }

  // ── Pagination + rendering ──

  // ── Pagination ────────────────────────────────────────────────────────────
  function paginate(measure, host, TITLE_SVC, TITLE_SUB) {
    var allItems = [];

    // Title is a real measured item so page 1 accounts for its height
    var titleHtml = '<div class="bk-title">' + TITLE_SVC + '</div><div class="bk-subtitle">' + TITLE_SUB + '</div>';
    allItems.push({ html: titleHtml, isHead: false, keepWithNext: true });

    Array.from(measure.children).forEach(function (el) {
      if (el.classList.contains('svc-rule')) {
        allItems.push({ html: el.outerHTML, isHead: false, keepWithNext: false });
      } else if (el.classList.contains('edu-module')) {
        allItems.push({ html: el.outerHTML, isHead: false, keepWithNext: false });
      } else if (el.classList.contains('svc-sec')) {
        Array.from(el.children).forEach(function (child) {
          var isHead = child.classList.contains('svc-head');
          var isLabel = child.classList.contains('stich-label');
          // Split blocks with <br> into individual lines for natural pagination
          if (!isHead && !isLabel && /<br\s*\/?>/i.test(child.innerHTML)) {
            var m = child.outerHTML.match(/^(<[^>]+>)([\s\S]*?)(<\/[^>]+>)$/);
            if (m) {
              var open = m[1], inner = m[2], close = m[3];
              var lines = inner.split(/<br\s*\/?>/i);
              if (lines.length > 1) {
                var openNoMB = /style="/.test(open)
                  ? open.replace(/style="([^"]*)"/, 'style="$1;margin-bottom:0"')
                  : open.replace(/>$/, ' style="margin-bottom:0">');
                lines.forEach(function (line, j) {
                  var wrap = j < lines.length - 1 ? openNoMB : open;
                  allItems.push({ html: wrap + line.trim() + close, isHead: false, keepWithNext: false });
                });
                return;
              }
            }
          }
          allItems.push({ html: child.outerHTML, isHead: isHead, keepWithNext: isHead || isLabel });
        });
      }
    });

    var tmp = document.createElement('div');
    tmp.className = 'bk-half';
    tmp.style.cssText = 'position:absolute;top:-9999px;left:0;width:' + MEASURE_W + ';height:auto;overflow:visible;padding:0;';
    host.appendChild(tmp);
    var itemHeights = allItems.map(function (item) {
      tmp.innerHTML = item.html;
      var h = tmp.getBoundingClientRect().height;
      var last = tmp.lastElementChild;
      if (last) {
        h += parseFloat(window.getComputedStyle(last).marginBottom) || 0;
      }
      return h;
    });
    host.removeChild(tmp);

    var MIN_SPLIT = 80; // don't leave a sliver shorter than this on a page
    var pages = [[]], heights = [0];
    allItems.forEach(function (item, i) {
      var h = itemHeights[i];
      var idx = pages.length - 1;
      var remaining = PAGE_H - heights[idx];
      // Keep headers, stich-labels, and verses with the following content.
      // Walk the full keepWithNext chain so verse→label→hymn stay together.
      var lookahead = 0;
      if (item.keepWithNext) {
        for (var k = i + 1; k < allItems.length; k++) {
          lookahead += itemHeights[k] || 0;
          if (!allItems[k].keepWithNext) break;
        }
      }
      if (heights[idx] + h + lookahead <= PAGE_H) {
        // Fits on current page (including any keepWithNext chain)
        pages[idx].push(item.html);
        heights[idx] += h;
      } else if (pages[idx].length === 0 || (remaining >= MIN_SPLIT && !item.keepWithNext)) {
        // Either first item on page, or there's usable space and this isn't a
        // keepWithNext header — place and split if needed
        splitItem(item.html, h, remaining);
      } else if (item.keepWithNext && remaining >= MIN_SPLIT && h <= remaining) {
        // keepWithNext header/label fits on current page but its chain overflows.
        // Place the header here; the chain's tail (the actual content) will be
        // split on the next iteration.
        pages[idx].push(item.html);
        heights[idx] += h;
      } else {
        // Start a new page
        pages.push([]);
        heights.push(0);
        var last = pages.length - 1;
        splitItem(item.html, h, PAGE_H);
      }
    });

    function splitItem(html, h, space) {
      var idx = pages.length - 1;
      if (h <= space) {
        // Fits without splitting
        pages[idx].push(html);
        heights[idx] += h;
      } else {
        // Clip to available space, continue remainder on next page(s).
        // Snap clip heights DOWN to line-height multiples so we never
        // cut through the middle of a text line.
        var offset = 0;
        while (offset < h) {
          var avail = offset === 0 ? space : PAGE_H;
          var sliceH = Math.min(avail, h - offset);
          // Snap down to line boundary unless this is the last slice
          if (h - offset > sliceH) {
            sliceH = Math.floor(sliceH / LINE_H) * LINE_H;
            if (sliceH < LINE_H) sliceH = LINE_H; // at least one line
          }
          var clip;
          if (offset === 0) {
            clip = '<div style="height:' + sliceH + 'px;overflow:hidden">' + html + '</div>';
          } else {
            clip = '<div style="height:' + sliceH + 'px;overflow:hidden">'
                 + '<div style="margin-top:-' + offset + 'px">' + html + '</div></div>';
          }
          if (offset === 0) {
            pages[idx].push(clip);
            heights[idx] += sliceH;
          } else {
            pages.push([clip]);
            heights.push(sliceH);
          }
          offset += sliceH;
        }
      }
    }

    return pages;
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function renderSpreads(pages, duplex, rotateBack) {
    var spreads = duplex ? buildSpreadsDuplex(pages, rotateBack) : buildSpreadsSingle(pages);
    var sheets  = el('bk-sheets');
    sheets.innerHTML = '';
    spreads.forEach(function (spread) {
      var div = document.createElement('div');
      div.className = spread.rotate ? 'bk-spread rotated' : 'bk-spread';
      ['left', 'right'].forEach(function (side) {
        var half = document.createElement('div');
        half.className = 'bk-half';
        if (spread[side] && spread[side].length > 0) half.innerHTML = spread[side].join('');
        div.appendChild(half);
      });
      sheets.appendChild(div);
    });
    return {
      spreads: spreads.length,
      sheets: Math.ceil(spreads.length / 2),
      halfPages: pages.filter(function (p) { return p && p.length > 0; }).length,
    };
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  //
  // Duplex defaults OFF on phones. A phone user is often not at a duplexing
  // copier, and guessing wrong there costs a wasted stack of paper and a
  // booklet that folds into nonsense, where guessing wrong the other way costs
  // one toggle. The choice is remembered per device once made.

  function isPhone() {
    try { return global.matchMedia('(max-width: 767px)').matches; } catch (e) { return false; }
  }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.platform || '') ||
           (/Mac/.test(navigator.platform || '') && navigator.maxTouchPoints > 1) ||
           /iPhone|iPad|iPod/.test(navigator.userAgent || '');
  }
  function getSetting(key, dflt) {
    try {
      var v = localStorage.getItem('booklet-' + key);
      return v === null ? dflt : v === 'true';
    } catch (e) { return dflt; }
  }
  function setSetting(key, val) {
    try { localStorage.setItem('booklet-' + key, String(val)); } catch (e) {}
  }
  function defaultDuplex() { return !isPhone(); }

  // ── Build + print ─────────────────────────────────────────────────────────

  /** Paginate and lay out the spreads. Resolves with { sheets, halfPages }. */
  function prepare(opts) {
    opts = opts || {};
    var root    = el('bk-root');
    var measure = el('bk-measure');
    var source  = opts.sourceEl || el('p-body');
    if (!root || !measure || !source || !source.innerHTML.trim()) {
      return Promise.reject(new Error('No service loaded.'));
    }
    measure.innerHTML = source.innerHTML;

    var duplex     = opts.duplex     !== undefined ? opts.duplex     : getSetting('duplex', defaultDuplex());
    var rotateBack = opts.rotateBack !== undefined ? opts.rotateBack : getSetting('rotateBack', true);

    // Web fonts must be in before measuring or every height is wrong.
    var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    return ready.then(function () {
      var pages = paginate(measure, root, opts.svc || '', opts.subtitle || '');
      var counts = renderSpreads(pages, duplex, rotateBack);
      counts.pages = pages;
      return counts;
    });
  }

  function addPageRule() {
    if (el(PAGE_RULE_ID)) return;
    var style = document.createElement('style');
    style.id = PAGE_RULE_ID;
    style.textContent = '@page { size: 11in 8.5in; margin: 0; }';
    document.head.appendChild(style);
  }
  function removePageRule() {
    var s = el(PAGE_RULE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  /** Force the printing geometry inline, independent of @media print.
   *  WebKit will not paginate an out-of-flow subtree, and a media query that
   *  fails to apply leaves a blank page with no symptom to chase. */
  function enterPrintState() {
    var root = el('bk-root');
    if (root) { root.style.height = 'auto'; root.style.overflow = 'visible'; }
    var sheets = el('bk-sheets');
    if (sheets) sheets.style.visibility = 'visible';
    document.body.classList.add('bk-printing');
  }

  /** Undo everything enterPrintState() forced. Every inline style it sets MUST
   *  be reset here: iOS frequently never fires `afterprint`, so anything left
   *  behind stays on the page — a 29,000px booklet printed over the service
   *  list, which is what shipped on 2026-10-11. */
  function cleanup() {
    document.body.classList.remove('bk-printing');
    var root = el('bk-root');
    if (root) { root.style.height = ''; root.style.overflow = ''; }
    var sheets = el('bk-sheets');
    if (sheets) sheets.style.visibility = '';
    removePageRule();
  }

  /** Prepare, then hand the document to the print dialog as a booklet. */
  function printBooklet(opts) {
    return prepare(opts).then(function (counts) {
      enterPrintState();
      addPageRule();
      var done = false;
      function after() { if (done) return; done = true; cleanup(); }
      global.addEventListener('afterprint', after, { once: true });
      // Safari/iOS do not always fire afterprint; belt and braces.
      setTimeout(after, 60000);
      // Let the class + @page rule settle before the dialog snapshots the page.
      return new Promise(function (resolve) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            global.print();
            resolve(counts);
          });
        });
      });
    });
  }

  /** Eight numbered half-pages — the calibration sheet for a new printer. */
  function printTest() {
    var pages = [];
    for (var i = 1; i <= 8; i++) {
      pages.push(['<div class="test-page"><span>' + i + '</span></div>']);
    }
    renderSpreads(pages, getSetting('duplex', defaultDuplex()), getSetting('rotateBack', true));
    enterPrintState();
    addPageRule();
    global.addEventListener('afterprint', cleanup, { once: true });
    setTimeout(cleanup, 60000);
    requestAnimationFrame(function () { requestAnimationFrame(function () { global.print(); }); });
  }

  global.OcaBooklet = {
    buildSpreadsDuplex: buildSpreadsDuplex,
    buildSpreadsSingle: buildSpreadsSingle,
    paginate: paginate,
    prepare: prepare,
    print: printBooklet,
    printTest: printTest,
    getSetting: getSetting,
    setSetting: setSetting,
    defaultDuplex: defaultDuplex,
    isPhone: isPhone,
    isIOS: isIOS,
  };

})(window);
