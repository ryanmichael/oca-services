#!/usr/bin/env node
'use strict';

// Strips typikon/editorial prose that the Lambertsen-style scrape glued into
// sung stichera text. See memory project-stephen-8-02-audit-2026-08-01 and the
// KNOWN_RUBRIC_BLEED baseline in server-lib/overlays/drift.js.
//
//   node scripts/strip-rubric-bleed.js            # dry run, writes a report
//   node scripts/strip-rubric-bleed.js --apply    # writes to storage/oca.db
//
// Trailing rubrics introduce a DIFFERENT hymn (usually a troparion) that was
// appended to the sticheron. Those tails are frequently a translation we hold
// nowhere else, so every one is preserved to audit/rubric-bleed-tails.json
// rather than dropped. Ingesting them is a separate, deliberate task — doing it
// here would silently change what renders.

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'storage', 'oca.db');
const TAILS   = path.join(ROOT, 'audit', 'rubric-bleed-tails.json');

// Rubric that introduces a following hymn — everything from here on is a
// different text and does not belong in this row.
const TRAILING = [
  /\s*After the (?:dismissal|blessing) of [^.]{0,80}?[,:]\s*(?=[A-Z“"]|this |the )/,
  /\s*(?:,\s*)?(?:the |this )?(?:Or this )?Troparion(?:\s+(?:of|to)\s+[^:]{0,60})?,?\s*in Tone [IVX]+:\s*/,
  /\s*Glory\s*\.\.\.,?\s*in Tone [IVX]+:\s*/,
  /\s*\bODE?\s+[IVX]+\s+Irmos:\s*/,
  // An entire canon appended to a sticheron.
  /\s*\bAT (?:COMPLINE|MATINS|VESPERS)\b/,
  /\s*\bCanon (?:to|of) [^:]{0,120}?,\s*in Tone [IVX]+:\s*/,
  // A bare tone header after a finished sentence introduces a further hymn
  // (usually the Theotokion). Requires sentence-final punctuation before and a
  // capital after, so it can't fire mid-sentence.
  /(?<=[.!?”"])\s+in Tone [IVX]+:\s*(?=[A-Z“"])/,
];

// Hymnographers named in "the composition of X". A CLOSED SET derived from the
// corpus, longest-first — not a generic capitalized-word pattern. The rubric has
// no closing delimiter ("…of Anatolius The martyr Clement…"), so a greedy match
// silently eats the hymn's first word ("The", "Thou", "Wetting"). Add a name here
// rather than loosening the pattern.
const COMPOSERS = [
  'Andrew of Jerusalem', 'Andrew of Crete', 'Andrew Pyrrhus', 'Andrew',
  'Ephraim of Karyes', 'John the Monk', 'the Studite',
  'Anatolius', 'Byzantius', 'Cyprian', 'Germanus', 'Sergius', 'Theophanes',
].map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

// Rubric that introduces THIS row's text — strip the prefix, keep the hymn.
const LEADING = [
  /^\s*And \d+ Stichera[^:]{0,90}:\s*/,
  new RegExp(
    `^\\s*(?:of the (?:feast|forefeast|saint|martyrs?|venerable one)[^,:]{0,40},\\s*)?` +
    `the composition of (?:${COMPOSERS})` +
    `(?:\\s*,?\\s*in the same tone(?:\\s*&\\s*melody)?)?(?:\\s*,?\\s*in Tone [IVX]+)?\\s*[:,]?\\s*`
  ),
  /^\s*(?:Or this )?(?:Troparion|Sticheron|Kontakion)(?:\s+(?:of|to)\s+[^:]{0,60})?,?\s*in Tone [IVX]+:\s*/,
  /^\s*of the (?:feast|forefeast)[^:]{0,40},?\s*in Tone [IVX]+:\s*/,
  // Same rubrics without a closing delimiter ("of the feast The Ancient of days…",
  // "the Troparion of the holy prophet Celebrating the memory…"). Consume the
  // lowercase rubric words and stop at the first capital — the hymn's opening word.
  /^\s*(?:the |this )?(?:Troparion|Sticheron|Kontakion) of the (?:[a-z]+\s+){1,4}(?=[A-Z“"])/,
  /^\s*of the (?:[a-z]+\s+){1,3}(?=[A-Z“"])/,
  // Pentecostarion pointers and other bare leading rubrics ending in a colon.
  /^\s*(?:Doxasticon\s+)?(?:from|of) the Pentecostarion[.,]?\s*(?:[Oo]r this )?(?:Theotokion|Doxasticon)?,?\s*in Tone [IVX]+:\s*/,
  /^\s*Doxasticon of the (?:feast|forefeast)[^:]{0,40},?\s*in Tone [IVX]+:\s*/,
  /^\s*And (?:\d+|these) (?:Stichera )?(?:for )?[^:]{0,60}?,\s*in Tone [IVX]+:\s*/,
  /^\s*that of the (?:feast|forefeast)[^:]{0,40},?\s*in Tone [IVX]+:\s*/,
  /^\s*,?\s*in the same melody:\s*/,
  // Conditional rubric selecting between Fast/non-Fast endings.
  /^\s*If it be the Fast:[^:]{0,60}(?:Theotokion|Stavrotheotokion),?\s*in Tone [IVX]+:\s*/,
];

// Rows holding two hymns run together with NO rubric between them, so there is
// no marker to key on. Split literal per row rather than by pattern — a generic
// "two hymns" heuristic would cut legitimate multi-strophe stichera in half.
const SPLIT_AT = {
  8415: 'The ewe-lamb, as she beheld the Lamb',   // Theotokion + Stavrotheotokion, 3-11 lordICall
};

// Once a following hymn is cut away, the rubric that INTRODUCED it can be left
// dangling at the end ("…O my God! But if it be not the Fast:"). Applied
// repeatedly until stable, since a row can carry more than one.
const DANGLING = [
  /\s*(?:But\s+)?[Ii]f (?:this day|it be|the day)[^.!?”"]{0,90}:?\s*$/,
  /\s*At the blessing of the [Ll]oaves[^.!?”"]{0,40}:?\s*$/,
  /\s*,?\s*we chant:?\s*$/,
];

function transform(text, id) {
  let out = text, tail = null;
  for (const re of LEADING) out = out.replace(re, '');
  const at = SPLIT_AT[id] && out.indexOf(SPLIT_AT[id]);
  if (at > 40) { tail = out.slice(at).trim(); out = out.slice(0, at); }
  for (const re of TRAILING) {
    const m = re.exec(out);
    if (!m) continue;
    const cut = out.slice(m.index);
    // Guard: never let a rubric match swallow the whole row.
    if (m.index < 40) continue;
    tail = (tail ? tail + '\n---\n' : '') + cut.trim();
    out = out.slice(0, m.index);
  }
  for (let i = 0; i < 4; i++) {
    const before = out;
    for (const re of DANGLING) out = out.replace(re, '');
    if (out === before) break;
  }
  return { text: out.trim(), tail };
}

function main() {
  const apply = process.argv.includes('--apply');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB_PATH, ...(apply ? [] : [{ readonly: true }]));

  const src  = fs.readFileSync(path.join(ROOT, 'server-lib/overlays/drift.js'), 'utf8');
  const bm   = /const KNOWN_RUBRIC_BLEED = new Set\(\[([\s\S]*?)\]\);/.exec(src);
  const argIds = process.argv.find(a => a.startsWith('--ids='));
  const ids  = argIds ? argIds.slice(6).split(',').map(Number)
                      : (bm[1].match(/\d+/g) || []).map(Number);

  // Rows that are not a sticheron at all — wholly canon text mis-ingested into a
  // stichera slot, so there is no prefix to strip and truncating would blank them.
  // 9558 is 7.2k of ODE III-IX sitting at 12-24 (Eve of the Nativity) aposticha
  // order 5, where the aposticha injection treats order>=1 as singable. Removed
  // from stichera; the full text is preserved in the tails artifact.
  const WHOLLY_CANON = new Set([9558]);

  const changes = [], tails = [], untouched = [], deletes = [];
  for (const id of ids) {
    const row = db.prepare('SELECT id, commemoration_id, section, "order", tone, text FROM stichera WHERE id = ?').get(id);
    if (!row) continue;
    if (WHOLLY_CANON.has(id)) {
      deletes.push(id);
      tails.push({ stichera_id: id, commemoration_id: row.commemoration_id, section: row.section,
                   order: row.order, reason: 'wholly-canon row removed from stichera', tail: row.text });
      continue;
    }
    const { text, tail } = transform(row.text, id);
    if (text === row.text) { untouched.push(id); continue; }
    if (!text) { untouched.push(id); continue; }   // never blank a row
    changes.push({ id, before: row.text, after: text });
    if (tail) tails.push({ stichera_id: id, commemoration_id: row.commemoration_id, section: row.section, order: row.order, tail });
  }

  if (apply) {
    const upd = db.prepare('UPDATE stichera SET text = ? WHERE id = ?');
    for (const c of changes) upd.run(c.after, c.id);
    const del = db.prepare('DELETE FROM stichera WHERE id = ?');
    for (const id of deletes) del.run(id);
    fs.mkdirSync(path.dirname(TAILS), { recursive: true });
    // Merge, don't clobber — a targeted --ids run must not drop tails from an
    // earlier full run.
    let merged = [];
    if (fs.existsSync(TAILS)) merged = JSON.parse(fs.readFileSync(TAILS, 'utf8'));
    const seen = new Map(merged.map(t => [t.stichera_id, t]));
    for (const t of tails) seen.set(t.stichera_id, t);
    merged = [...seen.values()].sort((a, b) => a.stichera_id - b.stichera_id);
    fs.writeFileSync(TAILS, JSON.stringify(merged, null, 2) + '\n');
    console.log(`APPLIED ${changes.length} update(s), ${deletes.length} delete(s); ${tails.length} tail(s) preserved to ${path.relative(ROOT, TAILS)}`);
  } else {
    console.log(`DRY RUN: ${changes.length} change(s), ${deletes.length} delete(s), ${tails.length} tail(s) preserved, ${untouched.length} untouched.`);
    if (untouched.length) console.log('untouched (need manual review): ' + untouched.join(', '));
  }
  fs.writeFileSync('/tmp/bleed-changes.json', JSON.stringify(changes, null, 1));
  db.close();
}

main();
