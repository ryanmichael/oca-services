#!/usr/bin/env node
'use strict';

// Choir-packet diff — measures M3 (packet fidelity) from
// docs/measuring-accuracy-proposal.md.
//
// The choir director's packets are the only ground truth about what the parish
// ACTUALLY SINGS. Their OCR tags each page `[music]` or `[text]`, and the
// `[text]` pages hold complete, line-broken hymn text with the stichera
// position numbers — 104 pages and 142 hymns across the 9 packets we hold.
// `docs/choir-packets/index.json` extracts only a 4-6 word incipit from them,
// which is too little signal to identify a hymn across translations (a
// same-hymn pair scores 0.56 at 25 characters and 0.86 at full length, while
// different hymns score below 0.26 at every length). This reads the full text.
//
// TWO AXES, always reported together. Collapsing them is the mistake that made
// a first draft report 68% "absent" on a date where every hymn was present in a
// different translation:
//
//   LOCATED  — do we print this hymn at all? (register-folded similarity)
//   VERBATIM — do we print it in the parish's own wording?
//
// Printing the RIGHT hymn in OTHER words is a different problem from printing
// the WRONG hymn, and they have different owners.
//
// ALIGNMENT IS MEASURED, NOT ASSUMED. The director uses two filename
// conventions: Great Vespers sheets are named by the civil evening (our API
// date) and the two most recent Daily Vespers sheets by the CONTENT date.
// Assuming one convention reported Daily Vespers as 0/13 when it is 10/12. Each
// sheet is scored at -1, 0 and +1 and the best offset is printed.
//
//   node scripts/choir-packet-diff.js
//   node scripts/choir-packet-diff.js --service liturgy
//   node scripts/choir-packet-diff.js --sheet great-vespers-2026-10-03   # verbose
//   node scripts/choir-packet-diff.js --capture-baseline audit/packet-baseline.json
//   node scripts/choir-packet-diff.js --check audit/packet-baseline.json   # exit 2 on NEW
//
// Reports: audit/reports/choir-packet-diff.md
// Read-only. Requires a server (see --http) and FAILS LOUDLY without one.

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const PACKET_DIR  = path.join(ROOT, 'docs', 'choir-packets');
const REPORT_DIR  = path.join(ROOT, 'audit', 'reports');

// A hymn is LOCATED at this register-folded trigram similarity. Calibrated
// against same-hymn/different-hymn pairs: same-hymn p05 = 0.76 at 60+
// characters, different-hymn p95 = 0.16. 0.55 sits in the gap with margin on
// both sides. Re-derive with --calibrate if the corpus changes materially.
const LOCATED_MIN  = 0.55;
const VERBATIM_MIN = 0.92;

// Short pieces carry too little signal; below this a score is noise.
const MIN_LETTERS = 60;

const SECTION_FURNITURE =
  /^(?:\d+|[ivx]+|soprano|alto|tenor|bass|common chant|©.*|all other rights.*|.*orthodox church in america.*)$/i;

function parseArgs(argv) {
  const args = { http: 'http://localhost:3000', translation: 'st-john-damascus-tyler',
                 service: null, sheet: null, captureBaseline: null, check: null,
                 shifts: [-1, 0, 1] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--http') args.http = argv[++i];
    else if (a === '--translation') args.translation = argv[++i];
    else if (a === '--service') args.service = argv[++i];
    else if (a === '--sheet') args.sheet = argv[++i];
    else if (a === '--no-shift') args.shifts = [0];
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

// ── text comparison ────────────────────────────────────────────────────────

const letters = (s) => String(s || '').toLowerCase().replace(/[^a-z]+/g, '');

// Fold the register so thee/thou vs you is not counted as a content
// difference. The packets are in the parish's modern English; our stored text
// may be either.
const FOLD = [
  [/\bthou\b/g, 'you'], [/\bthee\b/g, 'you'], [/\bthy\b/g, 'your'],
  [/\bthine\b/g, 'your'], [/\bye\b/g, 'you'], [/\bdidst\b/g, 'did'],
  [/\bhast\b/g, 'have'], [/\bhath\b/g, 'has'], [/\bart\b/g, 'are'],
  [/\bwast\b/g, 'were'], [/\bdost\b/g, 'do'], [/\bshalt\b/g, 'shall'],
];
const fold = (s) => letters(FOLD.reduce((a, [re, to]) => a.replace(re, to),
  String(s || '').toLowerCase().replace(/[^a-z' ]+/g, ' ')));

function trigrams(s) {
  const t = new Set();
  for (let i = 0; i + 3 <= s.length; i++) t.add(s.slice(i, i + 3));
  return t;
}
/** Dice similarity on character trigrams, 0..1 — survives word order. */
function dice(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const g of A) if (B.has(g)) n++;
  return (2 * n) / (A.size + B.size);
}

// ── packet reading ─────────────────────────────────────────────────────────

/** The `[text]` page bodies of one OCR file. */
function textPages(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const re = /--- page (\d+) \[(\w+)\] ---/g;
  const marks = [];
  let m;
  while ((m = re.exec(raw))) marks.push({ page: +m[1], kind: m[2], end: re.lastIndex, at: m.index });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].kind !== 'text') continue;
    out.push(raw.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].at : raw.length));
  }
  return out;
}

/**
 * A [text] page is a run of hymns separated by a bare position number
 * (6,5,4,3,2,1 — the stichera count down) or a Glory / Both-now heading.
 */
function hymnPieces(body) {
  const lines = body.split('\n').map(l => l.trim());
  const pieces = [];
  let cur = null;
  const flush = () => { if (cur && cur.text.length) pieces.push(cur); };
  for (const l of lines) {
    if (!l) continue;
    if (/^\d{1,2}$/.test(l)) { flush(); cur = { marker: l, text: [] }; continue; }
    if (/^(glory|both now)/i.test(l) && l.length < 24) {
      flush();
      cur = { marker: /both/i.test(l) ? 'Now' : 'Glory', text: [] };
      continue;
    }
    if (!/[a-z]{3}/.test(l)) continue;             // all-caps headings and staff marks
    if (SECTION_FURNITURE.test(l)) continue;
    if (!cur) cur = { marker: '?', text: [] };
    cur.text.push(l);
  }
  flush();
  return pieces
    .map(p => ({ marker: p.marker, text: p.text.join(' ') }))
    .filter(p => letters(p.text).length >= MIN_LETTERS);
}

/** Every dated, in-scope OCR sheet we hold. */
function sheets() {
  const out = [];
  if (!fs.existsSync(PACKET_DIR)) return out;
  for (const d of fs.readdirSync(PACKET_DIR)) {
    const dir = path.join(PACKET_DIR, d, 'ocr');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/^(great-vespers|daily-vespers|vespers|liturgy)-(\d{4}-\d{2}-\d{2})\.txt$/);
      if (m) out.push({ file: path.join(dir, f), name: f.replace('.txt', ''),
                        service: m[1], date: m[2], packet: d });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── rendering ──────────────────────────────────────────────────────────────

const shiftDate = (d, n) => {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

async function renderHymns(args, service, date) {
  const isLiturgy = service === 'liturgy';
  const u = new URL(`${args.http}/api/${isLiturgy ? 'liturgy' : 'service'}`);
  u.searchParams.set('date', date);
  if (!isLiturgy) u.searchParams.set('service', 'vespers');
  if (args.translation) u.searchParams.set('translation', args.translation);
  let r;
  try { r = await fetch(u); }
  catch (_) { throw new Error(`cannot reach ${args.http} — start the server (node server.js) first`); }
  if (!r.ok) return null;
  const j = await r.json();
  return (j.blocks || []).filter(b => b.type === 'hymn' && String(b.text || '').length > 40);
}

/**
 * The longest run of hymns that are in the packet's order.
 *
 * Someone following the service on our page loses their place when the hymns
 * are sequenced differently from the way the choir sings them, even if every
 * hymn is present and correctly worded. That is a distinct failure from a wrong
 * or missing hymn, and it is what shipped green on 2026-07-12 when four
 * Resurrection troparia sat two stichoi late and a human caught it mid-Liturgy
 * (see feedback_assert_structure_not_labels).
 *
 * Longest increasing subsequence of the matched block positions: of N located
 * hymns, how many form a correctly-ordered run. N means perfect order.
 */
function inOrderRun(positions) {
  if (!positions.length) return 0;
  const tails = [];
  for (const p of positions) {
    let lo = 0, hi = tails.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] <= p) lo = mid + 1; else hi = mid; }
    tails[lo] = p;
  }
  return tails.length;
}

/** Score one sheet's pieces against one rendered date. */
function scoreAgainst(pieces, hymns) {
  let located = 0, verbatim = 0;
  const misses = [];
  const positions = [];          // index in OUR render, in PACKET order
  for (const p of pieces) {
    const pf = fold(p.text);
    let best = 0, bestH = null, bestIdx = -1;
    for (let i = 0; i < hymns.length; i++) {
      const s = dice(pf, fold(hymns[i].text));
      if (s > best) { best = s; bestH = hymns[i]; bestIdx = i; }
    }
    if (best >= LOCATED_MIN) {
      located++;
      positions.push(bestIdx);
      if (dice(letters(p.text), letters(bestH.text)) >= VERBATIM_MIN) verbatim++;
    } else {
      misses.push({ marker: p.marker, score: +best.toFixed(2), head: p.text.slice(0, 70) });
    }
  }
  return { located, verbatim, misses, inOrder: inOrderRun(positions), positions };
}

// ── main ───────────────────────────────────────────────────────────────────

(async () => {
  const args = parseArgs(process.argv);
  let all = sheets();
  if (args.service) all = all.filter(s => s.service === args.service ||
    (args.service === 'vespers' && /vespers/.test(s.service)));
  if (args.sheet)   all = all.filter(s => s.name === args.sheet);

  if (!all.length) {
    console.error('No dated in-scope OCR sheets found under docs/choir-packets/*/ocr/.');
    console.error('Run `npm run choir:ocr` to backfill, or check --service/--sheet.');
    process.exit(1);
  }

  // ── Score every sheet, choosing alignment per sheet ──────────────────────
  const rows = [];
  for (const s of all) {
    const pieces = textPages(s.file).flatMap(hymnPieces);
    let best = { located: -1, verbatim: 0, misses: [], shift: 0, inOrder: 0 };
    for (const n of args.shifts) {
      const hymns = await renderHymns(args, s.service, shiftDate(s.date, n));
      if (!hymns) continue;
      const r = scoreAgainst(pieces, hymns);
      if (r.located > best.located) best = { ...r, shift: n };
    }
    rows.push({ ...s, pieces: pieces.length, ...best, pieceTexts: pieces });
  }

  if (!rows.some(r => r.pieces > 0)) {
    console.error('FATAL: no sheet yielded any hymn text — the OCR page tags or the page');
    console.error('layout changed, and every sheet would score 0. Inspect the OCR.');
    process.exit(1);
  }

  // ── Falsification, before any number is reported ─────────────────────────
  // A comparison that matches an unrelated date as well as the right one is
  // measuring nothing. The control is the BEST-SCORING sheet in this selection,
  // not the first one: picking the first made `--service liturgy` abort on its
  // own real 0/5, which is a finding about Liturgy, not about the matcher.
  const probe = rows.reduce((a, b) => (b.located > a.located ? b : a), rows[0]);
  const alienDate  = shiftDate(probe.date, 180);
  const alienHymns = await renderHymns(args, probe.service, alienDate);
  const alien = alienHymns ? scoreAgainst(probe.pieceTexts, alienHymns).located : 0;
  console.log(`falsification: ${probe.name} (best in selection) vs its own date ` +
              `-> ${probe.located}/${probe.pieces} located;`);
  console.log(`               vs an unrelated date (${alienDate}) -> ${alien}/${probe.pieces}`);
  if (probe.located <= 0) {
    console.error('FATAL: no sheet in this selection matched anything, so the matcher could');
    console.error('not be validated here. Run without --service/--sheet to validate it, then');
    console.error('narrow — a universal zero is a finding only once the matcher is known good.');
    process.exit(1);
  }
  if (alien >= probe.located) {
    console.error('FATAL: the matcher scores an unrelated date as well as the right one.');
    process.exit(1);
  }
  console.log('the comparison can fail — reporting.\n');

  if (args.sheet) {
    const r = rows[0];
    console.log(`--- ${r.name} (alignment ${r.shift > 0 ? '+' : ''}${r.shift}) ---`);
    console.log(`pieces ${r.pieces} · located ${r.located} · in order ${r.inOrder} · verbatim ${r.verbatim}`);
    console.log(`our render positions, in packet order: ${JSON.stringify(r.positions)}`);
    for (const m of r.misses) console.log(`  not located [${m.marker}] best=${m.score}  "${m.head}"`);
    return;
  }

  // ── Aggregate ───────────────────────────────────────────────────────────
  const GROUPS = [['Great Vespers', 'great-vespers'], ['Daily Vespers', 'daily-vespers'],
                  ['Vespers (unlabelled)', 'vespers'], ['Divine Liturgy', 'liturgy']];
  for (const r of rows) delete r.pieceTexts;
  const agg = (rs) => rs.reduce((a, r) => ({
    sheets: a.sheets + 1, pieces: a.pieces + r.pieces,
    located: a.located + Math.max(0, r.located), verbatim: a.verbatim + (r.verbatim || 0),
    inOrder: a.inOrder + (r.inOrder || 0),
  }), { sheets: 0, pieces: 0, located: 0, verbatim: 0, inOrder: 0 });

  const L = [];
  L.push(`# Choir-packet diff — ${new Date().toISOString()}`);
  L.push('');
  L.push(`Translation ${args.translation || '(default)'} · via ${args.http}`);
  L.push('');
  L.push('Measures M3 (packet fidelity) from `docs/measuring-accuracy-proposal.md`.');
  L.push('The packets are the only ground truth about what the parish actually sings.');
  L.push('');
  L.push('**LOCATED** = we print that hymn at all. **VERBATIM** = in the parish\'s wording.');
  L.push('Printing the right hymn in other words is a different problem from the wrong hymn.');
  L.push('');
  L.push('| sheet | align | hymns on it | located | in order | verbatim |');
  L.push('|---|---|---|---|---|---|');
  for (const r of rows)
    L.push(`| \`${r.name}\` | ${r.shift > 0 ? '+' : ''}${r.shift} | ${r.pieces} | ${r.located} | ${r.inOrder} | ${r.verbatim} |`);
  L.push('');
  L.push('## by service');
  L.push('');
  L.push('| service | sheets | hymns | located | in order | verbatim |');
  L.push('|---|---|---|---|---|---|');
  const summary = {};
  for (const [label, key] of GROUPS) {
    const rs = rows.filter(r => r.service === key);
    if (!rs.length) continue;
    const a = agg(rs);
    summary[key] = a;
    const p = (n) => a.pieces ? `${n} (${(100 * n / a.pieces).toFixed(0)}%)` : String(n);
    L.push(`| ${label} | ${a.sheets} | ${a.pieces} | ${p(a.located)} | ${p(a.inOrder)} | ${p(a.verbatim)} |`);
    console.log(`${label.padEnd(21)} sheets ${String(a.sheets).padStart(2)} · hymns ${String(a.pieces).padStart(3)} · ` +
                `located ${p(a.located)} · in order ${p(a.inOrder)} · verbatim ${p(a.verbatim)}`);
  }
  const total = agg(rows);
  summary._all = total;
  L.push(`| **ALL** | ${total.sheets} | ${total.pieces} | ${total.located} | ${total.inOrder} | ${total.verbatim} |`);
  L.push('');
  L.push('## alignment chosen, by service');
  L.push('');
  L.push('The director uses more than one filename convention; the offset is measured.');
  L.push('');
  for (const [label, key] of GROUPS) {
    const rs = rows.filter(r => r.service === key);
    if (!rs.length) continue;
    const c = {};
    rs.forEach(r => c[r.shift] = (c[r.shift] || 0) + 1);
    L.push(`- ${label}: \`${JSON.stringify(c)}\``);
  }
  L.push('');
  L.push('## hymns the packet appoints that we did not locate');
  L.push('');
  for (const r of rows) {
    if (!r.misses || !r.misses.length) continue;
    L.push(`### \`${r.name}\``);
    for (const m of r.misses) L.push(`- [${m.marker}] best=${m.score} — "${m.head}"`);
    L.push('');
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const reportPath = path.join(REPORT_DIR, 'choir-packet-diff.md');
  fs.writeFileSync(reportPath, L.join('\n'));
  console.log(`Report: ${path.relative(ROOT, reportPath)}`);

  if (args.captureBaseline) {
    fs.writeFileSync(args.captureBaseline, JSON.stringify(summary, null, 2) + '\n');
    console.log(`Baseline written: ${args.captureBaseline}`);
    return;
  }

  if (args.check) {
    let base;
    try { base = JSON.parse(fs.readFileSync(args.check, 'utf8')); }
    catch (e) { console.error(`cannot read baseline ${args.check}: ${e.message}`); process.exit(1); }
    const worse = [], better = [];
    for (const [key, a] of Object.entries(summary)) {
      const b = base[key];
      if (!b) { better.push(`${key}: new in this run (${a.located}/${a.pieces} located)`); continue; }
      // Compare RATES, not counts — adding a packet raises the denominator.
      const rate = (x) => x.pieces ? x.located / x.pieces : 0;
      const vrate = (x) => x.pieces ? x.verbatim / x.pieces : 0;
      if (rate(a) < rate(b) - 0.001)
        worse.push(`${key}: located ${(100*rate(b)).toFixed(0)}% -> ${(100*rate(a)).toFixed(0)}%`);
      else if (rate(a) > rate(b) + 0.001)
        better.push(`${key}: located ${(100*rate(b)).toFixed(0)}% -> ${(100*rate(a)).toFixed(0)}%`);
      if (vrate(a) < vrate(b) - 0.001)
        worse.push(`${key}: verbatim ${(100*vrate(b)).toFixed(0)}% -> ${(100*vrate(a)).toFixed(0)}%`);
      const orate = (x) => x.pieces ? (x.inOrder || 0) / x.pieces : 0;
      if (orate(a) < orate(b) - 0.001)
        worse.push(`${key}: in order ${(100*orate(b)).toFixed(0)}% -> ${(100*orate(a)).toFixed(0)}%`);
    }
    if (better.length) {
      console.log('\nimproved since baseline (refresh it when convenient):');
      better.forEach(l => console.log(`  - ${l}`));
    }
    if (worse.length) {
      console.error(`\n[choir-packet-diff] FAIL — ${worse.length} regression(s):`);
      worse.forEach(l => console.error(`  + ${l}`));
      process.exit(2);
    }
    console.log('\n[choir-packet-diff] OK — no regression against baseline.');
  }
})().catch(err => { console.error(err.message); process.exit(1); });
