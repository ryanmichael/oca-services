#!/usr/bin/env node
/**
 * probe-sergius-rank.js
 *
 * Probes the St-Sergius Menaion PDF for a given calendar date and reports
 * the rank shape of the service: # LIC stichera, presence of Lauds (Praises),
 * Polyeleos magnification, Great Doxology, # of canons, exapostilarion.
 *
 * Suggests a feastRank classification:
 *   polyeleos       — has Polyeleos magnification + Lauds + Great Doxology
 *   vigil           — polyeleos but with 8+ LIC stichera (probe cannot fully distinguish)
 *   doxology-rank   — Lauds + Great Doxology, no Polyeleos magnification
 *   simple-rank     — 6 LIC stichera, no Lauds (Small Doxology / Octoechos aposticha)
 *   weekday-stub    — 3 LIC stichera, no Lauds, no Polyeleos
 *
 * Usage:
 *   node probe-sergius-rank.js 11-14
 *   node probe-sergius-rank.js 11-14 10-23 01-19
 *   node probe-sergius-rank.js --month 11
 *   node probe-sergius-rank.js --month 11 --json
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_URL = 'https://st-sergius.org/services/Emenaion';

const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const monthIdx = args.indexOf('--month');
const MONTH = monthIdx >= 0 ? args[monthIdx + 1].padStart(2, '0') : null;
const dates = args.filter(a => /^\d{2}-\d{2}$/.test(a));

function daysInMonth(mm) {
  // probe-safe: 31 for everything except known shorter months; missing PDFs just 404.
  return ({ '02': 29, '04': 30, '06': 30, '09': 30, '11': 30 })[mm] || 31;
}

function expandTargets() {
  if (MONTH) {
    const n = daysInMonth(MONTH);
    return Array.from({ length: n }, (_, i) => `${MONTH}-${String(i + 1).padStart(2, '0')}`);
  }
  return dates;
}

function fetchPdfText(mmdd) {
  const tmp = path.join(os.tmpdir(), `probe-sergius-${mmdd}.pdf`);
  try {
    execSync(`curl -s -f -o "${tmp}" "${BASE_URL}/${mmdd}.pdf"`, { stdio: 'pipe' });
  } catch (e) {
    return null;
  }
  return execSync(`pdftotext "${tmp}" -`, { maxBuffer: 8 * 1024 * 1024 }).toString('utf8');
}

function analyze(text) {
  const result = {
    licStichera: null,
    hasLauds: false,
    laudsCount: null,
    hasPolyeleosMagnification: false,
    hasAfterPolyeleosSessional: false,
    hasGreatDoxology: false,
    hasExapostilarion: false,
    canonCount: 0,
    hasMatinsGospel: false,
    saintsMentioned: [],
    // Complexity signals — distinguish "clean single-saint simple-rank" from
    // joint commemorations and feast-afterfeast combinations. These are what
    // make a simple-rank classification actually shippable (or not).
    isAfterfeast: false,
    isForefeast: false,
    isLeavetaking: false,
    commemorationCount: 0,
    vespersSectionCount: 0,
    canonAuthorCount: 0,
  };

  // LIC stichera count — collect all "On Lord I have cried, N Stichera" lines, keep the max
  // (multi-configuration days like Seraphim w/ Theophany forefeast list a base + a combined count)
  const licMatches = [...text.matchAll(/On\s+["“]\s*Lord,?\s+I\s+have\s+cried[^"”]*["”][^\n]*?(\d+)\s+Stichera/gi)];
  if (licMatches.length) {
    result.licStichera = Math.max(...licMatches.map(m => parseInt(m[1], 10)));
    if (licMatches.length > 1) result.licMultipleConfigs = true;
  }

  // Praises (Lauds)
  const praises = text.match(/On\s+the\s+Praises,?\s*(\d+)\s+Stichera/i);
  if (praises) {
    result.hasLauds = true;
    result.laudsCount = parseInt(praises[1], 10);
  }

  // Polyeleos magnification — covers both phrasings:
  //   "After the Polyeleos, this magnification"  (e.g. 11-14 Philip)
  //   "Polyeleos, and this magnification"        (e.g. 10-09 James, 01-02 Seraphim)
  if (/Polyeleos,?\s+(?:and\s+)?this\s+[Mm]agnification/i.test(text)) {
    result.hasPolyeleosMagnification = true;
  }
  if (/After\s+the\s+Polyeleos,\s+the\s+Sessional/i.test(text)) {
    result.hasAfterPolyeleosSessional = true;
  }
  if (/Great\s+Doxology/i.test(text)) result.hasGreatDoxology = true;
  if (/Exapostilarion/i.test(text)) result.hasExapostilarion = true;

  // Canons: count "Canon to/of the ..." headers in Matins section
  const matinsIdx = text.search(/AT\s+MATINS/i);
  const matinsText = matinsIdx >= 0 ? text.slice(matinsIdx) : text;
  const canonMatches = matinsText.match(/Canon\s+(?:to|of)\s+the\s+[a-z]/gi);
  result.canonCount = canonMatches ? canonMatches.length : 0;

  // Matins gospel reading
  if (/Gospel\s+(?:reading|according)/i.test(matinsText)) result.hasMatinsGospel = true;

  // Greek-usage doxology note (e.g. Spyridon 12-12)
  if (/Greek\s+usage[\s\S]{0,200}?Doxology\s+rank/i.test(text)) result.hasGreekDoxologyNote = true;

  // ── Complexity signals ────────────────────────────────────────────────────
  // Take the header block (text before the first AT VESPERS line) to count
  // COMMEMORATION OF headers and feast-context markers.
  const firstVespers = text.search(/AT\s+VESPERS\s*:?\s*$/im);
  const header = firstVespers > 0 ? text.slice(0, firstVespers) : text.slice(0, 2000);
  if (/AFTERFEAST\s+OF/i.test(header)) result.isAfterfeast = true;
  if (/FOREFEAST\s+OF/i.test(header)) result.isForefeast = true;
  if (/(APODOSIS|LEAVE-?TAKING)\s+OF/i.test(header)) result.isLeavetaking = true;
  const commMatches = [...header.matchAll(/COMMEMORATION\s+OF\b/gi)];
  result.commemorationCount = commMatches.length;
  const vespersMatches = [...text.matchAll(/^AT\s+VESPERS\s*:?\s*$/gim)];
  result.vespersSectionCount = vespersMatches.length;
  // Distinct canon authorship lines indicate multiple canons (multi-saint
  // services often have one canon per saint).
  const authorMatches = [...text.matchAll(/the\s+composition\s+of\s+[A-Z]/g)];
  result.canonAuthorCount = authorMatches.length;

  return result;
}

function classify(r) {
  if (r.licStichera == null) return 'unknown';
  if (r.hasPolyeleosMagnification) {
    return r.licStichera >= 8 ? 'vigil-or-polyeleos' : 'polyeleos';
  }
  if (r.hasGreekDoxologyNote && r.hasLauds) return 'doxology-rank-greek';
  // Lauds present + no Polyeleos magnification ⇒ doxology-rank.
  // The "Great Doxology" string isn't always printed in Sergius (esp. when Liturgy
  // texts follow), so we don't require it — Lauds alone is the structural signal.
  if (r.hasLauds) return 'doxology-rank';
  if (r.licStichera >= 6 && !r.hasLauds) {
    // Refine simple-rank by complexity signals. A "clean" simple-rank service
    // is a single saint with no feast context — directly authorable. Anything
    // else needs joint-commemoration or afterfeast infrastructure first.
    if (r.isAfterfeast || r.isForefeast || r.isLeavetaking) return 'simple-rank-afterfeast';
    // Multiple distinct canon authors ⇒ separate per-saint canons, needs
    // joint-commemoration infrastructure (even when COMMEMORATION OF combines
    // names into one header).
    if (r.canonAuthorCount >= 2) return 'simple-rank-multisaint';
    if (r.commemorationCount >= 2) return 'simple-rank-combined';
    return 'simple-rank';
  }
  if (r.licStichera <= 3) return 'weekday-stub';
  return 'unclassified';
}

function fmtRow(mmdd, r, rank) {
  if (r === null) return `${mmdd}  (no PDF)`;
  const flags = [
    `LIC=${r.licStichera ?? '?'}`,
    r.hasLauds ? `Lauds=${r.laudsCount}` : '',
    r.hasPolyeleosMagnification ? 'Magnif' : '',
    r.hasGreatDoxology ? 'GtDox' : '',
    r.hasGreekDoxologyNote ? 'GreekDoxNote' : '',
    r.hasMatinsGospel ? 'Gospel' : '',
    r.isAfterfeast ? 'Aft' : '',
    r.isForefeast ? 'Fore' : '',
    r.isLeavetaking ? 'Leave' : '',
    r.commemorationCount > 1 ? `comm=${r.commemorationCount}` : '',
    r.canonAuthorCount > 1 ? `auth=${r.canonAuthorCount}` : '',
  ].filter(Boolean).join(' ');
  return `${mmdd}  ${rank.padEnd(26)}  ${flags}`;
}

(function main() {
  const targets = expandTargets();
  if (targets.length === 0) {
    console.error('Usage: node probe-sergius-rank.js MM-DD [MM-DD ...]  |  --month MM  [--json]');
    process.exit(2);
  }
  const out = [];
  for (const mmdd of targets) {
    const text = fetchPdfText(mmdd);
    if (!text) {
      out.push({ date: mmdd, rank: 'missing', signals: null });
      if (!JSON_OUT) console.log(fmtRow(mmdd, null));
      continue;
    }
    const signals = analyze(text);
    const rank = classify(signals);
    out.push({ date: mmdd, rank, signals });
    if (!JSON_OUT) console.log(fmtRow(mmdd, signals, rank));
  }
  if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
})();
