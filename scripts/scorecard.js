#!/usr/bin/env node
'use strict';

// Scorecard — the four numbers from §1 of docs/measuring-accuracy-proposal.md,
// in one place, tracked over time.
//
// SCOPE: Vespers and Divine Liturgy, for St John of Damascus (Tyler).
//
// WHO IT IS FOR. The readers of the service page are the parish's LAITY, who
// sing by following the choir. So the only thing the page must get right is
// the words, in the order they are sung. That audience decision (proposal §1,
// §2.0) is what puts packet fidelity first and leaves tone off the card
// entirely — laity do not read the tone.
//
// WHAT IT DOES NOT DO. It computes nothing itself. It runs the two measurement
// scripts, reads their own baseline JSON, and arranges the result. Every number
// here has exactly one implementation, in the script that owns it:
//
//   M3 located / verbatim, M8 order   scripts/choir-packet-diff.js
//   M1 book-named, M2 conformance     scripts/provenance-sweep.js
//
// NO TOTAL. There is deliberately no single composite score. The measures move
// for unrelated reasons and one summed number hides which (proposal §2.1); the
// repo has already been bitten by a `findings` count that was 92% one rule.
//
// DENOMINATORS ARE ON THE CARD. M3 is measured against the 22 sheets we hold,
// not against the year. A rate can move because a packet arrived, so the sheet
// and hymn counts are printed beside every rate and stored in every history row.
//
// WHAT "PARISH" MEANS HERE, EXACTLY. `?translation=st-john-damascus-tyler`
// resolves to the parish overlay the DB builds at boot — on 2026-10-07 that is
// six FIXED-TEXT variant picks (Cherubic, Trisagion, Psalm 33, Blessed is the
// Man, pre-communion, kontakion-theotokion). The choir packets are stichera and
// troparia, which live in variable-sources/ and which overlays do not reach.
// So M3 measures the SHARED corpus against this parish's sheets, and running it
// with or without the overlay gives the same numbers today — verified
// 2026-10-07, both 71/30 at Great Vespers. Do not read the headline as "the
// parish's own wording is 37% right"; read it as "of what this parish sings,
// we print 87% and match 37%". A nonsense overlay DOES move the number (70/30),
// so the parameter is wired — the overlay simply has nothing to say about
// stichera. See memory `project_overlay_variable_sources_gap`.
//
// FAILS CLOSED. If either sub-script fails — an unreachable server most
// likely — this exits non-zero and writes NO history row. A missing row is
// recoverable; a row of zeroes recorded as progress is not. The repo's
// headline audit returned `0/0/0 exit 0` against a dead port for months.
//
//   node scripts/scorecard.js                  # measure and print
//   node scripts/scorecard.js --record         # also append a history row
//   node scripts/scorecard.js --history        # print the history, no measuring
//   node scripts/scorecard.js --json           # machine-readable, no history row
//
// History: audit/scorecard-history.jsonl (append-only, one row per run)
// Read-only against the corpus. Requires a server (see --http).

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT         = path.resolve(__dirname, '..');
const HISTORY_PATH = path.join(ROOT, 'audit', 'scorecard-history.jsonl');

const DEFAULT_HTTP        = 'http://localhost:3000';
const DEFAULT_TRANSLATION = 'st-john-damascus-tyler';

// Passed explicitly and stored in every row. provenance-sweep.js defaults to a
// hardcoded 2026; inheriting that default would make the year an invisible
// input, and the measure really does move with it — the same corpus reads
// 85.2% over 2026 and 86.1% over 2099. A history row must say what it measured.
const DEFAULT_YEAR = 2026;

function usage() {
  console.log(fs.readFileSync(__filename, 'utf8')
    .split('\n').filter(l => l.startsWith('//')).map(l => l.slice(3)).join('\n'));
}

function parseArgs(argv) {
  const args = { http: DEFAULT_HTTP, translation: DEFAULT_TRANSLATION, year: DEFAULT_YEAR };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--http') args.http = argv[++i];
    else if (a === '--year') args.year = parseInt(argv[++i], 10);
    else if (a === '--translation') args.translation = argv[++i];
    else if (a === '--record') args.record = true;
    else if (a === '--history') args.historyOnly = true;
    else if (a === '--json') args.json = true;
    else if (a === '--note') args.note = argv[++i];
    else if (a === '--help' || a === '-h') { usage(); process.exit(0); }
    else { console.error(`unknown argument: ${a}`); usage(); process.exit(1); }
  }
  return args;
}

// ── Running the measures ──────────────────────────────────────────────────
// Each sub-script already writes its comparable shape with --capture-baseline.
// Reusing that path rather than re-deriving the numbers means the scorecard
// cannot drift from the ratchet that gates them, and it inherits each script's
// own falsification gate (both refuse to report if their comparison cannot
// fail) for free.

function runMeasure(label, script, extraArgs) {
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scorecard-')), 'out.json');
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts', script),
                                    ...extraArgs, '--capture-baseline', tmp],
                 { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const stderr = (err.stderr || '').toString().trim();
    const stdout = (err.stdout || '').toString().trim();
    console.error(`\n[scorecard] FAILED — ${label} (${script}) exited ${err.status}.`);
    if (stderr) console.error(stderr);
    else if (stdout) console.error(stdout.split('\n').slice(-5).join('\n'));
    console.error('\nNo history row was written. Is the server running (node server.js)?');
    process.exit(1);
  }
  if (!fs.existsSync(tmp)) {
    console.error(`[scorecard] FAILED — ${label} exited 0 but wrote no output.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(tmp, 'utf8'));
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'],
                        { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
}

function gitDirty() {
  try {
    const out = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'],
                             { cwd: ROOT, encoding: 'utf8' });
    return out.trim().length > 0;
  } catch { return null; }
}

// ── The card ──────────────────────────────────────────────────────────────

const WORD_GROUPS = [
  ['Great Vespers',  'great-vespers'],
  ['Daily Vespers',  'daily-vespers'],
  ['Vespers (unlabelled)', 'vespers'],
  ['Divine Liturgy', 'liturgy'],
];

function buildRecord(packet, provenance, args) {
  const words = {};
  for (const [, key] of WORD_GROUPS) {
    const a = packet[key];
    if (!a) continue;
    // Rates are over `own` — the pieces this service is responsible for —
    // never over every piece printed in the packet. A weekend packet carries
    // Saturday Vespers alongside the Sunday Liturgy, and charging those to
    // Liturgy reported it at 16% when it is 31%.
    words[key] = {
      sheets: a.sheets, onSheets: a.pieces, otherService: a.crossService,
      mustPrint: a.own, located: a.located, inOrder: a.inOrder, verbatim: a.verbatim,
    };
  }

  const all = packet._all || {};
  const v = provenance.vespers || {};
  const l = provenance.liturgy || {};

  return {
    at: new Date().toISOString(),
    sha: gitSha(),
    dirty: gitDirty(),
    translation: args.translation,
    year: args.year,
    note: args.note || null,
    // M3 + M8, per service, against the director's own sheets.
    words,
    order: { matched: all.located || 0, inOrder: all.inOrder || 0 },
    // §1.3, counted in DATES. Two columns, never one: a saint we sing from a
    // general text is a corpus gap we can close (the proper texts exist — see
    // audit/ocanwa-baseline/); a hymn whose book we cannot name is a
    // *reporting* gap. Conflating them makes the number unusable.
    short: {
      vespersDatesGeneralMenaion: (v.datesGeneralMenaion || []).length,
      vespersDatesUnknownBook: v.datesUnresolved ?? null,
      vespersDatesOffParishBook: v.fail ?? null,
      liturgyDatesNoProvenance: l.datesNoProvenance ?? null,
    },
    // Internal measures, kept out of the headline but tracked so a regression
    // in them is visible. M1 is the book-named rate; `defaulted` is the count
    // of sung hymns displaying a book that was defaulted, not determined.
    internal: {
      vespersSung: v.sung ?? null,
      vespersBookNamed: v.resolved ?? null,
      vespersDefaulted: v.defaulted ?? null,
      vespersConformancePass: v.pass ?? null,
      vespersConformanceFail: v.fail ?? null,
      vespersNoContent: v.noContent ?? null,
    },
  };
}

const pct = (n, d) => (d ? `${Math.round(100 * n / d)}%` : '--');

const sheetTotal = (rec) =>
  Object.values(rec.words).reduce((n, w) => n + (w.sheets || 0), 0);

function printCard(rec, prev) {
  const W = '  ';
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log(`  St John of Damascus — service-text accuracy`);
  console.log(`  ${rec.at.slice(0, 10)} · ${rec.sha || '(no git)'}${rec.dirty ? ' (working tree dirty)' : ''} · ${rec.translation} · year ${rec.year}`);
  console.log('═══════════════════════════════════════════════════════════════════════');

  console.log('');
  console.log('ARE THESE THE WORDS WE WILL SING?');
  console.log(`${W}Of the hymns on the director's sheets, how many do we print —`);
  console.log(`${W}and how many in her choir's exact words?`);
  console.log('');
  console.log(`${W}${'service'.padEnd(22)}${'sheets'.padStart(7)}${'hymns'.padStart(7)}${'we print it'.padStart(14)}${'in their words'.padStart(16)}`);
  for (const [label, key] of WORD_GROUPS) {
    const w = rec.words[key];
    if (!w) continue;
    const loc = `${w.located} (${pct(w.located, w.mustPrint)})`;
    const ver = `${w.verbatim} (${pct(w.verbatim, w.mustPrint)})`;
    console.log(`${W}${label.padEnd(22)}${String(w.sheets).padStart(7)}${String(w.mustPrint).padStart(7)}${loc.padStart(14)}${ver.padStart(16)}`);
  }
  console.log('');
  console.log(`${W}Good looks like: the left column at 100% — we should always print the`);
  console.log(`${W}right hymn. The right column rising deliberately and never silently.`);
  console.log(`${W}Measured against the ${sheetTotal(rec)} sheets we hold, not against the year.`);
  console.log(`${W}The parish overlay is fixed-texts only, so it does not move these numbers.`);

  console.log('');
  console.log('WILL I LOSE MY PLACE?');
  const o = rec.order;
  const wall = o.inOrder === o.matched ? 'the wall holds' : '*** BROKEN ***';
  console.log(`${W}Hymns we print in the order the choir sings them: ` +
              `${o.inOrder} / ${o.matched} (${pct(o.inOrder, o.matched)}) — ${wall}`);
  console.log(`${W}A wall at 100%, not a watermark. Right hymns in the wrong place still`);
  console.log(`${W}loses a reader — that shipped once and a human caught it mid-Liturgy.`);

  console.log('');
  console.log('WHERE DO WE ALREADY KNOW WE ARE SHORT?');
  const s = rec.short;
  const row = (n, unit, text) => console.log(`${W}${String(n).padStart(4)} ${unit.padEnd(7)} ${text}`);
  row(s.vespersDatesGeneralMenaion, 'dates', 'a saint sung from a general text  — WE DON\'T HOLD IT YET');
  row(s.vespersDatesUnknownBook,    'dates', 'a sung hymn whose book we can\'t name — WE DON\'T KNOW');
  row(s.vespersDatesOffParishBook,  'dates', 'a hymn from a book this parish does not use');
  row(s.liturgyDatesNoProvenance,   'dates', 'Liturgy with no book recorded at all (reporting only)');
  console.log(`${W}Two different columns. The first is a corpus gap we can close — those`);
  console.log(`${W}texts exist. The second is a reporting gap. Never sum them.`);

  if (prev) {
    console.log('');
    console.log(`WHAT CHANGED since ${prev.at.slice(0, 10)} (${prev.sha || '?'})`);
    const lines = diffLines(prev, rec);
    if (!lines.length) console.log(`${W}Nothing moved.`);
    else lines.forEach(l => console.log(`${W}${l}`));
  }
  console.log('');
}

/** Every difference worth a line, with its direction named. */
function diffLines(prev, rec) {
  const out = [];
  const arrow = (good) => good ? '  better ' : '  WORSE  ';

  for (const [label, key] of WORD_GROUPS) {
    const a = prev.words?.[key], b = rec.words[key];
    if (!b) continue;
    if (!a) { out.push(`  new   ${label}: now measured (${b.sheets} sheets)`); continue; }
    // Sheet-count changes move the denominator, so say so before any rate.
    if (a.sheets !== b.sheets)
      out.push(`  note  ${label}: ${a.sheets} -> ${b.sheets} sheets ` +
               `(${a.mustPrint} -> ${b.mustPrint} hymns) — rates below are over a different set`);
    // `inOrder` is scored over what we LOCATED, matching the headline wall —
    // "of the hymns we print, how many are in the choir's order". Scoring it
    // over `mustPrint` instead reports 87% for a service whose order is
    // perfect, because the hymns we never printed cannot be out of order.
    for (const [field, name, denom] of [
      ['located',  'we print it',    'mustPrint'],
      ['verbatim', 'in their words', 'mustPrint'],
      ['inOrder',  'in order',       'located'],
    ]) {
      const da = a[denom], db = b[denom];
      const ra = da ? a[field] / da : 0;
      const rb = db ? b[field] / db : 0;
      if (Math.abs(ra - rb) < 0.005) continue;
      out.push(`${arrow(rb > ra)}${label} ${name}: ${pct(a[field], da)} -> ${pct(b[field], db)}`);
    }
  }

  for (const [field, name] of [
    ['vespersDatesGeneralMenaion', 'dates on a general text'],
    ['vespersDatesUnknownBook',    'dates with an unnamed book'],
    ['vespersDatesOffParishBook',  'dates with an off-parish book'],
    ['liturgyDatesNoProvenance',   'Liturgy dates with no provenance'],
  ]) {
    const a = prev.short?.[field], b = rec.short[field];
    if (typeof a !== 'number' || typeof b !== 'number' || a === b) continue;
    out.push(`${arrow(b < a)}${name}: ${a} -> ${b}`);
  }

  const a = prev.internal || {}, b = rec.internal;
  if (typeof a.vespersBookNamed === 'number' && a.vespersBookNamed !== b.vespersBookNamed)
    out.push(`${arrow(b.vespersBookNamed > a.vespersBookNamed)}Vespers hymns with a named book: ` +
             `${a.vespersBookNamed}/${a.vespersSung} -> ${b.vespersBookNamed}/${b.vespersSung}`);

  return out;
}

function readHistory() {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  return fs.readFileSync(HISTORY_PATH, 'utf8').split('\n')
    .filter(l => l.trim())
    .map((l, i) => {
      try { return JSON.parse(l); }
      catch { console.error(`[scorecard] skipping malformed history line ${i + 1}`); return null; }
    })
    .filter(Boolean);
}

function printHistory(history) {
  if (!history.length) { console.log('No history yet. Run with --record.'); return; }
  console.log('');
  console.log(`${'date'.padEnd(12)}${'sha'.padEnd(10)}` +
              `${'GV loc'.padStart(8)}${'GV verb'.padStart(9)}` +
              `${'Lit loc'.padStart(9)}${'Lit verb'.padStart(10)}` +
              `${'order'.padStart(8)}${'GM'.padStart(5)}${'unk'.padStart(6)}`);
  console.log('─'.repeat(77));
  for (const r of history) {
    const gv = r.words?.['great-vespers'] || {}, li = r.words?.liturgy || {};
    const o  = r.order || {};
    console.log(
      `${r.at.slice(0, 10).padEnd(12)}${String(r.sha || '?').padEnd(10)}` +
      `${pct(gv.located, gv.mustPrint).padStart(8)}${pct(gv.verbatim, gv.mustPrint).padStart(9)}` +
      `${pct(li.located, li.mustPrint).padStart(9)}${pct(li.verbatim, li.mustPrint).padStart(10)}` +
      `${pct(o.inOrder, o.matched).padStart(8)}` +
      `${String(r.short?.vespersDatesGeneralMenaion ?? '?').padStart(5)}` +
      `${String(r.short?.vespersDatesUnknownBook ?? '?').padStart(6)}` +
      (r.note ? `   ${r.note}` : ''));
  }
  console.log('');
  console.log('GV/Lit loc = we print the hymn · verb = in the parish\'s words');
  console.log('GM = Vespers dates on a general text · unk = Vespers dates with an unnamed book');
  console.log('Rates are over the sheets held AT THAT TIME — check the sheet count before');
  console.log('reading a jump as progress. Full denominators are in the JSONL.');
  console.log('');
}

(async () => {
  const args = parseArgs(process.argv);
  const history = readHistory();

  if (args.historyOnly) { printHistory(history); return; }

  const packet = runMeasure('packet fidelity (M3/M8)', 'choir-packet-diff.js',
                            ['--http', args.http, '--translation', args.translation]);
  const provenance = runMeasure('provenance (M1/M2)', 'provenance-sweep.js',
                                ['--http', args.http, '--translation', args.translation,
                                 '--year', String(args.year), '--services', 'vespers,liturgy']);

  const rec = buildRecord(packet, provenance, args);

  if (args.json) { console.log(JSON.stringify(rec, null, 2)); return; }

  printCard(rec, history[history.length - 1]);

  if (args.record) {
    fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
    fs.appendFileSync(HISTORY_PATH, JSON.stringify(rec) + '\n');
    console.log(`Recorded in ${path.relative(ROOT, HISTORY_PATH)} (${history.length + 1} rows).`);
    if (rec.dirty)
      console.log('NOTE: working tree was dirty, so this row is not reproducible from its sha.');
    console.log('');
  } else {
    console.log('Not recorded. Re-run with --record to append a history row.');
    console.log('');
  }
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
