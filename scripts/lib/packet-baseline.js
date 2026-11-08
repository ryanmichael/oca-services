'use strict';

/**
 * Packet-baseline comparison — the per-SHEET half of M3 (packet fidelity).
 *
 * WHY THIS EXISTS. On 2026-11-07 a parishioner heard the six Menaion stichera
 * to Michael and Gabriel sung in a register the parish does not use. The tool
 * that measures exactly this had already scored the sheet:
 *
 *     great-vespers-2026-11-07 — pieces 15 · located 10 · verbatim 2
 *
 * and said nothing, because the baseline stored only per-SERVICE aggregates
 * (great-vespers: own 133, located 113, verbatim 50 = 38%). Two failures
 * compounded:
 *
 *   1. A NEW sheet could only ever land in `better` ("new in this run"). A
 *      packet arriving at 13% verbatim was announced as an improvement, and
 *      the next `--capture-baseline` folded it into the accepted 38%.
 *   2. One sheet collapsing and another improving NET OUT in an aggregate, so
 *      a per-service rate can hold still over a real regression.
 *
 * The rule added here is deliberately NOT a hand-picked floor. A floor is a
 * label — a number someone chose — and this project has been burned by rules
 * that assert a label instead of a position. The position asserted is:
 *
 *   A NEW sheet may not be matched WORSE THAN THE RATE WE HAVE ALREADY
 *   ACCEPTED for its service.
 *
 * That threshold is read from the baseline itself, so it moves as the corpus
 * moves and cannot drift away from what the corpus actually is. A service with
 * no baseline has nothing to be worse than, so its first sheet is reported but
 * cannot fail — a tool that fails on its own first observation is measuring
 * nothing.
 *
 * Pure: no fs, no network, no server. Required by scripts/choir-packet-diff.js
 * and by test/contracts/packet-baseline-per-sheet.test.js.
 */

// A rate must move by more than this to count. Matches the tolerance the
// service-level comparison has always used.
const EPS = 0.001;

// Reserved top-level keys in a baseline file that are not service aggregates.
const SHEETS_KEY = '_sheets';
const ALL_KEY    = '_all';

// The axes a drop in which is a regression. `located` and `verbatim` are the
// two the report is built around; `inOrder` rides along because a reordering
// is audible even when every hymn is present and verbatim.
const AXES = ['located', 'inOrder', 'verbatim'];
const AXIS_LABEL = { located: 'located', inOrder: 'in order', verbatim: 'verbatim' };

// A sheet is judged on the pieces the service is RESPONSIBLE for (`own`),
// never on every piece printed in the packet — a Liturgy sheet that carries
// Vespers hymns must not be marked down for them.
const denom = (x) => (x && (x.own || x.pieces)) || 0;
const rateOf = (x, axis) => (denom(x) ? (x[axis] || 0) / denom(x) : 0);
const pct = (r) => `${(100 * r).toFixed(0)}%`;

/** The slim per-sheet record a baseline stores. Drops misses/positions/texts. */
function sheetRecord(r) {
  return {
    service: r.service,
    pieces: r.pieces,
    own: r.own ?? r.pieces,
    crossService: r.crossService || 0,
    located: Math.max(0, r.located),
    inOrder: r.inOrder || 0,
    verbatim: r.verbatim || 0,
  };
}

/**
 * Build the file written by --capture-baseline: the per-service aggregates
 * exactly as before, plus a `_sheets` map. Older baselines without `_sheets`
 * stay readable — every sheet simply reads as new.
 */
function buildBaseline(summary, rows) {
  const sheets = {};
  for (const r of rows) sheets[r.name] = sheetRecord(r);
  return { ...summary, [SHEETS_KEY]: sheets };
}

/**
 * Compare a run against a baseline.
 *
 * @param {Object} summary  per-service aggregates for this run, keyed by service
 * @param {Array}  rows     per-sheet rows for this run
 * @param {Object} base     a parsed baseline file
 * @returns {{worse: string[], better: string[], notes: string[]}}
 *          `worse` is non-empty exactly when the caller should fail.
 */
function compare(summary, rows, base) {
  const worse = [], better = [], notes = [];

  // ── 1. Per-service aggregates — unchanged behaviour ────────────────────
  for (const [key, a] of Object.entries(summary)) {
    if (key === SHEETS_KEY) continue;
    const b = base[key];
    if (!b) { better.push(`${key}: new in this run (${a.located}/${a.pieces} located)`); continue; }
    for (const axis of AXES) {
      const ra = rateOf(a, axis), rb = rateOf(b, axis);
      if (ra < rb - EPS) worse.push(`${key}: ${AXIS_LABEL[axis]} ${pct(rb)} -> ${pct(ra)}`);
      else if (ra > rb + EPS && axis !== 'inOrder')
        better.push(`${key}: ${AXIS_LABEL[axis]} ${pct(rb)} -> ${pct(ra)}`);
    }
  }

  // ── 2. Per sheet ───────────────────────────────────────────────────────
  const baseSheets = base[SHEETS_KEY] || {};
  const hadSheets = Object.keys(baseSheets).length > 0;
  if (!hadSheets && rows.length) {
    notes.push('baseline predates per-sheet tracking; recapture it to arm the per-sheet rule');
  }

  for (const r of rows) {
    const a = sheetRecord(r);
    const b = baseSheets[r.name];

    if (b) {
      // A sheet we have seen before is judged against ITSELF. An aggregate can
      // net one sheet's collapse against another's gain; this cannot.
      for (const axis of AXES) {
        const ra = rateOf(a, axis), rb = rateOf(b, axis);
        if (ra < rb - EPS)
          worse.push(`${r.name}: ${AXIS_LABEL[axis]} ${pct(rb)} -> ${pct(ra)} (${b[axis] || 0}/${denom(b)} -> ${a[axis] || 0}/${denom(a)})`);
        else if (ra > rb + EPS)
          better.push(`${r.name}: ${AXIS_LABEL[axis]} ${pct(rb)} -> ${pct(ra)}`);
      }
      continue;
    }

    // A NEW sheet. Judge it against the rate already accepted for its service.
    if (!hadSheets) continue;              // pre-per-sheet baseline: nothing to say
    const svc = base[r.service];
    if (!svc || !denom(svc)) {
      notes.push(`${r.name}: new sheet, and no ${r.service} baseline to judge it against`);
      continue;
    }
    let flagged = false;
    for (const axis of ['located', 'verbatim']) {
      const ra = rateOf(a, axis), rs = rateOf(svc, axis);
      if (ra < rs - EPS) {
        worse.push(`${r.name}: NEW sheet, ${AXIS_LABEL[axis]} ${pct(ra)} (${a[axis] || 0}/${denom(a)}) is below the accepted ${r.service} rate ${pct(rs)} — triage before the service`);
        flagged = true;
      }
    }
    if (!flagged) notes.push(`${r.name}: new sheet, at or above the accepted ${r.service} rates`);
  }

  return { worse, better, notes };
}

module.exports = { buildBaseline, compare, sheetRecord, SHEETS_KEY, ALL_KEY, AXES, EPS };
