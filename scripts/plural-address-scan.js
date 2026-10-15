#!/usr/bin/env node
'use strict';

// Plural-address scan — hymns that address a plural subject in the singular.
//
// The daily Octoechos was converted from the "you" register to "thou" by
// script. The conversion cannot see number: "you watered the whole earth, O
// disciples of the Lord" became "THOU watered the whole earth, O disciples of
// the Lord", and "you drive out spirits" became the ungrammatical "thou still
// drive out spirits". Four such hymns printed at Daily Vespers on 2026-10-14
// and were caught only by reading the choir director's sheet beside ours —
// the structural audit passes 0/0/0 on every one of them, because nothing it
// checks is about agreement.
//
// The marker is an explicit plural vocative ("O disciples", "O saints") in a
// text that also uses thou/thy/thee/thine for that same subject. Hymns that
// address a plural subject WITHOUT such a vocative are invisible here, so the
// count is a floor, not the true number.
//
//   node scripts/plural-address-scan.js
//   node scripts/plural-address-scan.js --check audit/plural-address-baseline.json
//   node scripts/plural-address-scan.js --capture-baseline audit/plural-address-baseline.json
//
// --check exits 2 when a key appears that the baseline does not list. It does
// NOT fail on the known ones: this is a drift guard over a burn-down, the same
// shape as rescrape-baseline and packet-baseline.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PLURAL_VOCATIVE =
  /\bO (?:disciples|apostles|saints|martyrs|fathers|hierarchs|holy ones|passion-bearers)\b/i;
const SINGULAR_ADDRESS = /\b(?:thou|thy|thee|thine)\b/i;

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// --- DB troparia/kontakia -------------------------------------------------
//
// The octoechos scan above keys on an explicit "O <plural>" vocative. The DB's
// yy->tt rows mostly lack one: the Marcian-and-Martyrius kontakion read "From
// thy youth THOU WAST good ATHLETES" with no vocative at all, and rendered
// that way at the Liturgy of 2026-10-25. What it does have is number
// DISAGREEMENT — a singular second-person form sharing a sentence with a
// plural predicate noun, and no third-person plural to carry it instead.
//
// The third-person exclusion is what keeps the precision: "Thy holy martyrs, O
// Lord, through THEIR sufferings have received…" addresses the Lord in the
// singular about the martyrs, and is correct. Without it the scan returns 337
// rows, nearly all of them fine.
//
// Still a floor, for the same reason as above: a plural subject with no plural
// predicate noun is invisible here. The troparion fixed alongside that
// kontakion ("In holy zeal thou didst dispel…") is one such — it needed the
// choir packet to see.
const PLURAL_PREDICATE =
  /\b(?:athletes|pillars|twins|followers|beacons|lambs|champions|bulwarks|luminaries|heralds|rivers|physicians|soldiers|shepherds|teachers|preachers|disciples|labourers|laborers|lamps|towers|victims)\b/i;
const THIRD_PERSON_PLURAL = /\b(?:their|them|they)\b/i;

function scanDb() {
  let openDb;
  try { ({ openDb } = require('../server-lib/cache/sqlite')); } catch { return []; }
  const db = openDb();
  if (!db) return [];
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='troparia'"
    ).get();
    if (!exists) return [];
    const rows = db.prepare(`
      SELECT t.id, t.type, c.title, t.text
      FROM troparia t JOIN commemorations c ON c.id = t.commemoration_id
      WHERE t.pronoun = 'tt'
    `).all();
    const hits = [];
    for (const r of rows) {
      // The Podoben marker quotes the incipit of the MELODY's hymn, which is
      // usually addressed to Christ ("As Thou wast voluntarily raised…"). It is
      // not this hymn's own address, and leaving it in makes every podoben row
      // with a plural predicate a false positive.
      const body = String(r.text).replace(/\(Podoben:[^)]*\)/gi, ' ');
      const bad = body.split(/(?<=[.!?])\s+/).some(sentence =>
        SINGULAR_ADDRESS.test(sentence)
        && PLURAL_PREDICATE.test(sentence)
        && !THIRD_PERSON_PLURAL.test(sentence));
      if (bad) {
        hits.push({
          key: `troparia[${r.id}]`,
          incipit: `${r.title.slice(0, 34)} — ${String(r.text).replace(/\n/g, ' ').slice(0, 56)}`,
        });
      }
    }
    return hits;
  } finally {
    db.close();
  }
}

/** Every offending hymn, keyed by its path in octoechos.json. */
function scan() {
  const oct = JSON.parse(fs.readFileSync(path.join(ROOT, 'variable-sources', 'octoechos.json'), 'utf8'));
  const hits = [];
  for (let tone = 1; tone <= 8; tone++) {
    for (const day of DAYS) {
      const vespers = oct[`tone${tone}`]?.[day]?.vespers;
      if (!vespers) continue;
      for (const section of ['lordICall', 'aposticha']) {
        const hymns = vespers[section]?.hymns;
        if (!Array.isArray(hymns)) continue;
        hymns.forEach((hymn, i) => {
          const text = typeof hymn === 'string' ? hymn : (hymn && hymn.text) || '';
          if (PLURAL_VOCATIVE.test(text) && SINGULAR_ADDRESS.test(text)) {
            hits.push({ key: `tone${tone}.${day}.${section}[${i}]`, incipit: text.slice(0, 60) });
          }
        });
      }
    }
  }
  return hits.concat(scanDb());
}

function main() {
  const argv = process.argv.slice(2);
  const checkPath   = argv.includes('--check') ? argv[argv.indexOf('--check') + 1] : null;
  const capturePath = argv.includes('--capture-baseline')
    ? argv[argv.indexOf('--capture-baseline') + 1] : null;

  const hits = scan();
  const keys = hits.map(h => h.key).sort();

  if (capturePath) {
    fs.writeFileSync(path.join(ROOT, capturePath),
      JSON.stringify({ captured: new Date().toISOString(), keys }, null, 2) + '\n');
    console.log(`[plural-address] baseline captured — ${keys.length} key(s) -> ${capturePath}`);
    return;
  }

  if (checkPath) {
    const baseline = JSON.parse(fs.readFileSync(path.join(ROOT, checkPath), 'utf8'));
    const known = new Set(baseline.keys || []);
    const added = keys.filter(k => !known.has(k));
    const fixed = (baseline.keys || []).filter(k => !keys.includes(k));
    if (fixed.length) console.log(`[plural-address] ${fixed.length} fixed since baseline: ${fixed.join(', ')}`);
    if (added.length) {
      console.error(`[plural-address] ${added.length} NEW hymn(s) address a plural subject in the singular:`);
      for (const k of added) console.error(`  ${k}  ${hits.find(h => h.key === k).incipit}`);
      console.error('Fix the agreement, or re-capture the baseline if this is intentional.');
      process.exit(2);
    }
    console.log(`[plural-address] OK — ${keys.length} known, 0 new.`);
    return;
  }

  console.log(`${hits.length} hymn(s) address a plural subject in the singular (floor — needs an explicit "O <plural>" vocative to be visible):\n`);
  for (const h of hits) console.log(`  ${h.key}\n    ${h.incipit}…`);
}

main();
