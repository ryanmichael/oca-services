#!/usr/bin/env node
// Phase 3 importer: extract Lambertsen LIC stichera for gap-fillable chapters,
// attribute each sub-group to the right commemoration_id, emit INSERT SQL.
// Dry-run by default; writes SQL file for review. Never overwrites (dedup on
// commemorations that already have stichera).
//
// Usage: node import-menaion.js <monthNum>   (e.g. 4)  -> writes import-<m>.sql

const fs = require('fs');
const { execFileSync } = require('child_process');
const { parseChapter } = require('./parse-menaion.js');
const { insertPunctuationSpaces } = require('../../server-lib/parsers/normalize.js');
// Normalize source cosmetics before insert: the Lambertsen markdown occasionally
// glues punctuation to the next word ("Spirit—,we"). Reuse the same normalizer
// the differ/drift rules expect. Only affects [.,;:!?] glued to a letter.
const clean = (s) => insertPunctuationSpaces(String(s)).replace(/\s+/g, ' ').trim();

const DB = '/Users/ryanmurphy/claude-code/oca-services/storage/oca.db';
const MONTHS = ['January','February','March','April','May','June','July',
  'August','September','October','November','December'];
const monthNum = parseInt(process.argv[2] || '4', 10);
const monthDir = 'MenaionLambertsen' + MONTHS[monthNum - 1];
const manifest = require('./menaion-manifest.json')
  .filter((r) => r.month === monthNum && r.verdict === 'gap-fillable');

// ---- day commemorations (for attribution) ----------------------------
function dayCommems(month) {
  const sql = `SELECT json_group_array(json_object('id',c.id,'day',c.day,
    'title',c.title,'saint_type',c.saint_type,
    'n', (SELECT COUNT(*) FROM stichera s WHERE s.commemoration_id=c.id)))
    FROM commemorations c WHERE c.month=${month};`;
  const rows = JSON.parse(execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' }));
  const by = {};
  for (const r of rows) (by[r.day] ||= []).push(r);
  return by;
}

// ---- name matching (shared with audit) -------------------------------
function nameKey(t) {
  let s = t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  s = s.replace(/ph/g, 'f').replace(/th/g, 't').replace(/kh/g, 'h').replace(/k/g, 'c')
       .replace(/[yj]/g, 'i').replace(/v/g, 'b').replace(/z/g, 's').replace(/(.)\1+/g, '$1').replace(/s$/, '');
  return s;
}
const STOP = new Set('the of and with those them our new saint st holy venerable blessed father mother great bishop archbishop patriarch pope abbot confessor'.split(' '));
const keys = (s) => (s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length > 2 && !STOP.has(w)).map(nameKey).filter(Boolean);
function score(a, b) { const B = new Set(keys(b)); const ka = keys(a); return ka.filter((k) => B.has(k)).length / (Math.min(ka.length, B.size) || 1); }

const TYPE_WORD = { hierarch: 'hierarch', hieromartyr: 'hieromartyr', martyr: 'martyr',
  venerable: 'monastic', apostle: 'apostle', prophet: 'prophet', unmercenaries: 'unmercenaries' };

// ---- LIC sub-group + Glory extraction --------------------------------
function extractVespersLIC(parse) {
  // A chapter may print more than one Vespers service (daily/Little + Great).
  // Bucket the LIC groups by service so we never merge two services into one
  // over-collected import; then pick the fullest Vespers form (Great Vespers).
  const buckets = new Map();   // service label -> {groups, glory}
  const bucket = (svc) => {
    if (!buckets.has(svc)) buckets.set(svc, { groups: [], glory: null });
    return buckets.get(svc);
  };
  for (const s of parse.sections) {
    const svc = s.service || '';
    if (/MATINS|LITURGY/i.test(svc)) break;   // Vespers only
    if (s.kind === 'lic-intro') {
      const b = bucket(svc);
      b.groups.push({ tone: s.tone, label: s.label, disc: discriminator(s.label),
        texts: s.texts, continuation: !!s.continuation });
    } else if (s.kind === 'glory') {
      const b = bucket(svc);
      const combined = /Now\s*&?\s*ever|Now and ever/i.test(s.label);
      if (!b.glory && !combined && s.texts.length) b.glory = { tone: s.tone, text: s.texts[0] };
    }
  }
  // choose: prefer Great Vespers, else the bucket with the most stichera.
  const entries = [...buckets.entries()].filter(([, b]) => b.groups.length);
  if (!entries.length) return { groups: [], glory: null, sawPaschalLic: false, declared: null, menaionOwn: null };
  const total = (b) => b.groups.reduce((n, g) => n + g.texts.length, 0);
  const great = entries.find(([k]) => /great\s+vespers/i.test(k));
  const [, chosen] = great || entries.sort((a, b) => total(b[1]) - total(a[1]))[0];

  const groups = chosen.groups;
  const sawPaschalLic = groups.some((g) => /Pentecostarion/i.test(g.label));
  const opener = groups.find((g) => !g.continuation);
  let declared = null, menaionOwn = null;
  if (opener) {
    const m = opener.label.match(/(\d+)\s+sticher/i);
    declared = m ? parseInt(m[1], 10) : null;
    const split = opener.label.match(/(\d+)\s+from the Pentecostarion.*?(\d+)/i);
    menaionOwn = split ? parseInt(split[2], 10) : null;
  }
  return { groups, glory: chosen.glory, sawPaschalLic, declared, menaionOwn };
}
// A saint-splitting discriminator ("3 for Saint Joseph", "3 of the hieromartyr")
// only ever appears BEFORE the ", in Tone …: Spec. Mel." melody clause. Truncate
// there first so quoted melody incipits ("Joy of the ranks of heaven") can't leak.
const TYPE_RE = new RegExp('the\\s+(' + Object.keys(TYPE_WORD).join('|') + ')(?:\\s+one)?\\b', 'i');
function discriminator(label) {
  const head = label.split(/,?\s*in\s+Tone/i)[0];
  let m = head.match(/(?:for|of)\s+(Saint\s+[A-Z][\w.]+)/);
  if (m) return m[1].replace(/\s+/g, ' ').trim();
  m = head.match(TYPE_RE);
  if (m) return 'the ' + m[1].toLowerCase();
  return null;
}

// Map a type word to the phrase that marks a saint of that type in a title,
// then return the "&"/"and"-separated title part naming that saint.
const TYPE_TITLE_RE = {
  martyr: /(?<!hiero)martyr/i, hieromartyr: /hieromartyr/i,
  hierarch: /bishop|archbishop|metropolitan|patriarch|pope|hierarch/i,
  venerable: /venerable|abbot|abbess|\bmonk\b|\bnun\b|ascetic|hermit|father/i,
  apostle: /apostle|evangelist/i, prophet: /prophet/i, unmercenaries: /unmercenar/i,
};
function titlePartForType(fullTitle, typeWord) {
  const re = TYPE_TITLE_RE[typeWord];
  if (!re) return null;
  const parts = fullTitle.split(/\s*&\s*|\s+and\s+/i);
  return parts.find((p) => re.test(p)) || null;
}

// A LIC sub-group is either the saint's own stichera (import) or belongs to a
// co-celebrated feast/cycle that our other tracks supply (exclude). On blend
// days the two are printed in one LIC block: "3 of the forefeast ... And 5 of
// the righteous one".
//
// The group is FEAST only when its PRINTED stichera are *of* the feast. A rubric
// like "8 stichera: 3 from the Pentecostarion, and 5 for the apostle" prints the
// SAINT's stichera — the Pentecostarion ones are fetched from that book, not
// printed here — so "from the ..." must NOT trigger exclusion.
const FEAST_OF_RE = /(?:^|\b)(?:of|for)\s+the\s+(fore-?feast|after-?feast|feast|resurrection|cross|temple|day|dead|departed|Pentecostarion|Triodion|Octoechos)\b/i;
function groupRole(label) { return FEAST_OF_RE.test(label) ? 'feast' : 'saint'; }

// ---- attribution ------------------------------------------------------
function attributeChapter(ch, parse, commems) {
  const { groups, glory } = extractVespersLIC(parse);
  if (!groups.length) return { skip: 'no LIC groups' };

  // Keep only the saint's own stichera; feast/cycle stichera come from other
  // tracks and must never be imported onto the saint.
  const saintGroups = groups.filter((g) => groupRole(g.label) === 'saint');
  const isBlend = saintGroups.length < groups.length;
  if (!saintGroups.length) return { skip: 'no saint stichera in LIC (all feast/forefeast)' };

  // Gate on the saint's share. Lambertsen prints UNIQUE stichera, which may be
  // fewer than the rubric's slot count (repeats fill the rest), so accept
  // 0 < extracted <= declared; reject over-collection (extracted > declared),
  // which is the real error signal (e.g. two services merged).
  const saintDeclared = saintGroups.reduce((n, g) => {
    const m = g.label.match(/(\d+)\s+sticher/i); return n + (m ? parseInt(m[1], 10) : g.texts.length);
  }, 0);
  const saintExtracted = saintGroups.reduce((n, g) => n + g.texts.length, 0);
  if (!saintExtracted) return { skip: 'no saint stichera extracted' };
  if (saintExtracted > saintDeclared) return { skip: `over-collection: extracted ${saintExtracted} > declared ${saintDeclared} — needs review` };

  const withDisc = saintGroups.filter((g) => g.disc);
  const assignments = [];   // {cid, tone, label, texts}
  const principalCid = ch.commemoration_id;

  if (!withDisc.length) {
    // single saint: all saint groups -> principal
    for (const g of saintGroups) assignments.push({ cid: principalCid, tone: g.tone, label: isBlend ? 'the saint' : null, texts: g.texts });
  } else {
    // multi-saint: attribute each saint group by its discriminator
    for (const g of saintGroups) {
      let cid = principalCid, label = null;
      if (g.disc) {
        label = g.disc;
        if (/^Saint\s/i.test(g.disc)) {
          const name = g.disc.replace(/^Saint\s+/i, '');
          let best = null, bs = 0;
          for (const c of commems) { const sc = score(name, c.title); if (sc > bs) { bs = sc; best = c; } }
          if (bs >= 0.5 && best) cid = best.id; else return { skip: `unresolved sub-saint "${g.disc}" (best ${bs.toFixed(2)})` };
        } else {
          const tw = g.disc.replace(/^the\s+/i, '');
          const st = TYPE_WORD[tw];
          const cand = commems.filter((c) => c.saint_type === st && c.n === 0);
          if (cand.length === 1) { cid = cand[0].id; }
          else {
            // Ambiguous type: use the chapter title's named saint of this type
            // (e.g. "Prophet Malachi & Martyr Gordius" + "of the martyr" -> Gordius).
            const part = titlePartForType(ch.saint, tw);
            const pool = cand.length ? cand : commems;
            let best = null, bs = 0;
            if (part) for (const c of pool) { const sc = score(part, c.title); if (sc > bs) { bs = sc; best = c; } }
            if (bs >= 0.5 && best) cid = best.id;
            else return { skip: `ambiguous type "${g.disc}" (${cand.length} candidates)` };
          }
        }
      }
      assignments.push({ cid, tone: g.tone, label, texts: g.texts });
    }
  }
  return { assignments, glory, principalCid };
}

// ---- build rows -------------------------------------------------------
const commemsByDay = dayCommems(monthNum);
const existing = new Set();
{
  const sql = `SELECT DISTINCT commemoration_id FROM stichera;`;
  for (const r of JSON.parse(execFileSync('sqlite3', [DB, `SELECT json_group_array(commemoration_id) FROM (${sql.replace(/;$/, '')})`], { encoding: 'utf8' }))) existing.add(r);
}

const sqlLines = [];
const report = [];
let rowCount = 0;
const esc = (s) => s.replace(/'/g, "''");

for (const ch of manifest) {
  const parse = parseChapter(ch.file, monthDir);
  const res = attributeChapter(ch, parse, commemsByDay[ch.day] || []);
  if (res.skip) { report.push({ day: ch.day, saint: ch.saint, status: 'SKIP', note: res.skip }); continue; }

  // group assignments by cid to number orders per commemoration
  const byCid = {};
  for (const a of res.assignments) (byCid[a.cid] ||= []).push(a);

  const touched = [];
  for (const [cid, assigns] of Object.entries(byCid)) {
    const cidNum = parseInt(cid, 10);
    if (existing.has(cidNum)) { touched.push(`${cid}(SKIP-has-stichera)`); continue; }
    let order = 1;
    for (const a of assigns) {
      for (const text of a.texts) {
        sqlLines.push(`INSERT INTO stichera (commemoration_id,section,"order",tone,label,text,source,group_role) VALUES (${cid},'lordICall',${order},${a.tone || 'NULL'},${a.label ? `'${esc(clean(a.label))}'` : 'NULL'},'${esc(clean(text))}','lambertsen','saint');`);
        order++; rowCount++;
      }
    }
    // Glory doxastikon -> principal only
    if (res.glory && cidNum === res.principalCid) {
      sqlLines.push(`INSERT INTO stichera (commemoration_id,section,"order",tone,label,text,source,group_role) VALUES (${cid},'lordICall',0,${res.glory.tone || 'NULL'},'Glory','${esc(clean(res.glory.text))}','lambertsen','saint');`);
      rowCount++;
    }
    touched.push(`${cid}(+${order - 1}${res.glory && cidNum === res.principalCid ? '+Glory' : ''})`);
  }
  report.push({ day: ch.day, saint: ch.saint, status: 'IMPORT', note: touched.join(' ') });
}

// ---- output -----------------------------------------------------------
const sqlPath = __dirname + `/import-${monthNum}.sql`;
fs.writeFileSync(sqlPath, 'BEGIN;\n' + sqlLines.join('\n') + '\nCOMMIT;\n');

console.log(`\n=== ${monthDir} import (DRY RUN) ===\n`);
for (const r of report) {
  console.log(`${r.status === 'SKIP' ? '  ·' : '  ✓'} ${monthNum}/${String(r.day).padEnd(2)} ${r.saint.slice(0, 44).padEnd(44)} ${r.status}  ${r.note}`);
}
const imp = report.filter((r) => r.status === 'IMPORT').length;
const skip = report.filter((r) => r.status === 'SKIP').length;
console.log(`\n${imp} chapters -> ${rowCount} stichera rows;  ${skip} skipped (see notes).`);
console.log(`SQL written: ${sqlPath}`);
console.log(`Review it, then apply with:  sqlite3 ${DB} < ${sqlPath}`);
