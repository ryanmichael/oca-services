'use strict';

/**
 * parish-book.js — the Parish Book page (book + weekly insert).
 * Spec: features/parish-book.md
 *
 * Everything that decides WHAT is printed lives on the server
 * (server-lib/parish-book/). This file only lays it out, with the booklet's
 * own renderer (renderer.js) and paginator (booklet.js), so a block breaks
 * across pages here exactly as it does in the booklet.
 */
(function () {
  var B = window.OcaBooklet;
  var q = new URLSearchParams(location.search);
  var parish = q.get('parish') || 'st-john-damascus-tyler';
  var edition = q.get('edition');
  var date = q.get('date');

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); };

  function setTitle(t, sub) {
    $('bk-title').childNodes[0].nodeValue = t + ' ';
    $('bk-sub').textContent = sub;
    document.title = t;
  }
  function links(html) { $('bk-links').innerHTML = html; }
  function note(html) { var n = $('pb-note'); n.innerHTML = html; n.hidden = !html; }
  function pageRule(css) { $('pb-page-rule').textContent = css; }

  // ── Markers ───────────────────────────────────────────────────────────────
  // A marker travels through renderBlocks() as a placeholder rubric in the
  // section it belongs to (so it sits under the right heading), then is
  // swapped for its real markup. Nothing else in the renderer changes.
  var markers = [];
  function marker(section, html) {
    markers.push(html);
    return { id: 'pb-marker-' + markers.length, type: 'rubric', section: section, text: '⟦PB:' + (markers.length - 1) + '⟧' };
  }
  function renderWithMarkers(blocks, into) {
    // `print: true` — a printed surface: a block carrying a print cue prints
    // as its cue, and the Beatitude verses as sung text
    // (features/beatitudes-print-cues.md). The book never meets a cue: the
    // edition's `omit` rule has already taken the Reader's troparia out.
    into.innerHTML = window.renderBlocks(blocks, { print: true });
    Array.prototype.forEach.call(into.querySelectorAll('.rubric'), function (el) {
      var m = /^⟦PB:(\d+)⟧$/.exec(el.textContent.trim());
      if (m) el.outerHTML = markers[+m[1]];
    });
  }

  // fonts.ready resolves before EB Garamond is ever requested, so measuring
  // after it alone measured Georgia (found in the 11-16 mockup). Load each
  // face explicitly first.
  function fontsIn() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    return Promise.all([
      '15pt "EB Garamond"', 'italic 15pt "EB Garamond"', '500 15pt "EB Garamond"',
      '12pt "Cinzel"', '600 12pt "Cinzel"',
    ].map(function (f) { return document.fonts.load(f).catch(function () {}); }))
      .then(function () { return document.fonts.ready; });
  }

  // ── The book ──────────────────────────────────────────────────────────────
  function bookBlocks(book) {
    var slots = {};
    book.slots.forEach(function (s) { slots[s.id] = s; });
    var resumeAt = {};
    (book.resumeAt || []).forEach(function (r) { resumeAt[r.stretch] = r.section; });
    var out = [];
    var lastSection = null;
    book.items.forEach(function (it, i) {
      if (it.kind === 'block') { out.push(it.block); lastSection = it.block.section; return; }
      if (it.kind === 'jump') {
        var st = book.stretches.filter(function (s) { return s.id === it.stretch; })[0];
        out.push(marker(st.fromSection,
          '<div class="pb-jump">▶ Continue on this week’s insert' +
          '<small>' + esc(it.label) + ' change every week. Return to this book at “◀ Resume here.”</small></div>'));
        lastSection = st.fromSection;
        return;
      }
      if (it.kind === 'resume') {
        var next = book.items.slice(i + 1).filter(function (x) { return x.kind === 'block'; })[0];
        var sec = next ? next.block.section : lastSection;
        out.push(marker(sec, '<div class="pb-resume">◀ Resume here<small>after the Holy Gospel on this week’s insert.</small></div>'));
        return;
      }
      if (it.kind === 'slot') {
        var s = slots[it.slot];
        if (s.usual && !s.usual.length) {
          // Usually nothing here (a second Communion hymn, the Blessing of
          // Grapes). The book prints nothing; in the rare week it appears, the
          // insert's "Also this week" names the section it belongs to.
          return;
        }
        if (s.usual) {
          if (s.varies) out.push(marker(s.usual[0].section, '<div class="pb-note">Unless this week’s insert appoints otherwise:</div>'));
          s.usual.forEach(function (b) { out.push(b); });
          lastSection = s.usual[s.usual.length - 1].section;
        } else {
          out.push(marker(s.section, '<div class="pb-note">This changes every week — see “Also this week” on the insert.</div>'));
          lastSection = s.section;
        }
      }
    });
    return out;
  }

  function showBook(book) {
    setTitle(book.title, 'Book edition ' + book.fingerprint + ' · built at ' + (book.builtFrom.commit || '?'));
    renderWithMarkers(bookBlocks(book), $('bk-source'));
    var measure = $('bk-measure');
    measure.innerHTML = $('bk-source').innerHTML;
    return fontsIn().then(function () {
      var pages = B.paginate(measure, $('bk-root'), esc(book.title), esc(book.parishName || ''));
      var n = pages.length, padded = Math.ceil(n / 4) * 4;
      var host = $('pb-pages');
      host.innerHTML = '';
      for (var i = 0; i < padded; i++) {
        var half = document.createElement('div');
        half.className = 'bk-half';
        half.innerHTML = (pages[i] || []).join('') + (i > 0 && pages[i] ? '<div class="pb-folio">' + (i + 1) + '</div>' : '');
        host.appendChild(half);
      }
      $('bk-sheets').innerHTML = '';
      pageRule('@page { size: 5.5in 8.5in; margin: 0; }');
      $('bk-sub').textContent = n + ' pages → ' + padded + ' for saddle-stitch (multiple of 4) · edition ' + book.fingerprint;
      document.body.dataset.pages = n;
      document.body.dataset.ready = '1';
      $('btn-print').disabled = false;
      fit();
    });
  }

  // ── The insert ────────────────────────────────────────────────────────────
  function insertBlocks(ins) {
    var drop = ins.citationsOnly && ins.citationsOnly.idPattern ? new RegExp(ins.citationsOnly.idPattern) : null;
    var out = [];
    ins.stretches.forEach(function (st, si) {
      st.blocks.forEach(function (b) { if (!(drop && drop.test(b.id))) out.push(b); });
      var last = st.blocks[st.blocks.length - 1];
      var r = (ins.resumeAt || [])[si];
      out.push(marker(last.section, '<div class="pb-resume">◀ Return to the book' +
        '<small>at “◀ Resume here”' + (r && r.section ? ' — ' + esc(r.section) : '') + '.</small></div>'));
    });
    if (ins.also.length) {
      out.push(marker('Also this week', '<div class="pb-note">Later in the service, where the book points here.</div>'));
      ins.also.forEach(function (a) {
        if (!a.blocks.length) {
          out.push(marker(a.section, '<div class="pb-note">Omitted this week.</div>'));
          return;
        }
        out.push(marker(a.blocks[0].section, '<div class="pb-note">' +
          (a.replacesUsual ? 'In place of what the book prints:' : 'At this point in the book:') + '</div>'));
        a.blocks.forEach(function (b) { out.push(b); });
      });
    }
    return out;
  }

  function showInsert(ins) {
    var when = new Date(ins.date + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    if (!ins.fits) {
      setTitle('No insert for this day', when);
      var src = '/api/liturgy?date=' + ins.date + '&translation=' + encodeURIComponent(parish);
      note('<strong>' + esc(ins.reason) + '.</strong> ' + (ins.misfit ? 'First difference: ' + esc(ins.misfit.reason) + ' at ' + esc(ins.misfit.anchor || ins.misfit.after || '') + (ins.misfit.section ? ' (' + esc(ins.misfit.section) + ')' : '') + '. ' : '') +
        '<a href="/booklet?src=' + encodeURIComponent(src) + '&title=' + encodeURIComponent('Divine Liturgy') + '&sub=' + encodeURIComponent(when) + '">Print the full booklet instead &rarr;</a>');
      document.body.dataset.ready = '1';
      return Promise.resolve();
    }
    var sub = when + (ins.tone ? ' · Tone ' + ins.tone : '');
    setTitle(ins.liturgicalLabel || 'This week', sub);
    renderWithMarkers(insertBlocks(ins), $('bk-source'));
    return fontsIn().then(function () {
      return B.prepare({
        sourceEl: $('bk-source'),
        svc: esc(ins.liturgicalLabel || 'This Week'),
        subtitle: esc(sub) + '<br>Insert for ' + esc(ins.editionTitle),
        duplex: true, rotateBack: B.getSetting('rotateBack', true),
      });
    }).then(function (c) {
      // Every printed half carries the book edition it was cut against, so a
      // stale insert in a new book (or the reverse) is visible on the page.
      Array.prototype.forEach.call(document.querySelectorAll('#bk-sheets .bk-half'), function (h) {
        if (h.innerHTML.trim()) h.insertAdjacentHTML('beforeend',
          '<div class="pb-edition"><span>' + esc(ins.parishName || '') + '</span><span>' + esc(ins.date) + ' · book ' + esc(ins.fingerprint) + '</span></div>');
      });
      pageRule('@page { size: 11in 8.5in; margin: 0; }');
      $('bk-sub').textContent = sub + ' · ' + c.halfPages + ' half-pages · ' + c.sheets + ' sheet' + (c.sheets === 1 ? '' : 's') + ' to fold';
      document.body.dataset.halfPages = c.halfPages;
      document.body.dataset.sheets = c.sheets;
      document.body.dataset.ready = '1';
      $('btn-print').disabled = false;
      fit();
    });
  }

  // Exposed for the e2e measurement sweep and contract tests — the same
  // functions the page itself uses, so a measurement is of the real layout.
  window.ParishBook = { bookBlocks: bookBlocks, insertBlocks: insertBlocks, renderWithMarkers: renderWithMarkers, fontsIn: fontsIn };

  // ── Wiring ────────────────────────────────────────────────────────────────
  function fit() {
    var avail = Math.max(240, document.documentElement.clientWidth - 16);
    $('bk-sheets').style.zoom = Math.min(1, avail / 1056);
    $('pb-pages').style.zoom = Math.min(1, avail / 528);
  }
  window.addEventListener('resize', fit);
  $('btn-print').addEventListener('click', function () { window.print(); });

  function fail(err) { $('bk-sub').textContent = 'Could not build: ' + (err && err.message ? err.message : err); }
  function get(u) { return fetch(u).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); }); }

  function nextSunday() {
    var d = new Date(); d.setHours(12);
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return d.toISOString().slice(0, 10);
  }

  if (date) {
    $('btn-print-label').textContent = 'Print insert';
    links('<label class="bk-toggle">Week of <input type="date" id="pb-date" value="' + esc(date) + '"></label>' +
      '<a class="bk-link" id="pb-book-link" href="/parish-book?parish=' + encodeURIComponent(parish) + '">The book &rarr;</a>' +
      // The book leaves out the Reader's Beatitude troparia; the Reader still
      // needs them. Their copy is the full booklet with every text.
      '<a class="bk-link" href="/booklet?' + esc(new URLSearchParams({
        src: '/api/liturgy?date=' + date + '&translation=' + encodeURIComponent(parish) + '&parish=' + encodeURIComponent(parish),
        title: 'Divine Liturgy', sub: date, readers: '1' }).toString()) + '">Reader’s copy &rarr;</a>');
    $('pb-date').addEventListener('change', function () {
      if (this.value) location.search = '?parish=' + encodeURIComponent(parish) + '&date=' + this.value;
    });
    get('/api/parish-book/insert?parish=' + encodeURIComponent(parish) + '&date=' + encodeURIComponent(date))
      .then(function (ins) {
        if (ins.edition) $('pb-book-link').href = '/parish-book?parish=' + encodeURIComponent(parish) + '&edition=' + encodeURIComponent(ins.edition);
        return showInsert(ins);
      }).catch(fail);
  } else {
    $('btn-print-label').textContent = 'Print book';
    get('/api/parish-book?parish=' + encodeURIComponent(parish)).then(function (list) {
      var eds = list.editions || [];
      var ed = edition || (eds[0] && eds[0].id);
      links(eds.map(function (e) {
        return '<a class="bk-link" href="?parish=' + encodeURIComponent(parish) + '&edition=' + encodeURIComponent(e.id) + '"' +
          (e.id === ed ? ' style="color:var(--rubric)"' : '') + '>' + esc(e.title) + '</a>';
      }).join('') + '<a class="bk-link" href="?parish=' + encodeURIComponent(parish) + '&date=' + nextSunday() + '">This week’s insert &rarr;</a>');
      if (!ed) { setTitle('Parish Book', 'No editions for this parish yet.'); return; }
      return get('/api/parish-book/book?parish=' + encodeURIComponent(parish) + '&edition=' + encodeURIComponent(ed)).then(showBook);
    }).catch(fail);
  }
})();
