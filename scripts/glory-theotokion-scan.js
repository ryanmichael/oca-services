#!/usr/bin/env node
'use strict';

// Glory-slot Theotokion scan — a Theotokion mis-keyed into the doxastikon slot.
//
// Menaion stichera convention (see audit/rules/D-structure/D14):
//
//   order = -1   the Menaion's own "Now and ever" (Theotokion, or a
//                Stavrotheotokion alternative tagged group_role)
//   order =  0   Glory / doxastikon
//   order >= 1   numbered stichera, sung against the psalm verses
//
// A day-file that prints "Glory…, Now and ever…: Theotokion" for a saint who
// has no doxastikon of his own gives the scraper one hymn and two slots to put
// it in, and it chooses order=0. The consequence is audible: the assembler
// renders that Theotokion under "Glory to the Father…" attributed to the
// saint, then fills "Now and ever…" from the Octoechos — so the choir sings
// two Theotokia back to back and the saint is credited with the first.
//
// 2026-10-29 (Monastic Martyr Anastasia of Rome) was the worked example:
// "Rejoice, bearer of the divine Light" sang at the Glory as hers, with the
// Octoechos "Thou contained the uncontainable God" under the Now. The
// structural audit passed 0 high / 0 medium / 0 low on it — nothing it checks
// is about who a hymn addresses.
//
// Detection is by VOCATIVE, case-sensitively, and only on vocatives that can
// address no one but the Theotokos. Saints are called "O most blessed one"
// (7-30 Martyr John the Soldier) and "O virgin princess Juliana" (7-06), so
// neither of those belongs in the pattern — including them flagged four
// saints' own proper doxastika. Commemorations of the Theotokos herself
// (saint_type='theotokos') are skipped: a Glory that addresses her is exactly
// what those days appoint.
//
// Still a floor, not the true number: a Theotokion that speaks ABOUT her in
// the third person rather than addressing her carries no vocative and is
// invisible here.
//
//   node scripts/glory-theotokion-scan.js
//   node scripts/glory-theotokion-scan.js --check audit/glory-theotokion-baseline.json
//   node scripts/glory-theotokion-scan.js --capture-baseline audit/glory-theotokion-baseline.json
//
// --check exits 2 when a commemoration appears that the baseline does not
// list. It does NOT fail on the known ones: this is a drift guard over a
// burn-down, the same shape as rescrape-baseline, packet-baseline and
// plural-address-baseline. Remediation is per-row and needs the OCA source
// read first (move order=0 -> order=-1 only once the text is confirmed to be
// the day's Theotokion and the saint truly has no doxastikon), so the list
// shrinks a commemoration at a time rather than by a blanket re-key.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// Vocatives that address the Theotokos and nobody else. Case-sensitive on the
// proper nouns deliberately — "O virgin princess Juliana" is a saint.
const ADDRESSES_THEOTOKOS = new RegExp([
  'O (?:most pure|all-pure|all pure|immaculate|all-immaculate|undefiled|all-undefiled|unwedded) one\\b',
  'O (?:Theotokos|Lady|Bride of God|Mother of God|Birthgiver of God|Virgin Mother|Virgin Sovereign|Sovereign Lady)\\b',
  'O (?:all-hymned|all-holy|most holy|holy) (?:Theotokos|Virgin|Lady)\\b',
  // "O Virgin," / "O Virgin!" / "O Virgin Theotokos" — but not "O Virgin
  // princess", where a lowercase noun marks a saint rather than her.
  'O Virgin\\b(?![ -][a-z])',
  'O pure one\\b',
].join('|'));

function scan() {
  const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
  const db = openDb();
  if (!db) return null;                                 // DB absent → skip
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
    ).get();
    if (!exists) return null;

    const rows = db.prepare(`
      SELECT s.id, s.section, s.text,
             c.id AS cid, c.title, c.month, c.day, c.saint_type
      FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
      WHERE s."order" = 0
    `).all();

    const hits = [];
    for (const r of rows) {
      if (r.saint_type === 'theotokos') continue;
      if (!ADDRESSES_THEOTOKOS.test(r.text)) continue;
      hits.push({
        // Keyed by commemoration + section, not row id: a re-scrape renumbers
        // rows, and the debt is "this saint's Glory slot", not a row.
        key: `${r.cid}:${r.section}`,
        where: `${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
        incipit: `${r.title.slice(0, 38)} — ${r.text.replace(/\s+/g, ' ').slice(0, 56)}`,
      });
    }
    return hits;
  } finally {
    db.close();
  }
}

function main() {
  const argv        = process.argv.slice(2);
  const checkPath   = argv.includes('--check') ? argv[argv.indexOf('--check') + 1] : null;
  const capturePath = argv.includes('--capture-baseline')
    ? argv[argv.indexOf('--capture-baseline') + 1] : null;

  const hits = scan();
  if (hits === null) {
    console.log('[glory-theotokion] no stichera table — skipped.');
    return;
  }
  const keys = [...new Set(hits.map(h => h.key))].sort();

  if (capturePath) {
    fs.writeFileSync(path.join(ROOT, capturePath),
      JSON.stringify({ captured: new Date().toISOString(), keys }, null, 2) + '\n');
    console.log(`[glory-theotokion] baseline captured — ${keys.length} key(s) -> ${capturePath}`);
    return;
  }

  if (checkPath) {
    const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, checkPath), 'utf8'));
    const known    = new Set(baseline.keys || []);
    const added    = keys.filter(k => !known.has(k));
    const fixed    = [...known].filter(k => !keys.includes(k));

    if (added.length) {
      console.error(`[glory-theotokion] ${added.length} NEW Glory-slot Theotokion(s):`);
      for (const k of added) {
        const h = hits.find(x => x.key === k);
        console.error(`  ${h.where}  #${k}  ${h.incipit}`);
      }
      console.error('\nA Theotokion in the order=0 slot is sung under "Glory to the Father…"');
      console.error('and credited to the saint. If the saint has no doxastikon, re-key the row');
      console.error('to order=-1 so it renders as one combined "Glory… now and ever…".');
      process.exit(2);
    }
    console.log(`[glory-theotokion] OK — ${keys.length} known, 0 new.`
      + (fixed.length ? ` (${fixed.length} fixed since baseline: ${fixed.join(', ')})` : ''));
    return;
  }

  console.log(`[glory-theotokion] ${keys.length} Glory slot(s) holding a Theotokion:\n`);
  for (const h of hits.sort((a, b) => a.where.localeCompare(b.where))) {
    console.log(`  ${h.where}  #${h.key.padEnd(12)} ${h.incipit}`);
  }
}

main();
