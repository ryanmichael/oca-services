#!/usr/bin/env node
'use strict';

// find-slot.js — given a text fragment, return the cascade slot(s) where it
// currently renders, plus all variant-library candidates that target that slot.
//
// Designed for the choir-correction workflow (see ~/.claude/skills/choir-
// correction/SKILL.md). The output schema is the data-architect-specified
// shape:
//
//   {
//     fragment:        "<the search string, trimmed>",
//     matches: [
//       {
//         cascadeKey:      "communion.koinonikon",
//         sourceLayer:     "base" | "library" | "overlay/<id>" | "octoechos" | "menaion-db" | "calendar-data",
//         filePath:        "fixed-texts/liturgy-fixed.json",
//         valuePreview:    "...first 200 chars...",
//         valueSha256:     "abcd…",
//         parishOverlayChain: ["oca", "sts-sluzhebnik"],   // overlays that override this key
//         candidateVariants: [
//           { id, label, _provenance, libraryFile }
//         ],
//         assemblerEmitter: { file, function, line } | null
//       }
//     ]
//   }
//
// Usage:
//   node scripts/find-slot.js "Of Thy Mystical Supper"
//   node scripts/find-slot.js --json "Of Thy Mystical Supper"
//   node scripts/find-slot.js --file path/to/fragment.txt
//
// Limitations:
// - DFS-based key resolution: we re-load each JSON file and look for leaf
//   strings containing the fragment. Works on the dotted-key cascade files
//   (fixed-texts/, translations/<id>/, variant-library/).
// - DB scan does a LIKE query on troparia + stichera; returns commemoration_id
//   and section, not a cascade path (these tables don't have one).
// - Assembler back-pointer is a grep against `server-lib/` + `assemblers/`
//   for the cascade key; not all slots are emitted via dotted-key lookups.

const fs    = require('fs');
const path  = require('path');
const cp    = require('child_process');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');

// --- args ---
const args = process.argv.slice(2);
let asJson = false;
let fileFlag = null;
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--json') asJson = true;
  else if (args[i] === '--file') fileFlag = args[++i];
  else positional.push(args[i]);
}

let fragment;
if (fileFlag) fragment = fs.readFileSync(fileFlag, 'utf8');
else fragment = positional.join(' ');
fragment = fragment.trim();
if (!fragment) {
  console.error('Usage: find-slot.js [--json] "<text fragment>"   or   find-slot.js --file fragment.txt');
  process.exit(1);
}

// Normalize whitespace for matching: collapse runs of WS to single space.
// We keep the original fragment for SHA / display; matching uses the normalized form.
function normWs(s) { return String(s).replace(/\s+/g, ' ').trim(); }
const needle = normWs(fragment);
const needleLower = needle.toLowerCase();

function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }
function preview(s, n = 200) {
  const str = typeof s === 'string' ? s : JSON.stringify(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

// --- DFS over a parsed JSON value, yielding { dottedPath, value, parent } for every leaf string ---
function* walkLeaves(node, dotted = []) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') {
    yield { dottedPath: dotted.join('.'), value: node };
    return;
  }
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkLeaves(node[i], [...dotted, String(i)]);
    return;
  }
  if (typeof node === 'object') {
    for (const k of Object.keys(node)) yield* walkLeaves(node[k], [...dotted, k]);
  }
}

// Walk and aggregate: when an object whose leaf strings contain the fragment,
// return the *object's* dotted path + the matching leaf path + the matched string.
function findInJsonFile(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch { return []; }
  if (!raw.toLowerCase().includes(needleLower)) return [];   // cheap pre-check
  let data;
  try { data = JSON.parse(raw); }
  catch { return [];}
  const hits = [];
  for (const leaf of walkLeaves(data)) {
    if (normWs(leaf.value).toLowerCase().includes(needleLower)) {
      hits.push(leaf);
    }
  }
  return hits;
}

// --- enumerate files in the cascade ---
function enumFiles() {
  const groups = {
    base:           [],   // fixed-texts/*.json (top level only)
    library:        [],   // fixed-texts/variant-library/*.json
    overlay:        [],   // fixed-texts/translations/<id>/*.json
    variableSource: []    // variable-sources/**/*.json
  };
  const fxRoot = path.join(ROOT, 'fixed-texts');
  for (const f of fs.readdirSync(fxRoot)) {
    const p = path.join(fxRoot, f);
    if (fs.statSync(p).isFile() && f.endsWith('.json')) groups.base.push(p);
  }
  const libDir = path.join(fxRoot, 'variant-library');
  if (fs.existsSync(libDir)) {
    for (const f of fs.readdirSync(libDir)) {
      if (f.endsWith('.json')) groups.library.push(path.join(libDir, f));
    }
  }
  const trDir = path.join(fxRoot, 'translations');
  if (fs.existsSync(trDir)) {
    for (const id of fs.readdirSync(trDir)) {
      const ov = path.join(trDir, id);
      if (!fs.statSync(ov).isDirectory()) continue;
      for (const f of fs.readdirSync(ov)) {
        if (f.endsWith('.json')) groups.overlay.push(path.join(ov, f));
      }
    }
  }
  // variable-sources: recurse, but skip giant dirs (orthocal-cache) and non-json
  const vsRoot = path.join(ROOT, 'variable-sources');
  function recurse(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (f === 'orthocal-cache' || f.startsWith('.')) continue;
        recurse(p);
      } else if (f.endsWith('.json')) {
        groups.variableSource.push(p);
      }
    }
  }
  if (fs.existsSync(vsRoot)) recurse(vsRoot);
  return groups;
}

// --- layer classification ---
function classifyLayer(file) {
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('fixed-texts/variant-library/')) return 'library';
  if (rel.startsWith('fixed-texts/translations/')) {
    const id = rel.split(path.sep)[2];
    return `overlay/${id}`;
  }
  if (rel.startsWith('fixed-texts/')) return 'base';
  if (rel.includes(`variable-sources${path.sep}calendar`)) return 'calendar-data';
  if (rel.includes(`octoechos`)) return 'octoechos';
  if (rel.includes(`menaion`)) return 'menaion-file';
  if (rel.includes(`triodion`)) return 'triodion';
  if (rel.includes(`pentecostarion`)) return 'pentecostarion';
  return 'variable-source';
}

// --- variant library: candidates for a given (service, cascadeKey) ---
function loadVariantLibrary() {
  const dir = path.join(ROOT, 'fixed-texts', 'variant-library');
  const entries = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { continue; }
    if (!data._target || !Array.isArray(data.variants)) continue;
    entries.push({ file: f, target: data._target, variants: data.variants });
  }
  return entries;
}

// Heuristic: a base file like `liturgy-fixed.json` corresponds to service `liturgy`.
function serviceFromBaseFile(file) {
  const base = path.basename(file).replace(/-fixed\.json$/, '');
  return base;
}

function variantCandidatesFor(serviceGuess, dottedPath, library) {
  return library
    .filter(e => (!serviceGuess || e.target.service === serviceGuess) && e.target.path === dottedPath)
    .flatMap(e => e.variants.map(v => ({
      id: v.id,
      label: v.label,
      _provenance: v._provenance || null,
      libraryFile: e.file,
      aliases: v.aliases || [],
      deprecated: !!v.deprecated
    })));
}

// --- assembler back-pointer (best-effort grep) ---
function findAssemblerEmitter(dottedPath) {
  if (!dottedPath) return null;
  // search for the last segment as a string literal in server-lib + assemblers
  const last = dottedPath.split('.').pop();
  if (!last || last.length < 3) return null;
  const dirs = [path.join(ROOT, 'server-lib'), path.join(ROOT, 'assemblers')]
    .filter(d => fs.existsSync(d));
  if (dirs.length === 0) return null;
  try {
    const out = cp.execFileSync('rg', [
      '--no-heading', '-n', '--max-count', '3',
      `['"\`]${last.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`,
      ...dirs
    ], { encoding: 'utf8' });
    const lines = out.trim().split('\n').filter(Boolean).slice(0, 3);
    return lines.map(l => {
      const [file, line, ...rest] = l.split(':');
      return { file: path.relative(ROOT, file), line: parseInt(line, 10), snippet: rest.join(':').trim().slice(0, 120) };
    });
  } catch { return null; }
}

// --- DB scan: troparia + stichera LIKE matches ---
function scanDb() {
  const dbPath = path.join(ROOT, 'storage', 'oca.db');
  if (!fs.existsSync(dbPath)) return [];
  function q(sql) {
    try {
      const raw = cp.execFileSync('sqlite3', ['-readonly', '-json', dbPath, sql], { encoding: 'utf8' });
      if (!raw.trim()) return [];
      return JSON.parse(raw);
    } catch { return []; }
  }
  const sqlNeedle = needle.replace(/'/g, "''");
  const tropRows = q(`SELECT id, commemoration_id, type, source, substr(text, 1, 200) AS preview, text FROM troparia WHERE text LIKE '%${sqlNeedle}%' LIMIT 20;`);
  const sticRows = q(`SELECT id, commemoration_id, section, "order" AS ord, source, substr(text, 1, 200) AS preview, text FROM stichera WHERE text LIKE '%${sqlNeedle}%' LIMIT 20;`);
  const out = [];
  for (const r of tropRows) {
    out.push({
      cascadeKey:      `troparia[${r.id}]`,
      sourceLayer:     `menaion-db (source=${r.source})`,
      filePath:        `storage/oca.db → troparia.id=${r.id} (commemoration=${r.commemoration_id}, type=${r.type})`,
      valuePreview:    preview(r.preview),
      valueSha256:     r.text ? sha256(r.text) : null,
      parishOverlayChain: [],
      candidateVariants: [],
      assemblerEmitter: null
    });
  }
  for (const r of sticRows) {
    out.push({
      cascadeKey:      `stichera[${r.id}]`,
      sourceLayer:     `menaion-db (source=${r.source})`,
      filePath:        `storage/oca.db → stichera.id=${r.id} (commemoration=${r.commemoration_id}, section=${r.section}, order=${r.ord})`,
      valuePreview:    preview(r.preview),
      valueSha256:     r.text ? sha256(r.text) : null,
      parishOverlayChain: [],
      candidateVariants: [],
      assemblerEmitter: null
    });
  }
  return out;
}

// --- main ---
function main() {
  const groups = enumFiles();
  const library = loadVariantLibrary();
  const allFiles = [...groups.base, ...groups.library, ...groups.overlay, ...groups.variableSource];

  const matches = [];
  for (const file of allFiles) {
    const hits = findInJsonFile(file);
    for (const h of hits) {
      const layer = classifyLayer(file);
      const rel   = path.relative(ROOT, file);
      let serviceGuess = null;
      if (layer === 'base') serviceGuess = serviceFromBaseFile(file);
      const candidates = variantCandidatesFor(serviceGuess, h.dottedPath, library);

      // For overlay layer, list other overlay dirs that override the same key.
      let overlayChain = [];
      if (layer === 'base' || layer.startsWith('overlay/')) {
        for (const ovFile of groups.overlay) {
          // does ovFile have the same dotted path with a non-empty leaf?
          try {
            const ov = JSON.parse(fs.readFileSync(ovFile, 'utf8'));
            const segs = h.dottedPath.split('.');
            let cur = ov;
            for (const s of segs) { if (cur && typeof cur === 'object' && s in cur) cur = cur[s]; else { cur = undefined; break; } }
            if (cur !== undefined) {
              const overlayId = path.relative(path.join(ROOT, 'fixed-texts', 'translations'), ovFile).split(path.sep)[0];
              if (!overlayChain.includes(overlayId)) overlayChain.push(overlayId);
            }
          } catch {}
        }
      }

      matches.push({
        cascadeKey:        h.dottedPath,
        sourceLayer:       layer,
        filePath:          rel,
        valuePreview:      preview(h.value),
        valueSha256:       sha256(h.value),
        parishOverlayChain: overlayChain,
        candidateVariants: candidates,
        assemblerEmitter:  findAssemblerEmitter(h.dottedPath)
      });
    }
  }

  // DB matches (no cascade key — flagged separately)
  matches.push(...scanDb());

  const result = { fragment: needle, fragmentSha256: sha256(needle), matchCount: matches.length, matches };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Pretty print
  console.log(`Fragment: "${preview(needle, 100)}"`);
  console.log(`SHA-256:  ${result.fragmentSha256}`);
  console.log(`Matches:  ${result.matchCount}\n`);
  for (const m of result.matches) {
    console.log(`── ${m.sourceLayer}`);
    console.log(`   ${m.filePath}`);
    if (m.cascadeKey) console.log(`   key: ${m.cascadeKey}`);
    if (m.valueSha256) console.log(`   sha: ${m.valueSha256.slice(0, 12)}…`);
    console.log(`   preview: ${m.valuePreview.replace(/\n/g, ' ⏎ ').slice(0, 160)}`);
    if (m.parishOverlayChain.length) {
      console.log(`   overlays overriding this key: ${m.parishOverlayChain.join(', ')}`);
    }
    if (m.candidateVariants.length) {
      console.log(`   variant library candidates (${m.candidateVariants.length}):`);
      for (const v of m.candidateVariants) {
        const flags = [v.deprecated ? 'deprecated' : null, v.aliases.length ? `aliases=[${v.aliases.join(',')}]` : null].filter(Boolean);
        console.log(`     • ${v.libraryFile} #${v.id}  — ${v.label}  ${flags.length ? '(' + flags.join('; ') + ')' : ''}`);
      }
    }
    if (m.assemblerEmitter && m.assemblerEmitter.length) {
      console.log(`   possible assembler emitters:`);
      for (const a of m.assemblerEmitter) console.log(`     • ${a.file}:${a.line}  ${a.snippet}`);
    }
    console.log('');
  }
}

main();
