#!/usr/bin/env node
'use strict';

// blast-radius.js — given a proposed correction, enumerate which parishes
// will render differently and which are shielded by a higher-precedence overlay.
//
// Called by the choir-correction skill before any text-base or structure
// commit (see .claude/skills/choir-correction/SKILL.md §Step 5). The skill
// must show the count to the user before "apply."
//
// Usage examples:
//   node scripts/blast-radius.js text-base --service liturgy --path pre-communion.prayer-chrysostom
//   node scripts/blast-radius.js text-overlay --parish st-john-damascus-tyler --service liturgy --path some.key
//   node scripts/blast-radius.js library-add --key cherubic-hymn --variant-id htm-2008
//   node scripts/blast-radius.js variant-pick --parish st-john-damascus-tyler --key cherubic-hymn
//   node scripts/blast-radius.js rubric-flag --parish st-john-damascus-tyler --flag confess_first
//   node scripts/blast-radius.js structure --assembler-step liturgy.litany-of-fervent-supplication
//   node scripts/blast-radius.js calendar-data --date 2026-03-07
//
// Output: human-readable report + structured JSON when --json is passed.

const fs   = require('fs');
const path = require('path');
const cp   = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB   = path.join(ROOT, 'storage', 'oca.db');

// --- arg parsing ---
const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: blast-radius.js <branch> [--flags...]');
  console.error('Branches: variant-pick | rubric-flag | text-overlay | library-add | text-base | structure | calendar-data');
  process.exit(1);
}
const branch = argv[0];
const flags = {};
let asJson = false;
for (let i = 1; i < argv.length; i++) {
  if (argv[i] === '--json') { asJson = true; continue; }
  if (argv[i].startsWith('--')) {
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else { flags[key] = next; i++; }
  }
}

// --- helpers ---
function loadParishes() {
  try {
    const raw = cp.execFileSync('sqlite3', ['-readonly', '-json', DB,
      'SELECT parish_id, name, jurisdiction, extends_chain, legacy_overlay_path FROM parish_settings;'],
      { encoding: 'utf8' });
    return raw.trim() ? JSON.parse(raw) : [];
  } catch { return []; }
}

function loadOverlayKeysFor(parishRow) {
  // For each overlay in parish's extends_chain, read its files and check which
  // top-level dotted keys are present. Returns array of { overlayId, service, files: {file: data} }.
  let chain = [];
  try { chain = JSON.parse(parishRow.extends_chain || '[]'); } catch { chain = []; }
  if (parishRow.legacy_overlay_path) chain.push(parishRow.legacy_overlay_path);
  const overlays = [];
  for (const id of chain) {
    const dir = path.join(ROOT, 'fixed-texts', 'translations', id);
    if (!fs.existsSync(dir)) continue;
    const files = {};
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || f === 'manifest.json') continue;
      try { files[f] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch {}
    }
    overlays.push({ overlayId: id, files });
  }
  return overlays;
}

function dottedHas(obj, dotted) {
  if (!obj || typeof obj !== 'object') return false;
  const segs = dotted.split('.');
  let cur = obj;
  for (const s of segs) {
    if (cur && typeof cur === 'object' && s in cur) cur = cur[s];
    else return false;
  }
  return cur !== undefined && cur !== null;
}

function inMemoryOverlayHas(parishId, service, dotted) {
  // The DB-driven in-memory overlay supplies derived hierarch/rubric keys.
  // For blast-radius purposes we don't enumerate every derived key; we just
  // note when the parish has any in-memory overlay present.
  try {
    const raw = cp.execFileSync('sqlite3', ['-readonly', '-json', DB,
      `SELECT primate_name, ruling_hierarch_name FROM parish_settings WHERE parish_id = '${parishId.replace(/'/g, "''")}';`],
      { encoding: 'utf8' });
    return raw.trim() ? JSON.parse(raw).length > 0 : false;
  } catch { return false; }
}

// --- branches ---
function loadVariantTargets() {
  // Map { service|path -> [{ libraryKey, variantId }] } for all library entries.
  const dir = path.join(ROOT, 'fixed-texts', 'variant-library');
  const map = {};
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch { continue; }
    if (!data._target) continue;
    const key = `${data._target.service}|${data._target.path}`;
    if (!map[key]) map[key] = [];
    map[key].push({ libraryKey: data.key, variants: (data.variants || []).map(v => v.id) });
  }
  return map;
}

function loadParishVariantPicks() {
  try {
    const raw = cp.execFileSync('sqlite3', ['-readonly', '-json', DB,
      'SELECT parish_id, variant_key, variant_id FROM parish_variant_picks;'],
      { encoding: 'utf8' });
    return raw.trim() ? JSON.parse(raw) : [];
  } catch { return []; }
}

function blastTextBase() {
  const service = flags.service;
  const dotted  = flags.path;
  if (!service || !dotted) throw new Error('text-base requires --service <name> --path <dotted.key>');
  const parishes = loadParishes();
  const variantTargets = loadVariantTargets();
  const picks = loadParishVariantPicks();
  const targetKey = `${service}|${dotted}`;
  const libraryKeysForSlot = (variantTargets[targetKey] || []).map(e => e.libraryKey);

  const result = { branch: 'text-base', target: { service, path: dotted }, parishes: [] };
  for (const p of parishes) {
    const overlays = loadOverlayKeysFor(p);
    const shieldedBy = [];
    for (const ov of overlays) {
      const fname = `${service}-fixed.json`;
      if (ov.files[fname] && dottedHas(ov.files[fname], dotted)) {
        shieldedBy.push(`overlay/${ov.overlayId}`);
      }
    }
    // Variant pick at this slot shields the parish from base edits via in-memory overlay.
    for (const pk of picks) {
      if (pk.parish_id === p.parish_id && libraryKeysForSlot.includes(pk.variant_key)) {
        shieldedBy.push(`variant-pick/${pk.variant_key}=${pk.variant_id}`);
      }
    }
    result.parishes.push({
      parishId: p.parish_id,
      name: p.name,
      jurisdiction: p.jurisdiction,
      shielded: shieldedBy.length > 0,
      shieldedBy
    });
  }
  result.summary = {
    totalParishes: parishes.length,
    affectedParishes: result.parishes.filter(p => !p.shielded).length,
    shieldedParishes: result.parishes.filter(p =>  p.shielded).length,
    note: 'A base-text edit also changes every overlay that does NOT override this key. All un-shielded parishes will render the new wording.'
  };
  return result;
}

function blastTextOverlay() {
  const parishId = flags.parish;
  const service  = flags.service;
  const dotted   = flags.path;
  if (!parishId) throw new Error('text-overlay requires --parish <id>');
  return {
    branch: 'text-overlay',
    target: { parishId, service, path: dotted },
    summary: { totalParishes: 1, affectedParishes: 1,
      note: 'Parish-scoped change. Only this parish renders differently; all other parishes are unaffected.' }
  };
}

function blastVariantPick() {
  const parishId = flags.parish;
  const key = flags.key;
  if (!parishId || !key) throw new Error('variant-pick requires --parish <id> --key <variant-key>');
  return {
    branch: 'variant-pick',
    target: { parishId, variantKey: key },
    summary: { totalParishes: 1, affectedParishes: 1,
      note: 'Single-row DB write. Reversible by changing the pick back.' }
  };
}

function blastRubricFlag() {
  const parishId = flags.parish;
  const flag = flags.flag;
  if (!parishId || !flag) throw new Error('rubric-flag requires --parish <id> --flag <name>');
  return {
    branch: 'rubric-flag',
    target: { parishId, flag },
    summary: { totalParishes: 1, affectedParishes: 1,
      note: 'Single-column DB write. Reversible by clearing the flag.' }
  };
}

function blastLibraryAdd() {
  const key = flags.key;
  const variantId = flags['variant-id'];
  if (!key || !variantId) throw new Error('library-add requires --key <library-key> --variant-id <new-id>');
  return {
    branch: 'library-add',
    target: { libraryKey: key, variantId },
    summary: { totalParishes: 0, affectedParishes: 0,
      note: 'Library-add is additive. No parish renders differently until a parish_variant_picks row is updated. Apply that separately.' }
  };
}

function blastStructure() {
  const step = flags['assembler-step'] || flags.target;
  if (!step) throw new Error('structure requires --assembler-step <name>');
  const parishes = loadParishes();
  return {
    branch: 'structure',
    target: { assemblerStep: step },
    parishes: parishes.map(p => ({ parishId: p.parish_id, name: p.name })),
    summary: {
      totalParishes: parishes.length,
      affectedParishes: parishes.length,
      note: 'Structural change in shared assembler. ALL parishes are affected on EVERY date that exercises this step. Snapshot diff across the Track D date matrix + Playwright e2e are mandatory before apply.'
    }
  };
}

function blastCalendarData() {
  const date = flags.date;
  if (!date) throw new Error('calendar-data requires --date YYYY-MM-DD');
  const parishes = loadParishes();
  return {
    branch: 'calendar-data',
    target: { date },
    parishes: parishes.map(p => ({ parishId: p.parish_id, name: p.name })),
    summary: {
      totalParishes: parishes.length,
      affectedParishes: parishes.length,
      note: 'Calendar/data change. All parishes render this date differently; other dates unaffected.'
    }
  };
}

const BRANCHES = {
  'text-base':     blastTextBase,
  'text-overlay':  blastTextOverlay,
  'variant-pick':  blastVariantPick,
  'rubric-flag':   blastRubricFlag,
  'library-add':   blastLibraryAdd,
  'structure':     blastStructure,
  'calendar-data': blastCalendarData,
};

// --- main ---
function main() {
  const fn = BRANCHES[branch];
  if (!fn) {
    console.error(`Unknown branch: ${branch}`);
    console.error(`Valid: ${Object.keys(BRANCHES).join(', ')}`);
    process.exit(1);
  }
  let result;
  try { result = fn(); }
  catch (e) { console.error(e.message); process.exit(2); }

  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  console.log(`Blast radius — branch: ${result.branch}`);
  console.log(`Target: ${JSON.stringify(result.target)}`);
  console.log('');
  console.log(`Affected parishes: ${result.summary.affectedParishes} / ${result.summary.totalParishes}`);
  if (result.parishes) {
    for (const p of result.parishes) {
      const tag = p.shielded ? `[shielded by ${p.shieldedBy.join(', ')}]` : '[AFFECTED]';
      console.log(`  ${tag.padEnd(30)} ${p.parishId}  — ${p.name || ''}`);
    }
  }
  console.log('');
  console.log(`Note: ${result.summary.note}`);
}

main();
