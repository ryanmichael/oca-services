#!/usr/bin/env node
'use strict';
// Build the parish Raphaela text layer:
//   variable-sources/parish-texts/raphaela-menaion.json
//   audit/reports/raphaela-parish-coverage.md
//
// A parish with rubric `menaion.textSource = "raphaela"` (St John of Damascus,
// Tyler — the choir sings Mother Raphaela's Menaion; memory
// feedback_tyler_match_connie) hears this translation in place of the base
// row wherever the corpus has the hymn. The base (OCA first) is unchanged for
// every other parish.
//
// Each entry has the exact shape of a parish variant pick with
// `_target.kind: "menaion"` (server-lib/sources/menaion-overrides.js), so it
// rides the same seam and the same guard: ADDRESSED BY POSITION (commemoration,
// section, order), VERIFIED BY CONTENT (sha256 of the base text it was built
// against). A re-authored base row detaches its entry instead of redirecting
// it — re-run this script and read the report.
//
// Pairing, per day, per section, over ALL of the day's rows (any source):
//   1. content: content-word Jaccard >= 0.30, beating the runner-up by >= 0.10,
//      tones agreeing, numbered<->numbered and Glory/Now<->Glory/Now (a Glory
//      and a Now may stand in for each other: Connie sang Raphaela's "Now" of
//      11-22 as the Glory). Greedy by score, one corpus hymn per row.
//   2. curated: reference/raphaela/parish-pairs.json, for days where the corpus
//      appoints DIFFERENT hymns from our base (11-22: Tone 1 "The virgins
//      bearing lamps" where the OCA/St Sergius set is Tone 8). Each pair is
//      backed by a packet the parish sang.
//
// Usage: node scripts/menaion-ingest/raphaela-parish-build.js [--check]
//   --check  exit 1 if the committed JSON differs from a fresh build.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');
const { parseDay } = require('./raphaela-parse.js');
const { parseVespers } = require('./raphaela-vespers-parse.js');

const ROOT    = path.resolve(__dirname, '..', '..');
const CORPUS  = path.join(ROOT, 'reference/raphaela/corpus/txt');
const PAIRS   = path.join(ROOT, 'reference/raphaela/parish-pairs.json');
const OUT     = path.join(ROOT, 'variable-sources/parish-texts/raphaela-menaion.json');
const REPORT  = path.join(ROOT, 'audit/reports/raphaela-parish-coverage.md');
const MONTHS  = 'January February March April May June July August September October November December'.split(' ');
const SECTIONS = ['lordICall', 'litya', 'aposticha'];

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const STOP = new Set('that with thou thee thine your yours have hath hast from unto they them their this what were wast when which whom into upon shall will been being also ever most more than thus then there where these those didst doth dost art thyself yourself himself herself itself through therefore whose while about after before against among because such very only same both'.split(' '));
const toks = (s) => new Set(String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/)
  .filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/(eth|est|ed|ing|s)$/, '')));
const jacc = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
const cleanText = (s) => {
  let t = String(s).split('\n')
    .map((l) => l.replace(/\/\/\s*/g, '').replace(/\s*\((Twice|Thrice|2x|3x)\)\s*$/i, '').replace(/\s+$/, ''))
    .filter((l) => l.trim()).join('\n').trim();
  // The corpus sometimes opens a quotation and never closes it (11-21
  // Aposticha: Anna's "Go, child," she said, "to Him Who gave you to me; …).
  // The words are complete — Connie's sheet prints the same — but the schema
  // gate reads an odd straight-quote count as a truncated scrape and refuses
  // to boot. Close it at the end of the hymn: typography only, no sung word.
  if ((t.match(/"/g) || []).length % 2 === 1) t += '"';
  return t;
};

function corpusFor(month, day) {
  const base = `${MONTHS[month - 1]} ${String(day).padStart(2, '0')}`;
  const files = [`${base}.txt`, `${base}b.txt`].filter((f) => fs.existsSync(path.join(CORPUS, f)));
  const hymns = { lordICall: [], litya: [], aposticha: [] };
  for (const f of files) {
    const txt = fs.readFileSync(path.join(CORPUS, f), 'utf8');
    const oldP = parseDay(txt), newP = parseVespers(txt);
    for (const sec of SECTIONS) {
      // The proven ordinary-layout parser wins where it reads the section; the
      // two-layout parser covers the feast layout and every Litya.
      const src = sec !== 'litya' && (oldP[sec] || []).length ? oldP[sec] : newP[sec];
      src.forEach((h, i) => {
        const text = cleanText(h.text);
        // "November 21" and "November 21b" repeat the same hymns; a copy would
        // tie with itself and fail the runner-up margin for every row.
        const norm = text.toLowerCase().replace(/[^a-z]/g, '');
        if (hymns[sec].some((x) => x.norm === norm)) return;
        hymns[sec].push({ file: f.replace(/\.txt$/, ''), idx: i, tone: h.tone ?? null, slot: h.slot ?? null,
          text, norm, tk: toks(h.text) });
      });
    }
  }
  return { files, hymns };
}

const slotCompatible = (row, h) => (row.ord >= 1 ? h.slot === null : h.slot !== null);

function build() {
  const db = new DatabaseSync(path.join(ROOT, 'storage/oca.db'), { readOnly: true });
  const curated = fs.existsSync(PAIRS) ? JSON.parse(fs.readFileSync(PAIRS, 'utf8')) : {};
  const comms = db.prepare(`SELECT id, month, day, title FROM commemorations ORDER BY month, day, id`).all();
  const rowsOf = db.prepare(`SELECT id, section, "order" AS ord, tone, text, source FROM stichera
                             WHERE commemoration_id = ? AND section IN ('lordICall','litya','aposticha')`);
  const byDay = new Map();
  for (const c of comms) {
    const rows = rowsOf.all(c.id);
    if (!rows.length) continue;
    const k = `${c.month}-${c.day}`;
    if (!byDay.has(k)) byDay.set(k, { month: c.month, day: c.day, rows: [] });
    for (const r of rows) byDay.get(k).rows.push({ ...r, comm: c });
  }

  const entries = [];
  const report = [];
  for (const [k, d] of [...byDay.entries()].sort((a, b) => a[1].month - b[1].month || a[1].day - b[1].day)) {
    const { files, hymns } = corpusFor(d.month, d.day);
    const stat = { day: k, files: files.join(', ') || '—', rows: d.rows.length, content: 0, curated: 0, unmatched: 0 };
    // A packet showed the parish singing the base text this day: no layer.
    if (curated[k]?.exclude) { stat.unmatched = d.rows.length; stat.files += ' (excluded: packet sings the base)'; report.push(stat); continue; }
    if (!files.length) { stat.unmatched = d.rows.length; report.push(stat); continue; }
    for (const sec of SECTIONS) {
      const rows = d.rows.filter((r) => r.section === sec);
      const cands = hymns[sec];
      const used = new Set(), done = new Set();
      const emit = (r, h, method, score) => {
        used.add(h.idx + '|' + h.file); done.add(r.id);
        entries.push({
          key: 'raphaela', variantId: `${h.file}#${sec}#${h.idx}`,
          target: {
            kind: 'menaion',
            commemoration: { month: d.month, day: d.day, title: r.comm.title },
            hymn: { table: 'stichera', section: sec, order: r.ord },
            expect: [sha256(r.text)],
          },
          value: { tone: h.tone ?? r.tone, text: h.text },
          _meta: { method, score: score == null ? null : +score.toFixed(2), baseId: r.id, baseSource: r.source },
        });
        stat[method]++;
      };
      // 2 (first, so a curated pair wins). Pairs name base row ids and a corpus
      // hymn by file + section index.
      for (const p of curated[k]?.[sec] || []) {
        const r = rows.find((x) => x.id === p.baseId);
        const h = cands.find((x) => x.file === p.file && x.idx === p.index);
        if (r && h) emit(r, h, 'curated', null);
        else report.push({ day: k, files: stat.files, problem: `curated pair ${JSON.stringify(p)} no longer resolves` });
      }
      // 1. content pairing, greedy by score with a per-row margin check.
      const scored = [];
      for (const r of rows) {
        if (done.has(r.id)) continue;
        const tk = toks(r.text);
        const s = cands.filter((h) => slotCompatible(r, h) && (r.tone == null || h.tone == null || r.tone === h.tone))
          .map((h) => ({ h, s: jacc(tk, h.tk) })).sort((a, b) => b.s - a.s);
        if (!s.length || s[0].s < 0.30) continue;
        if (s[1] && s[0].s - s[1].s < 0.10) continue;
        scored.push({ r, h: s[0].h, s: s[0].s });
      }
      scored.sort((a, b) => b.s - a.s);
      for (const { r, h, s } of scored) {
        if (done.has(r.id) || used.has(h.idx + '|' + h.file)) continue;
        emit(r, h, 'content', s);
      }
      stat.unmatched += rows.filter((r) => !done.has(r.id)).length;
    }
    report.push(stat);
  }
  db.close();
  return { entries, report };
}

function render({ entries, report }) {
  const json = {
    _meta: {
      description: 'Mother Raphaela Menaion text for parishes with rubric menaion.textSource = "raphaela". Generated by scripts/menaion-ingest/raphaela-parish-build.js — do not hand-edit; add curated pairs to reference/raphaela/parish-pairs.json and rebuild.',
      corpus: 'reference/raphaela/corpus/txt (choir site corpus, permission confirmed 2026-09-20)',
      register: 'yy — the corpus as printed; Connie prints it that way',
      entries: entries.length,
    },
    entries,
  };
  const days = report.filter((r) => r.rows);
  const tot = days.reduce((a, r) => ({ rows: a.rows + r.rows, content: a.content + r.content, curated: a.curated + r.curated, unmatched: a.unmatched + r.unmatched }), { rows: 0, content: 0, curated: 0, unmatched: 0 });
  const lines = [
    '# Raphaela parish text layer — coverage',
    '',
    'Generated by `scripts/menaion-ingest/raphaela-parish-build.js`. Rows are Menaion stichera (Lord I Call, Litya, Aposticha) in `oca.db`; a matched row renders the Raphaela text for a parish with `menaion.textSource = raphaela`, an unmatched row renders the base.',
    '',
    `**${tot.content + tot.curated} of ${tot.rows} rows** (${Math.round(100 * (tot.content + tot.curated) / tot.rows)}%) — content ${tot.content}, curated ${tot.curated}, unmatched ${tot.unmatched}; ${days.filter((r) => r.files === '—').length} days have no corpus file.`,
    '',
    ...report.filter((r) => r.problem).map((r) => `- ⚠️ ${r.day}: ${r.problem}`),
    '',
    '| day | corpus | rows | content | curated | unmatched |',
    '|---|---|---:|---:|---:|---:|',
    ...days.map((r) => `| ${r.day} | ${r.files} | ${r.rows} | ${r.content} | ${r.curated} | ${r.unmatched} |`),
    '',
  ];
  return { json: JSON.stringify(json, null, 1) + '\n', md: lines.join('\n') };
}

if (require.main === module) {
  const { json, md } = render(build());
  if (process.argv.includes('--check')) {
    const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (cur !== json) { console.error('raphaela-menaion.json is stale — run node scripts/menaion-ingest/raphaela-parish-build.js'); process.exit(1); }
    console.log('raphaela-menaion.json is current.');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, json);
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, md);
    console.log(md.split('\n').slice(0, 7).join('\n'));
  }
}

module.exports = { build, corpusFor };
