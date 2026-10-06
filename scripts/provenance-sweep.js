#!/usr/bin/env node
'use strict';

// Provenance sweep — measures M1 (book-named rate) and M2 (parish-book
// conformance) from docs/measuring-accuracy-proposal.md.
//
// For every date of a year it renders the service, takes each SUNG hymn drawn
// from a liturgical book, and resolves which TRANSLATION it came from. Two
// questions, reported separately because they have different owners:
//
//   M1  of those hymns, how many have a translation we DETERMINED rather than
//       one the route DEFAULTED? (`api-service.js:196` maps unknown -> 'OCA',
//       so the rendered page overstates what is actually known)
//   M2  on how many dates is every sung hymn from a book this parish uses?
//
// Three columns, never two. A date with no sung stichera at all (2026-04-02,
// the Lenten weekday gap) must not be able to score as clean by having nothing
// to be non-conformant with.
//
//   node scripts/provenance-sweep.js
//   node scripts/provenance-sweep.js --translation st-john-damascus-tyler
//   node scripts/provenance-sweep.js --services vespers,liturgy
//   node scripts/provenance-sweep.js --date 2026-02-12          # one date, verbose
//   node scripts/provenance-sweep.js --capture-baseline audit/provenance-baseline.json
//   node scripts/provenance-sweep.js --check audit/provenance-baseline.json   # exit 2 on NEW
//
// Reports: audit/reports/provenance-sweep.md
// Read-only. Requires a server (see --http); FAILS LOUDLY if it cannot reach
// one, because a sweep that silently checks nothing is this project's most
// repeated defect (audit/runner.js:65).

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, 'audit', 'reports');

const { familyOfText, LABEL, index } =
  require(path.join(ROOT, 'server-lib', 'sources', 'translation-provenance'));

// Sections a congregation actually sings, and the `source` values that name a
// liturgical book. A block outside both is fixed text, where 'OCA' genuinely is
// the base and the default is correct.
const SUNG_SECTIONS = new Set([
  'Lord, I Have Cried', 'Aposticha', 'Litya', 'Lauds', 'Praises',
]);
const BOOK_SOURCES = new Set(['octoechos', 'menaion', 'triodion', 'pentecostarion']);

// Books St John of Damascus is believed to sing from. INFERRED from provenance
// labels across the year, NOT confirmed by the choir director — question 1 of
// Appendix A in the proposal. Changing this changes M2, so it is named here
// rather than buried in a filter.
const PARISH_BOOKS = new Set(['OCA', 'Daily Octoechos', 'Myrrh-bearers (Raphaela)']);

function parseArgs(argv) {
  const args = { year: 2026, translation: null, services: ['vespers'], date: null,
                 http: 'http://localhost:3000', captureBaseline: null, check: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--year') args.year = parseInt(argv[++i], 10);
    else if (a === '--translation') args.translation = argv[++i];
    else if (a === '--services') args.services = argv[++i].split(',').map(s => s.trim());
    else if (a === '--date') args.date = argv[++i];
    else if (a === '--http') args.http = argv[++i];
    else if (a === '--capture-baseline') args.captureBaseline = argv[++i];
    else if (a === '--check') args.check = argv[++i];
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { console.error(`unknown argument: ${a}`); usage(); process.exit(1); }
  }
  return args;
}

function usage() {
  console.log(fs.readFileSync(__filename, 'utf8')
    .split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
}

function datesOf(year) {
  const out = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

async function fetchService(httpBase, service, date, translation) {
  const endpoint = service === 'vespers' ? 'service' : service;
  const u = new URL(`${httpBase}/api/${endpoint}`);
  u.searchParams.set('date', date);
  if (service === 'vespers') u.searchParams.set('service', 'vespers');
  if (translation) u.searchParams.set('translation', translation);
  let r;
  try {
    r = await fetch(u);
  } catch (err) {
    // An unreachable server is not "every date is clean". Swallowing this is
    // exactly how `npm run audit` printed 0/0/0 against a dead port.
    throw new Error(`cannot reach ${httpBase} — start the server (node server.js) first`);
  }
  if (!r.ok) return { _status: r.status };
  return r.json();
}

/** Classify one rendered service. */
function classify(j) {
  const blocks = j.blocks || [];
  const sung = blocks.filter(b =>
    b.type === 'hymn' && SUNG_SECTIONS.has(b.section || '') && BOOK_SOURCES.has(String(b.source || '')));

  const fams = {}, labels = {}, unresolvedBySource = {};
  let defaulted = 0;
  for (const b of sung) {
    const fam = familyOfText(b.text);
    fams[fam] = (fams[fam] || 0) + 1;
    const claimed = b.provenance || '(none)';
    labels[claimed] = (labels[claimed] || 0) + 1;
    if (fam === 'unknown') {
      unresolvedBySource[b.source] = (unresolvedBySource[b.source] || 0) + 1;
      // The page asserts a book for a hymn whose book we never determined.
      if (claimed !== 'unknown' && claimed !== '(none)') defaulted++;
    }
  }

  const claimedLabels = Object.keys(labels);
  let conformance;
  if (!sung.length)                                        conformance = 'no-content';
  else if (claimedLabels.every(l => PARISH_BOOKS.has(l)))  conformance = 'pass';
  else                                                     conformance = 'fail';

  return {
    serviceName: j.serviceName || '',
    season: j.season || '',
    sung: sung.length,
    resolved: sung.length - (fams.unknown || 0),
    unresolved: fams.unknown || 0,
    defaulted,
    fams, labels, unresolvedBySource,
    conformance,
    offBooks: claimedLabels.filter(l => !PARISH_BOOKS.has(l)).sort(),
    generalMenaion: blocks.filter(b => /General/i.test(String(b.provenance || ''))).length,
    anyProvenance: blocks.some(b => b.provenance),
    totalBlocks: blocks.length,
  };
}

function summarise(rows) {
  const rendered = rows.filter(r => !r.skipped);
  const t = {
    dates: rows.length, rendered: rendered.length,
    sung: 0, resolved: 0, unresolved: 0, defaulted: 0,
    pass: 0, fail: 0, noContent: 0,
    datesUnresolved: 0, datesGeneralMenaion: [], datesNoProvenance: 0,
    byLabel: {}, byFamily: {}, unresolvedBySource: {}, offBookCombos: {},
  };
  for (const r of rendered) {
    const c = r.c;
    t.sung += c.sung; t.resolved += c.resolved; t.unresolved += c.unresolved;
    t.defaulted += c.defaulted;
    if (c.conformance === 'pass') t.pass++;
    else if (c.conformance === 'fail') t.fail++;
    else t.noContent++;
    if (c.unresolved) t.datesUnresolved++;
    if (c.generalMenaion) t.datesGeneralMenaion.push(r.date);
    if (!c.anyProvenance) t.datesNoProvenance++;
    for (const [k, v] of Object.entries(c.labels))   t.byLabel[k]  = (t.byLabel[k] || 0) + v;
    for (const [k, v] of Object.entries(c.fams))     t.byFamily[k] = (t.byFamily[k] || 0) + v;
    for (const [k, v] of Object.entries(c.unresolvedBySource))
      t.unresolvedBySource[k] = (t.unresolvedBySource[k] || 0) + v;
    if (c.conformance === 'fail') {
      const key = c.offBooks.join(' + ');
      t.offBookCombos[key] = (t.offBookCombos[key] || 0) + 1;
    }
  }
  return t;
}

function renderReport(byService, args) {
  const L = [];
  L.push(`# Provenance sweep — ${new Date().toISOString()}`);
  L.push('');
  L.push(`Year ${args.year} · services ${args.services.join(', ')} · translation ` +
         `${args.translation || '(default)'} · via ${args.http}`);
  L.push('');
  L.push('Measures M1 (book-named rate) and M2 (parish-book conformance) from');
  L.push('`docs/measuring-accuracy-proposal.md`.');
  L.push('');
  L.push(`Parish books counted as conformant: ${[...PARISH_BOOKS].join(', ')}.`);
  L.push('**Inferred from the corpus, not confirmed by the choir director.**');
  L.push('');

  for (const [service, t] of Object.entries(byService)) {
    L.push(`## ${service}`);
    L.push('');
    L.push(`- dates rendered: **${t.rendered} / ${t.dates}**`);
    L.push(`- sung book-hymn blocks: **${t.sung}**`);
    if (t.sung) {
      const pct = (100 * t.resolved / t.sung).toFixed(1);
      L.push(`- **M1 book-named rate: ${t.resolved} / ${t.sung} (${pct}%)**`);
      L.push(`  - unresolvable: ${t.unresolved} on ${t.datesUnresolved} dates`);
      L.push(`  - of those, **${t.defaulted} display a book name that was defaulted, not determined**`);
      if (Object.keys(t.unresolvedBySource).length)
        L.push(`  - unresolvable by source file: \`${JSON.stringify(t.unresolvedBySource)}\``);
      L.push(`- **M2 conformance: ${t.pass} pass · ${t.fail} fail · ${t.noContent} no-content**`);
      if (Object.keys(t.offBookCombos).length) {
        L.push('  - non-parish books, by date count:');
        for (const [k, v] of Object.entries(t.offBookCombos).sort((a, b) => b[1] - a[1]))
          L.push(`    - ${k || '(none)'}: ${v}`);
      }
      L.push(`- translation families (blocks): \`${JSON.stringify(t.byFamily)}\``);
      L.push(`- \`block.provenance\` claims: \`${JSON.stringify(t.byLabel)}\``);
    }
    L.push(`- dates with NO provenance on any block: **${t.datesNoProvenance}**` +
           (t.datesNoProvenance === t.rendered && t.rendered ? ' — *every date; this service cannot be reported to clergy*' : ''));
    L.push(`- dates using a General Menaion (generic) text: **${t.datesGeneralMenaion.length}**` +
           (t.datesGeneralMenaion.length ? ` — ${t.datesGeneralMenaion.join(', ')}` : ''));
    L.push('');
  }
  return L.join('\n');
}

/** The comparable shape for --capture-baseline / --check. */
function baselineOf(byService) {
  const out = {};
  for (const [svc, t] of Object.entries(byService)) {
    out[svc] = {
      sung: t.sung, resolved: t.resolved, unresolved: t.unresolved,
      defaulted: t.defaulted, pass: t.pass, fail: t.fail, noContent: t.noContent,
      datesGeneralMenaion: t.datesGeneralMenaion,
    };
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv);

  // ── Falsification, before any number is reported ─────────────────────────
  // The translation index silently covered only the Octoechos once before, when
  // a `require` of the wrong sqlite binding was swallowed: 1,587 texts instead
  // of 5,000+, zero Lambertsen, zero Raphaela. A detector blind to two of four
  // translations reports the corpus far cleaner than it is.
  const idx = index();
  if (!idx._dbRows) {
    console.error(`FATAL: translation index holds no DB rows (${idx._dbError || 'unknown'}).`);
    console.error('Every hymn would resolve to "unknown" and the sweep would be meaningless.');
    process.exit(1);
  }
  console.log(`index: ${idx.size} texts (${idx._dbRows} DB rows) · translation ${args.translation || '(default)'}`);

  // NOTE: the index is built from octoechos.json + the stichera table only.
  // Triodion and Pentecostarion are NOT indexed, so their hymns resolve
  // 'unknown' by construction. That is the finding, not a bug in this script.

  const dates = args.date ? [args.date] : datesOf(args.year);
  const byService = {};
  const allRows = {};

  for (const service of args.services) {
    const rows = [];
    for (const date of dates) {
      const j = await fetchService(args.http, service, date, args.translation);
      if (j._status) { rows.push({ date, skipped: j._status }); continue; }
      rows.push({ date, c: classify(j) });
    }
    allRows[service] = rows;
    byService[service] = summarise(rows);
  }

  // Single-date mode: print the detail and stop.
  if (args.date) {
    for (const service of args.services) {
      const r = allRows[service][0];
      console.log(`\n--- ${service} ${args.date} ---`);
      if (r.skipped) { console.log(`  not served (HTTP ${r.skipped})`); continue; }
      console.log(JSON.stringify(r.c, null, 2));
    }
    return;
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'provenance-sweep.md');
  fs.writeFileSync(reportPath, renderReport(byService, args));

  for (const [svc, t] of Object.entries(byService)) {
    const pct = t.sung ? (100 * t.resolved / t.sung).toFixed(1) : '--';
    console.log(`${svc}: M1 ${t.resolved}/${t.sung} (${pct}%) named · ` +
                `${t.defaulted} defaulted · M2 ${t.pass} pass / ${t.fail} fail / ${t.noContent} no-content · ` +
                `${t.datesNoProvenance} dates with no provenance at all`);
  }
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);

  const current = baselineOf(byService);

  if (args.captureBaseline) {
    fs.writeFileSync(args.captureBaseline, JSON.stringify(current, null, 2) + '\n');
    console.log(`Baseline written: ${args.captureBaseline}`);
    return;
  }

  if (args.check) {
    let base;
    try { base = JSON.parse(fs.readFileSync(args.check, 'utf8')); }
    catch (e) { console.error(`cannot read baseline ${args.check}: ${e.message}`); process.exit(1); }

    // Ratchet, in the shape of scripts/rescrape-diff.js: alert only on what got
    // WORSE, and say plainly when something improved so the baseline gets
    // refreshed deliberately rather than drifting.
    const worse = [], better = [];
    for (const [svc, c] of Object.entries(current)) {
      const b = base[svc];
      if (!b) { worse.push(`${svc}: not in baseline`); continue; }
      const cmp = (key, dir) => {
        const d = c[key] - b[key];
        if (d === 0) return;
        const bad = dir === 'down' ? d > 0 : d < 0;
        (bad ? worse : better).push(`${svc}.${key}: ${b[key]} -> ${c[key]}`);
      };
      cmp('unresolved', 'down');
      cmp('defaulted', 'down');
      cmp('fail', 'down');
      cmp('noContent', 'down');
      cmp('resolved', 'up');
      cmp('pass', 'up');
      const addedGM = (c.datesGeneralMenaion || []).filter(d => !(b.datesGeneralMenaion || []).includes(d));
      if (addedGM.length) worse.push(`${svc}: new General-Menaion dates ${addedGM.join(', ')}`);
    }

    if (better.length) {
      console.log(`\nimproved since baseline (refresh it when convenient):`);
      better.forEach(l => console.log(`  - ${l}`));
    }
    if (worse.length) {
      console.error(`\n[provenance-sweep] FAIL — ${worse.length} regression(s):`);
      worse.forEach(l => console.error(`  + ${l}`));
      process.exit(2);
    }
    console.log('\n[provenance-sweep] OK — no regression against baseline.');
  }
})().catch(err => { console.error(err.message); process.exit(1); });
