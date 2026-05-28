#!/usr/bin/env node
'use strict';

/**
 * Endpoint audit — hits a service endpoint across many dates and reports
 * runtime content issues (empty hymn/prayer text, placeholder text,
 * duplicate block ids, blocks missing id/section).
 *
 * Complements `audit/index.js`, which runs structural rules against the
 * assembler's internal state. This one runs against the HTTP API the way
 * a real client would.
 *
 * Pattern that introduced this script: in one session, four content bugs
 * surfaced via this audit that smoke tests had missed —
 *  - empty `ml-bow-prayer` in every Matins (assembler read wrong field)
 *  - duplicate `cat-p2` id in every non-Bright-Week Liturgy
 *  - duplicate `litya-hymn-0` on every great-feast eve Vespers
 *  - HTTP 500 on Beheading-eve Vespers (vigil-rank Saturday crash)
 *
 * Usage:
 *   node audit/endpoint-audit.js --endpoint /api/service --year 2026
 *   node audit/endpoint-audit.js --endpoint /api/liturgy --from 2026-03-01 --to 2026-04-30
 *   node audit/endpoint-audit.js --endpoint /api/presanctified --presanctified
 *   node audit/endpoint-audit.js --all                # default endpoints, current year
 *
 * Requires a running server (defaults to http://localhost:3000).
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function fetchJson(base, endpoint, date) {
  return new Promise(resolve => {
    const url = new URL(`${base}${endpoint}?date=${date}`);
    const mod = url.protocol === 'https:' ? https : http;
    mod.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', e => resolve({ status: 0, body: '', err: e.message }));
  });
}

function listDates(from, to) {
  const out = [];
  const d   = new Date(from + 'T12:00:00Z');
  const end = new Date(to   + 'T12:00:00Z');
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function presanctifiedDates(year) {
  return predicateDates(year, require('../calendar-rules.js').isPresanctifiedDay);
}

function predicateDates(year, predicate) {
  const out = [];
  const d   = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    if (predicate(d)) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function brightWeekDates(year) {
  const { calculatePascha, getLiturgicalSeason } = require('../calendar-rules.js');
  return predicateDates(year, d => getLiturgicalSeason(d) === 'brightWeek');
}

function paschaDates(year) {
  const { calculatePascha } = require('../calendar-rules.js');
  const p = calculatePascha(year);
  return [p.toISOString().slice(0, 10)];
}

// Maps endpoints to a date selector. Default selector is the contiguous range.
function dateSelectorFor(endpoint, year, from, to) {
  const cal = require('../calendar-rules.js');
  switch (endpoint) {
    case '/api/presanctified':    return presanctifiedDates(year);
    case '/api/bridegroom-matins':return predicateDates(year, cal.isBridegroomMatins);
    case '/api/passion-gospels':  return predicateDates(year, cal.isPassionGospelsDay);
    case '/api/lamentations':     return predicateDates(year, cal.isLamentationsDay);
    case '/api/royal-hours':      return predicateDates(year, cal.isRoyalHoursDay);
    case '/api/vesperal-liturgy': return predicateDates(year, cal.isVesperalLiturgyDay);
    case '/api/paschal-hours':    return brightWeekDates(year);
    case '/api/pascha-collection':return paschaDates(year);
    default:                      return listDates(from, to);
  }
}

function audit(j) {
  const issues = [];
  if (j.error) return ['ERR: ' + j.error];
  if (!j.blocks) return ['no blocks'];

  // Empty hymn/prayer/verse/doxology/response text
  const empties = j.blocks.filter(b =>
    ['hymn', 'prayer', 'verse', 'doxology', 'response'].includes(b.type) &&
    (b.text === '' || b.text == null));
  if (empties.length) {
    issues.push(empties.length + ' empty-text (' + empties.slice(0, 3).map(b => b.id).join(',') + ')');
  }

  // Placeholder text (legacy `count: N` beatitudes, "data not loaded", etc.)
  const placeholders = j.blocks.filter(b =>
    b.text && /\[.*(TBD|TODO|to be|placeholder|data not loaded)/i.test(b.text));
  if (placeholders.length) {
    issues.push(placeholders.length + ' placeholders (' + placeholders.slice(0, 3).map(b => b.id).join(',') + ')');
  }

  // Duplicate ids
  const ids = j.blocks.map(b => b.id).filter(Boolean);
  const dups = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dups.length) {
    issues.push(dups.length + ' dup ids (' + dups.slice(0, 3).join(',') + ')');
  }

  // Blocks without id / section
  const noId    = j.blocks.filter(b => b.id == null);
  const noSect  = j.blocks.filter(b => !b.section);
  if (noId.length)   issues.push(noId.length + ' no-id');
  if (noSect.length) issues.push(noSect.length + ' no-section');

  return issues;
}

async function runOne(base, endpoint, dates) {
  let okCount = 0, errCount = 0, issueCount = 0, skippedCount = 0;
  const buckets = new Map();

  for (const d of dates) {
    const r = await fetchJson(base, endpoint, d);
    if (r.status === 404) { skippedCount++; continue; }
    if (r.status !== 200) { console.log(d + ': HTTP ' + r.status); errCount++; continue; }
    let j;
    try { j = JSON.parse(r.body); }
    catch { console.log(d + ': parse error'); errCount++; continue; }

    const issues = audit(j);
    if (issues.length === 0) { okCount++; continue; }
    issueCount++;
    for (const i of issues) {
      const sig = i.split(' (')[0];
      if (!buckets.has(sig)) buckets.set(sig, []);
      buckets.get(sig).push(d);
    }
    console.log(d + ': ' + issues.join(' | '));
  }

  console.log('\n--- ' + endpoint + ' ---');
  console.log('  Range:   ' + dates[0] + ' .. ' + dates[dates.length - 1] + ' (' + dates.length + ' dates)');
  console.log('  OK:      ' + okCount);
  console.log('  Skipped: ' + skippedCount + ' (404)');
  console.log('  Issues:  ' + issueCount);
  console.log('  Errors:  ' + errCount);
  for (const [sig, ds] of [...buckets].sort((a, b) => b[1].length - a[1].length)) {
    console.log('    ' + ds.length + ' dates: ' + sig);
  }
  return { ok: okCount, skipped: skippedCount, issues: issueCount, errors: errCount };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  const base = args.base || 'http://localhost:3000';
  const year = parseInt(args.year || new Date().getUTCFullYear(), 10);

  const from = args.from || `${year}-01-01`;
  const to   = args.to   || `${year}-12-31`;

  // Default sweep when --all or no endpoint given
  let runs;
  if (args.endpoint && !args.all) {
    const ep = args.endpoint;
    runs = [[ep, dateSelectorFor(ep, year, from, to)]];
  } else {
    const allEndpoints = [
      '/api/service',
      '/api/liturgy',
      '/api/presanctified',
      '/api/matins',
      '/api/bridegroom-matins',
      '/api/passion-gospels',
      '/api/royal-hours',
      '/api/lamentations',
      '/api/vesperal-liturgy',
      '/api/paschal-hours',
      '/api/pascha-collection',
    ];
    runs = allEndpoints.map(ep => [ep, dateSelectorFor(ep, year, from, to)]);
  }

  let totalIssues = 0, totalErrors = 0;
  for (const [ep, dates] of runs) {
    const r = await runOne(base, ep, dates);
    totalIssues += r.issues;
    totalErrors += r.errors;
  }

  console.log('\n=== TOTAL ===');
  console.log('  Issues: ' + totalIssues);
  console.log('  Errors: ' + totalErrors);
  process.exit(totalErrors > 0 ? 1 : 0);
})();
