#!/usr/bin/env node
/**
 * generate-gap-report.js
 *
 * Queries the stichera DB and outputs a gap report showing which fixed-calendar
 * dates (month/day) have published OCA Menaion service texts vs. which are gaps.
 *
 * Coverage is keyed by (month, day) — the same feast exists every year, so a
 * date scraped from any year counts as covered for that calendar position.
 *
 * Gap = no stichera in DB for that (month, day) pair. Either OCA didn't publish
 * a service text for that day, or parsing yielded nothing.
 *
 * Run after a full scrape:
 *   node generate-gap-report.js
 *
 * Outputs: gap-report.json
 */

'use strict';

const path = require('path');
const fs   = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH     = path.join(__dirname, 'storage', 'oca.db');
const OUTPUT_PATH = path.join(__dirname, 'gap-report.json');

const MONTH_NAMES = ['','January','February','March','April','May','June',
                     'July','August','September','October','November','December'];
const DAYS_PER_MONTH = [0,31,28,31,30,31,30,31,31,30,31,30,31]; // non-leap

// ─── Main ─────────────────────────────────────────────────────────────────────

const db = new DatabaseSync(DB_PATH);

// For each (month, day) pair with stichera, record which sections are present.
// Join through commemorations so we get the calendar position, not the source_date.
const coveredRows = db.prepare(`
  SELECT DISTINCT c.month, c.day, s.section
  FROM stichera s
  JOIN commemorations c ON c.id = s.commemoration_id
  WHERE s.text IS NOT NULL
`).all();

const coverage = {};   // key: "MM-DD"
for (const { month, day, section } of coveredRows) {
  const key = `${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if (!coverage[key]) coverage[key] = { hasLIC: false, hasApost: false };
  if (section === 'lordICall') coverage[key].hasLIC = true;
  if (section === 'aposticha') coverage[key].hasApost = true;
}

// Get saint names for covered dates (first/primary commemoration per date)
const saintRows = db.prepare(`
  SELECT c.month, c.day, c.title,
         (SELECT COUNT(*) FROM troparia t WHERE t.commemoration_id = c.id) AS tcount
  FROM commemorations c
  WHERE EXISTS (SELECT 1 FROM stichera s WHERE s.commemoration_id = c.id)
  ORDER BY c.month, c.day, tcount DESC
`).all();
const saintMap = {};
for (const r of saintRows) {
  const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
  if (!saintMap[key]) saintMap[key] = r.title;  // first = most troparia
}

const report = {
  _meta: {
    description: 'Menaion stichera coverage — which fixed-calendar dates have published OCA service texts',
    generated: new Date().toISOString(),
    note: 'Keyed by calendar (month/day), not year. Gap = OCA returned 404 or parsing yielded nothing. ' +
          'Covered = at least one sticheron in DB from files.oca.org.',
  },
  summary: {
    totalCalendarDays: 365,
    covered: 0,
    gaps: 0,
    licAndApost: 0,
    licOnly: 0,
    apostOnly: 0,
    coveragePct: '',
  },
  byMonth: {},
  covered: [],
  gapDates: [],
};

for (let m = 1; m <= 12; m++) {
  const days = DAYS_PER_MONTH[m];
  const monthCovered = [];
  const monthGaps = [];

  for (let d = 1; d <= days; d++) {
    const key = `${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const cov = coverage[key];
    const mmdd = `${MONTH_NAMES[m]} ${d}`;

    if (cov) {
      report.summary.covered++;
      if (cov.hasLIC && cov.hasApost) report.summary.licAndApost++;
      else if (cov.hasLIC)            report.summary.licOnly++;
      else if (cov.hasApost)          report.summary.apostOnly++;

      const entry = {
        mmdd: key,
        label: mmdd,
        saint: saintMap[key] ?? null,
        hasLIC:   cov.hasLIC,
        hasApost: cov.hasApost,
      };
      monthCovered.push(entry);
      report.covered.push(entry);
    } else {
      report.summary.gaps++;
      monthGaps.push(key);
      report.gapDates.push(key);
    }
  }

  report.byMonth[MONTH_NAMES[m]] = {
    covered: monthCovered.length,
    gaps: monthGaps.length,
    gapDates: monthGaps,
  };
}

report.summary.coveragePct =
  ((report.summary.covered / report.summary.totalCalendarDays) * 100).toFixed(1) + '%';

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(report, null, 2));

console.log(`Gap report written to gap-report.json`);
console.log(`  Covered: ${report.summary.covered} / 365 calendar days (${report.summary.coveragePct})`);
console.log(`  LIC + Aposticha: ${report.summary.licAndApost}`);
console.log(`  LIC only:        ${report.summary.licOnly}`);
console.log(`  Aposticha only:  ${report.summary.apostOnly}`);
console.log(`  Gaps:            ${report.summary.gaps}`);
console.log();

for (const [mn, data] of Object.entries(report.byMonth)) {
  if (data.covered > 0) {
    console.log(`  ${mn.padEnd(12)}: ${data.covered} covered, ${data.gaps} gaps`);
  }
}
