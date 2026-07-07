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
  // Collect lic-intro groups within the Vespers service (before AT MATINS).
  const groups = [];
  let glory = null, sawMatins = false, sawPaschalLic = false;
  for (const s of parse.sections) {
    if (s.service && /MATINS/i.test(s.service)) sawMatins = true;
    if (sawMatins) break;
    if (s.kind === 'lic-intro') {
      if (/Pentecostarion/i.test(s.label)) sawPaschalLic = true;
      const disc = discriminator(s.label);
      groups.push({ tone: s.tone, label: s.label, disc, texts: s.texts, continuation: !!s.continuation });
    } else if (s.kind === 'glory' && !glory) {
      // saint doxastikon only if it is NOT a combined "Glory…, Now & ever…"
      const combined = /Now\s*&?\s*ever|Now and ever/i.test(s.label);
      if (!combined && s.texts.length) glory = { tone: s.tone, text: s.texts[0] };
    }
  }
  // Declared LIC total comes from the opening (non-continuation) group's rubric.
  const opener = groups.find((g) => !g.continuation);
  let declared = null, menaionOwn = null;
  if (opener) {
    const m = opener.label.match(/(\d+)\s+sticher/i);
    declared = m ? parseInt(m[1], 10) : null;
    const split = opener.label.match(/(\d+)\s+from the Pentecostarion.*?(\d+)/i);
    menaionOwn = split ? parseInt(split[2], 10) : null;
  }
  return { groups, glory, sawPaschalLic, declared, menaionOwn };
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

// ---- attribution ------------------------------------------------------
function attributeChapter(ch, parse, commems) {
  const { groups, glory, sawPaschalLic, declared, menaionOwn } = extractVespersLIC(parse);
  if (!groups.length) return { skip: 'no LIC groups' };
  if (sawPaschalLic) return { skip: 'Paschal interleave (Pentecostarion stichera) — needs paschal handling' };

  // Under/over-fill gate: never silently import a count that disagrees with the
  // declared rubric. Allowed: exact, the "sung twice" case (declared == 2×), or
  // the Menaion's own share in an interleave. Anything else -> hold for review.
  const extracted = groups.reduce((n, g) => n + g.texts.length, 0);
  if (declared != null) {
    const ok = extracted === declared || extracted * 2 === declared || extracted === menaionOwn;
    if (!ok) return { skip: `count mismatch: declared ${declared}, extracted ${extracted} — needs review` };
  }

  const withDisc = groups.filter((g) => g.disc);
  const assignments = [];   // {cid, tone, label, texts}
  const principalCid = ch.commemoration_id;

  if (!withDisc.length) {
    // single saint: all groups -> principal
    for (const g of groups) assignments.push({ cid: principalCid, tone: g.tone, label: null, texts: g.texts });
  } else {
    // multi-saint: attribute each group by its discriminator
    for (const g of groups) {
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
          if (cand.length === 1) cid = cand[0].id;
          else return { skip: `ambiguous type "${g.disc}" (${cand.length} candidates)` };
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
        sqlLines.push(`INSERT INTO stichera (commemoration_id,section,"order",tone,label,text,source) VALUES (${cid},'lordICall',${order},${a.tone || 'NULL'},${a.label ? `'${esc(a.label)}'` : 'NULL'},'${esc(text)}','lambertsen');`);
        order++; rowCount++;
      }
    }
    // Glory doxastikon -> principal only
    if (res.glory && cidNum === res.principalCid) {
      sqlLines.push(`INSERT INTO stichera (commemoration_id,section,"order",tone,label,text,source) VALUES (${cid},'lordICall',0,${res.glory.tone || 'NULL'},'Glory','${esc(res.glory.text)}','lambertsen');`);
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
