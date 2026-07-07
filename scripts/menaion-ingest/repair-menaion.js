#!/usr/bin/env node
// Phase 6b: repair mis-attributed stichera. Finds covered commemorations whose
// stored (non-lambertsen) stichera are ENTIRELY moveable-cycle text (Triodion/
// Pentecostarion) — i.e. the saint's proper was displaced by a scrape error —
// AND for which Lambertsen has the real proper. Requiring *all* rows to match
// (not some) cleanly excludes legitimate seasonal blends (e.g. George in Bright
// Week, whose rows mix his own stichera with paschal ones).
//
// Read-only by default: prints candidates + the DELETE SQL to
// repair-delete.sql. Deleting the wrong rows makes the commemoration
// gap-fillable, so re-running the importer inserts the Lambertsen proper.
//
// Usage: node repair-menaion.js            # analyze + write repair-delete.sql

const { execFileSync } = require('child_process');
const fs = require('fs');

const DB = '/Users/ryanmurphy/claude-code/oca-services/storage/oca.db';
const manifest = require('./menaion-manifest.json').filter((r) => r.verdict === 'already-covered' && r.commemoration_id);

// Same moveable-cycle marker set the QA cross-check uses.
const GENERIC_RE = new RegExp([
  'myrrh-?bearing women', 'the myrrhbearers', 'blind from birth', 'the Paralytic',
  'in the middle of the feast', 'life-giving Spring', 'Doubt bore', 'Thomas said',
  'Unless I see', 'the tomb, O', 'Samaritan woman',
  'pride of the Pharisee', "Publican's", 'the Publican', 'like the Prodigal',
  'the arena of the Fast', 'the source of blessings', 'announcements of Lent',
  'Savior Who planted the vineyard', 'midway through its course', 'the Ninevites',
  'Let us flee from the pride', 'purify ourselves with alms', 'receive with joy the divinely-inspired',
  'shalt come to earth with glory', 'when Thou, O God',
].join('|'), 'i');

function rows(cid) {
  const sql = `SELECT json_group_array(json_object('id',id,'section',section,'ord',"order",'text',text))
    FROM stichera WHERE commemoration_id=${cid} AND source!='lambertsen';`;
  return JSON.parse(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }) || '[]');
}

// saint name helpers (mirror menaion-qa.js)
const NAME_STOP = new Set(('The Of And With Those Them Saint St Holy Venerable Blessed Righteous ' +
  'Father Mother Great Glorious Wonderworker Hieromartyr Martyr Martyrs Greatmartyr Apostle Apostles ' +
  'Evangelist Bishop Archbishop Patriarch Pope Abbot Abbess Confessor Prophet Equal Seventy Monk Nun ' +
  'Virgin Icon God New Emperor Empress King Prince Princess Translation Uncovering Repose Synaxis ' +
  'Meeting Leavetaking Veneration Forefeast Afterfeast Council Chains Relics Commemoration').split(/\s+/));
function primaryName(title) {
  for (const w of title.replace(/&[a-z]+;/g, ' ').replace(/[^A-Za-z\s]/g, ' ').split(/\s+/))
    if (w.length > 3 && /^[A-Z]/.test(w) && !NAME_STOP.has(w)) return w;
  return null;
}
function nameKey(t) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
    .replace(/ph/g, 'f').replace(/th/g, 't').replace(/kh/g, 'h').replace(/k/g, 'c')
    .replace(/[yj]/g, 'i').replace(/v/g, 'b').replace(/z/g, 's').replace(/(.)\1+/g, '$1').replace(/[st]$/, '');
}
function textNamesSaint(text, name) {
  if (new RegExp('\\b' + name + '\\w{0,3}\\b', 'i').test(text)) return true;
  const k = nameKey(name);
  return text.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).some((w) => w.length > 3 && nameKey(w) === k);
}

const candidates = [];
for (const r of manifest) {
  const name = primaryName(r.matchTitle || '');
  if (!name) continue;                                  // need a checkable saint name
  const rs = rows(r.commemoration_id);
  if (rs.length < 2) continue;
  const hasMoveable = rs.some((x) => GENERIC_RE.test(x.text));
  if (!hasMoveable) continue;                           // not moveable-cycle text
  const saintNamed = rs.some((x) => textNamesSaint(x.text, name));
  if (saintNamed) continue;                             // some proper present => blend, skip
  candidates.push({ ...r, name, rows: rs });
}

console.log(`\n=== Phase 6b repair candidates: ${candidates.length} ===`);
console.log(`(covered commemorations whose stored stichera are ENTIRELY moveable-cycle`);
console.log(` text; Lambertsen has the proper. Mixed/seasonal-blend cases excluded.)\n`);
const delIds = [];
for (const c of candidates.sort((a, b) => a.month - b.month || a.day - b.day)) {
  const marker = (c.rows[0].text.match(GENERIC_RE) || [''])[0];
  console.log(`  ${c.month}/${String(c.day).padStart(2)}  cid ${c.commemoration_id}  "${c.matchTitle.slice(0, 46)}"  (${c.rows.length} wrong rows, e.g. "${marker}")`);
  c.rows.forEach((x) => delIds.push(x.id));
}

const sql = 'BEGIN;\nDELETE FROM stichera WHERE id IN (' + delIds.join(',') + ');\nCOMMIT;\n';
fs.writeFileSync(__dirname + '/repair-delete.sql', sql);
console.log(`\n${delIds.length} wrong rows across ${candidates.length} commemorations.`);
console.log(`DELETE SQL -> repair-delete.sql. After applying, re-run the importer to`);
console.log(`insert the Lambertsen proper for these (now gap-fillable) commemorations.`);
