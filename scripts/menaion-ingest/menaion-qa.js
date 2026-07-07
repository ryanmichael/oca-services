#!/usr/bin/env node
// Phase 6: QA cross-check. Uses the already-covered Lambertsen chapters as an
// independent witness to flag likely problems in our EXISTING (non-lambertsen)
// stichera — chiefly mis-attribution: our rows for saint X actually containing
// text about a different saint. Read-only; emits a ranked report.
//
// Signal: for a commemoration our DB already covers, does our stichera text
// mention the saint's name? Lambertsen's stichera for the same saint do. If
// Lambertsen names the saint but OURS do not, our rows are suspect.
//
// Usage: node menaion-qa.js

const { execFileSync } = require('child_process');
const { parseChapter } = require('./parse-menaion.js');

const DB = '/Users/ryanmurphy/claude-code/oca-services/storage/oca.db';
const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
const manifest = require('./menaion-manifest.json').filter((r) => r.verdict === 'already-covered');

// Primary personal name from a title: first capitalized word that is not a
// rank/among-the-saints/geography stopword.
const NAME_STOP = new Set(('The Of And With His Her Those Them At In On Saint St Holy Venerable ' +
  'Blessed Righteous Father Mother Our Great Glorious Wonderworker Wonder Worker ' +
  'Hieromartyr Martyr Martyrs Greatmartyr Apostle Apostles Evangelist Bishop Archbishop ' +
  'Patriarch Pope Abbot Abbess Confessor Prophet Equal Seventy Monk Nun Virgin Icon ' +
  'God Commemoration New Emperor Empress King Prince Princess Deacon Priest Presbyter ' +
  'Translation Uncovering Repose Synaxis Nine Twelve Forty First Second Third').split(/\s+/));
function primaryName(title) {
  const clean = title.replace(/&[a-z]+;/g, ' ').replace(/[^A-Za-z\s]/g, ' ');
  for (const w of clean.split(/\s+/)) {
    if (w.length > 3 && /^[A-Z]/.test(w) && !NAME_STOP.has(w)) return w;
  }
  return null;
}
// transliteration-folding key so Therapon/Therapont, Simeon/Symeon collide
function nameKey(t) {
  let s = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  return s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/kh/g, 'h').replace(/k/g, 'c')
    .replace(/[yj]/g, 'i').replace(/v/g, 'b').replace(/z/g, 's').replace(/(.)\1+/g, '$1').replace(/[st]$/, '');
}
// Words that are NOT saint identifiers when they appear in stichera text.
const DIVINE = new Set(('Lord Christ God Jesus Spirit Father Son Trinity Cross Angel Angels ' +
  'Master Savior Saviour Virgin Theotokos Mother Mary Word Creator Maker Publican Pharisee ' +
  'David Moses Israel Adam Eve Prodigal Jordan Egypt Apostles Martyrs Saints Myrrh Paralytic ' +
  'Forerunner Baptist Heaven Church Gospel Wisdom Grace Come Today Rejoice Glory Now Having ' +
  'Thou Thee Thy When Who With What Let Behold').split(/\s+/));
// Marker phrases that betray a mis-filed MOVEABLE-CYCLE sticheron (Triodion /
// Pentecostarion / octoechos) sitting on a fixed-calendar saint. High precision:
// a saint's own proper never contains these.
const GENERIC_RE = new RegExp([
  // Pentecostarion / resurrection
  'myrrh-?bearing women', 'the myrrhbearers', 'blind from birth', 'the Paralytic',
  'in the middle of the feast', 'life-giving Spring', 'Doubt bore', 'Thomas said',
  'Unless I see', 'the tomb, O', 'Samaritan woman',
  // Triodion / Lenten
  'pride of the Pharisee', "Publican's", 'the Publican', 'like the Prodigal',
  'the arena of the Fast', 'the source of blessings', 'announcements of Lent',
  'Savior Who planted the vineyard', 'midway through its course', 'the Ninevites',
  'Let us flee from the pride', 'purify ourselves with alms', 'receive with joy the divinely-inspired',
  // Last Judgment / Meatfare
  'shalt come to earth with glory', 'when Thou, O God',
].join('|'), 'i');
function otherNames(text, expectedKey) {
  const found = new Set();
  for (const w of text.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/)) {
    if (w.length > 3 && /^[A-Z]/.test(w) && !DIVINE.has(w) && !NAME_STOP.has(w)) {
      const k = nameKey(w);
      if (k.length > 2 && k !== expectedKey) found.add(w);
    }
  }
  return [...found];
}

function ourStichera(cid) {
  const sql = `SELECT COALESCE(GROUP_CONCAT(text,' | '),'') FROM stichera
    WHERE commemoration_id=${cid} AND source!='lambertsen';`;
  return execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim();
}
function ourCount(cid) {
  const sql = `SELECT COUNT(*) FROM stichera WHERE commemoration_id=${cid} AND source!='lambertsen' AND "order">0;`;
  return parseInt(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }).trim(), 10);
}

const misattrib = [];
const shortfall = [];
let checked = 0;

for (const r of manifest) {
  if (!r.commemoration_id) continue;
  const name = primaryName(r.matchTitle || '');
  if (!name) continue;
  const parse = parseChapter(r.file, 'MenaionLambertsen' + MONTHS[r.month - 1]);
  const lamText = parse.sections.filter((s) => s.kind === 'lic-intro')
    .flatMap((s) => s.texts).join(' | ');
  if (!lamText) continue;
  const our = ourStichera(r.commemoration_id);
  if (!our) continue;
  checked++;

  const expectedKey = nameKey(name);
  // Primary, high-precision signal: our covered rows are a moveable-cycle
  // sticheron (Triodion/Pentecostarion) that a fixed-date saint can never have.
  if (GENERIC_RE.test(our)) {
    misattrib.push({ ...r, name, kind: 'generic-text', detail: (our.match(GENERIC_RE) || [''])[0], ourSample: our.slice(0, 80) });
    continue;
  }
  // Secondary, lower-confidence: our rows never name the saint but DO name
  // another personal name (only meaningful when the commemoration IS a single
  // named saint, not a feast/synaxis whose title has no personal name).
  const titleIsPerson = expectedKey && expectedKey.length > 2 && !/Synaxis|Meeting|Leavetaking|Veneration|Forefeast|Afterfeast|Translation|Uncovering|Council|Icon|Chains|Relics/i.test(r.matchTitle);
  const ourNamesExpected = new RegExp('\\b' + name + '\\w{0,3}\\b', 'i').test(our) ||
    our.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).map(nameKey).includes(expectedKey);
  if (titleIsPerson && !ourNamesExpected) {
    const others = otherNames(our, expectedKey).filter((w) => nameKey(w).length > 3);
    if (others.length) misattrib.push({ ...r, name, kind: 'names-other', detail: others.slice(0, 3).join(', '), ourSample: our.slice(0, 80) });
  }

  // coverage shortfall: Lambertsen materially fuller than our covered rows
  const lamN = parse.counts.licStichera;
  const ourN = ourCount(r.commemoration_id);
  if (lamN >= ourN + 3) shortfall.push({ ...r, name, ourN, lamN });
}

console.log(`\n=== Phase 6 QA cross-check — ${checked} covered commemorations audited vs Lambertsen ===\n`);

const named = misattrib.filter((m) => m.kind === 'names-other');
const generic = misattrib.filter((m) => m.kind === 'generic-text');
console.log(`## A. HIGH-CONFIDENCE — our covered rows are moveable-cycle (Triodion/`);
console.log(`   Pentecostarion) text, not the saint's proper: ${generic.length}`);
console.log(`   (Caveat: a saint whose fixed date lands in Bright Week / Great Lent may`);
console.log(`    legitimately blend such stichera — confirm before replacing.)\n`);
for (const m of generic.sort((a, b) => a.month - b.month || a.day - b.day)) {
  console.log(`  ${m.month}/${m.day}  cid ${m.commemoration_id}  "${m.matchTitle.slice(0, 44)}"  [${m.detail}]`);
  console.log(`      ${m.ourSample}...`);
}
console.log(`\n## B. LOWER-CONFIDENCE — our rows never name the saint but name another`);
console.log(`   proper noun (noisy: also catches sentence-initial words — eyeball each): ${named.length}\n`);
for (const m of named.sort((a, b) => a.month - b.month || a.day - b.day)) {
  console.log(`  ${m.month}/${m.day}  cid ${m.commemoration_id}  "${m.matchTitle.slice(0, 40)}"  expected "${m.name}", names: ${m.detail}`);
}

console.log(`\n## Coverage shortfall (Lambertsen has >=3 more LIC stichera than our covered rows): ${shortfall.length}\n`);
for (const s of shortfall.sort((a, b) => (b.lamN - b.ourN) - (a.lamN - a.ourN)).slice(0, 20)) {
  console.log(`  ${s.month}/${s.day}  cid ${s.commemoration_id}  ours ${s.ourN} vs Lambertsen ${s.lamN}  "${s.matchTitle.slice(0, 44)}"`);
}
