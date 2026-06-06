#!/usr/bin/env node
'use strict';

// Coverage report: hits matins / vespers / liturgy for every 2026 date,
// classifies the response, cross-references against menaion files +
// feast-canons + calendar-rules feastRank, and emits a markdown heat-map
// to audit/reports/coverage-2026.md.
//
// Companion to audit/endpoint-audit.js — that one finds content bugs
// per-date; this one finds *missing* content (stubs / 404 / dates with
// no menaion file) and ranks the gaps by leverage.
//
// Usage:
//   node server.js &                                  # in another tab
//   node audit/coverage-report.js --year 2026
//   node audit/coverage-report.js --year 2026 --from 2026-01-01 --to 2026-03-31

const fs   = require('fs');
const path = require('path');
const http = require('http');

const cal = require('../calendar-rules.js');

const YEAR = Number(process.argv.find(a => a.startsWith('--year='))?.slice(7) || 2026);
const FROM = process.argv.find(a => a.startsWith('--from='))?.slice(7) || `${YEAR}-01-01`;
const TO   = process.argv.find(a => a.startsWith('--to='))?.slice(5)   || `${YEAR}-12-31`;
const BASE = process.env.OCA_BASE || 'http://localhost:3000';

const MONTH_NAMES = ['january','february','march','april','may','june',
                     'july','august','september','october','november','december'];

const MENAION_DIR     = path.join(__dirname, '..', 'variable-sources', 'menaion');
const FEAST_CANON_DIR = path.join(__dirname, '..', 'variable-sources', 'feast-canons');

const menaionFiles    = new Set(fs.readdirSync(MENAION_DIR).filter(f => f.endsWith('.json')));
const feastCanonFiles = new Set(fs.readdirSync(FEAST_CANON_DIR).filter(f => f.endsWith('.json')));

// Stub thresholds. Calibrated against sampled healthy days 2026-06-06:
// matins weekday stub ~170, festal 280-450; vespers daily ~140-170; liturgy ~360-430.
const MATINS_STUB_MAX  = 150;   // anything ≤150 blocks is a stub
const VESPERS_STUB_MAX = 100;
const LITURGY_STUB_MAX = 150;

function fetchJson(url) {
  return new Promise(resolve => {
    http.get(url, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on('error', e => resolve({ status: 0, body: null, err: e.message }));
  });
}

function* eachDate(from, to) {
  const d   = new Date(from + 'T12:00:00Z');
  const end = new Date(to   + 'T12:00:00Z');
  while (d <= end) {
    yield d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

function menaionFileFor(iso) {
  const [, m, d] = iso.split('-');
  return `${MONTH_NAMES[Number(m) - 1]}-${d}.json`;
}

function classify(status, body, stubMax) {
  if (status === 404)            return { tag: 'no-service', blocks: 0 };
  if (status !== 200 || !body)   return { tag: 'error',      blocks: 0 };
  const blocks = Array.isArray(body.blocks) ? body.blocks.length : 0;
  if (blocks === 0)              return { tag: 'empty',      blocks };
  if (blocks <= stubMax)         return { tag: 'stub',       blocks };
  return { tag: 'ok', blocks };
}

async function probe(iso) {
  const dateObj = new Date(iso + 'T12:00:00Z');
  const litServed = cal.isLiturgyServed(dateObj);

  const [m, v, l] = await Promise.all([
    fetchJson(`${BASE}/api/matins?date=${iso}`),
    fetchJson(`${BASE}/api/service?date=${iso}`),
    litServed ? fetchJson(`${BASE}/api/liturgy?date=${iso}`) : Promise.resolve(null),
  ]);

  const matins  = classify(m.status, m.body,  MATINS_STUB_MAX);
  const vespers = classify(v.status, v.body, VESPERS_STUB_MAX);
  const liturgy = l ? classify(l.status, l.body, LITURGY_STUB_MAX) : { tag: 'n/a', blocks: 0 };

  let feastRank = null, feastKey = null;
  try { feastRank = cal.getFeastRank(dateObj) || null; } catch (_) {}
  try { feastKey  = cal.getGreatFeastKey(dateObj) || null; } catch (_) {}

  const menaionFile = menaionFileFor(iso);
  return {
    iso,
    dow: dateObj.getUTCDay(),
    feastRank, feastKey, litServed,
    hasMenaion: menaionFiles.has(menaionFile),
    menaionFile,
    matins, vespers, liturgy,
  };
}

function rowMd(r) {
  const cell = (c) => c.tag === 'ok' ? String(c.blocks)
                    : c.tag === 'n/a' ? '—'
                    : c.tag === 'stub' ? `**${c.blocks}** _stub_`
                    : c.tag === 'no-service' ? '404'
                    : c.tag === 'empty' ? '_empty_'
                    : `_${c.tag}_`;
  const flags = [];
  if (r.feastKey)  flags.push(`feast=${r.feastKey}`);
  if (r.feastRank) flags.push(r.feastRank);
  if (r.hasMenaion) flags.push('men');
  return `| ${r.iso} | ${cell(r.matins)} | ${cell(r.vespers)} | ${cell(r.liturgy)} | ${flags.join(' · ') || '—'} |`;
}

function hasMenaionMatinsBlock(file) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(MENAION_DIR, file), 'utf8'));
    return !!(d.matins && Object.keys(d.matins).length);
  } catch (_) { return false; }
}

(async () => {
  console.log(`Coverage report: ${FROM} → ${TO} via ${BASE}`);
  const results = [];
  let i = 0;
  for (const iso of eachDate(FROM, TO)) {
    process.stdout.write(`\r  ${iso}  (${++i})    `);
    results.push(await probe(iso));
  }
  process.stdout.write('\n');

  // --- aggregate ---
  const stubMatins   = results.filter(r => r.matins.tag  === 'stub' && r.hasMenaion);
  const stubVespers  = results.filter(r => r.vespers.tag === 'stub');
  const stubLiturgy  = results.filter(r => r.liturgy.tag === 'stub');
  const error404     = results.filter(r => [r.matins.tag, r.vespers.tag, r.liturgy.tag]
                                            .some(t => t === 'no-service' || t === 'error'));
  // `getFeastRank` only returns greatFeast / vigil / sixStichera today; treat
  // greatFeast + vigil as elevated. Polyeleos/doxology are encoded in menaion
  // files (`_meta.feastRank`), not calendar-rules — they show up as `hasMenaion`.
  const ELEVATED = new Set(['greatFeast', 'vigil']);
  const noMenaionRank = results.filter(r => !r.hasMenaion && ELEVATED.has(r.feastRank));

  // Cross-reference: dates whose menaion file has no matins block
  const menaionNoMatins = results.filter(r => r.hasMenaion
                                            && !hasMenaionMatinsBlock(r.menaionFile));

  // --- emit markdown ---
  const out = [];
  out.push(`# 2026 Service Coverage Report`);
  out.push('');
  out.push(`Generated ${new Date().toISOString().slice(0, 19)} from ${BASE}`);
  out.push('');
  out.push(`Range: ${FROM} → ${TO} (${results.length} dates)`);
  out.push('');
  out.push(`## Summary`);
  out.push('');
  out.push(`- Matins stubs with menaion file: **${stubMatins.length}**`);
  out.push(`- Vespers stubs: **${stubVespers.length}**`);
  out.push(`- Liturgy stubs: **${stubLiturgy.length}**`);
  out.push(`- Dates with 4xx/5xx on any endpoint: **${error404.length}**`);
  out.push(`- Dates without menaion file but with elevated feast rank: **${noMenaionRank.length}**`);
  out.push(`- Dates with menaion file but no \`matins\` block: **${menaionNoMatins.length}**`);
  out.push('');
  out.push(`Stub thresholds: matins ≤${MATINS_STUB_MAX}, vespers ≤${VESPERS_STUB_MAX}, liturgy ≤${LITURGY_STUB_MAX} blocks.`);
  out.push('');

  // --- highest-leverage targets ---
  out.push(`## Highest-leverage authoring targets`);
  out.push('');
  out.push(`### Dates with menaion file but no \`matins\` block (easy wins)`);
  out.push('');
  if (menaionNoMatins.length === 0) {
    out.push('_None — every menaion file ships a matins block._');
  } else {
    out.push('| Date | DoW | Menaion file | Rank | Feast | Cur. M blocks |');
    out.push('|------|-----|--------------|------|-------|---------------|');
    const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (const r of menaionNoMatins) {
      out.push(`| ${r.iso} | ${dows[r.dow]} | ${r.menaionFile} | ${r.feastRank||'-'} | ${r.feastKey||'-'} | ${r.matins.blocks} |`);
    }
  }
  out.push('');

  out.push(`### Dates with no menaion file but elevated rank (alternate-source targets)`);
  out.push('');
  if (noMenaionRank.length === 0) {
    out.push('_None._');
  } else {
    out.push('| Date | Rank | Feast |');
    out.push('|------|------|-------|');
    for (const r of noMenaionRank) {
      out.push(`| ${r.iso} | ${r.feastRank} | ${r.feastKey||'-'} |`);
    }
  }
  out.push('');

  out.push(`### Dates that 404 / error on any endpoint`);
  out.push('');
  if (error404.length === 0) {
    out.push('_None._');
  } else {
    out.push('| Date | Matins | Vespers | Liturgy |');
    out.push('|------|--------|---------|---------|');
    for (const r of error404) {
      out.push(`| ${r.iso} | ${r.matins.tag} | ${r.vespers.tag} | ${r.liturgy.tag} |`);
    }
  }
  out.push('');

  // --- full heat-map ---
  out.push(`## Heat-map (every date)`);
  out.push('');
  out.push(`Cell shows block count; **bold** + _stub_ marks below threshold. Flags: \`feast=\` great-feast key, rank, \`men\` = has menaion file.`);
  out.push('');
  out.push('| Date | Matins | Vespers | Liturgy | Flags |');
  out.push('|------|--------|---------|---------|-------|');
  for (const r of results) out.push(rowMd(r));
  out.push('');

  const outPath = path.join(__dirname, 'reports', `coverage-${YEAR}.md`);
  fs.writeFileSync(outPath, out.join('\n'));
  console.log(`\nWrote ${outPath}`);

  // Also dump raw JSON for downstream tooling.
  const jsonPath = path.join(__dirname, 'reports', `coverage-${YEAR}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`Wrote ${jsonPath}`);
})();
