/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing assembled Vespers services.
 * Uses calendar-rules.js + assembler.js + renderer.js to render
 * a full service (fixed + variable texts) for any date.
 *
 * For regular Saturdays in ordinary time, services are generated
 * automatically. For Lenten/special dates, hand-authored calendar
 * entries are used if available.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const fs   = require('fs');
const path = require('path');

const { assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours, assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins, assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy, assembleRoyalHours, assembleMatins, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
        isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay, isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
        getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday,
        getEothinon } = require('./calendar-rules');
const { renderService, renderVespers }             = require('./renderer');
const { getMatinsKathismata }                    = require('./kathisma');
const { deduplicateBySource }                    = require('./oca-psalter');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;

// ─── Data loading ─────────────────────────────────────────────────────────────

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

// ─── Translation overlay system ─────────────────────────────────────────────
// Each overlay lives at fixed-texts/translations/<id>/ and may contain any
// of the per-service fixed-text overrides:
//   - manifest.json              — { name, kind, jurisdiction, extends, description, … }
//   - liturgy-fixed.json         — sparse overrides for the Divine Liturgy
//   - presanctified-fixed.json   — sparse overrides for the Presanctified Liturgy
//   - vespers-fixed.json         — sparse overrides for Vespers
//   - …                          — one file per service type, optional
//
// Cascade per file: base → extends[0] → extends[1] → … → self. Only the keys
// that differ from the layer above need to be stored at each layer. Files an
// overlay doesn't supply are simply skipped (the base is used as-is).
//
// Selection priority: ?translation= query param > LITURGY_TRANSLATION env var
// > none (default texts).
const TRANSLATIONS_DIR = path.join(__dirname, 'fixed-texts', 'translations');
const translationCache = new Map();           // key: "<serviceFile>:<overlayId>" → merged result
const translationManifestCache = new Map();
const baseKeySetCache = new WeakMap();

// Registry of service-name → base fixed-text object. Populated as base files
// load below. `getOverlayFixed('liturgy', overlayId)` consults this to pick
// the right base to merge onto.
const fixedTextRegistry = {};
function registerBaseFixed(serviceName, baseObj) {
  fixedTextRegistry[serviceName] = baseObj;
}

function deepMergeOverlay(base, overlay) {
  if (overlay === null || overlay === undefined) return base;
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return overlay;
  if (typeof overlay !== 'object' || Array.isArray(overlay)) return overlay;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (k.startsWith('_')) continue;  // strip overlay-only metadata (_note, _source, etc.)
    out[k] = (k in base) ? deepMergeOverlay(base[k], v) : v;
  }
  return out;
}

function loadOverlayManifest(overlayId) {
  if (translationManifestCache.has(overlayId)) return translationManifestCache.get(overlayId);
  const manifestPath = path.join(TRANSLATIONS_DIR, overlayId, 'manifest.json');
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Translation '${overlayId}': manifest unreadable — ${err.message}`);
    // Backward-compat: overlays without a manifest are still loadable as flat.
  }
  translationManifestCache.set(overlayId, manifest);
  return manifest;
}

function loadOverlayData(overlayId, serviceName = 'liturgy') {
  const dataPath = path.join(TRANSLATIONS_DIR, overlayId, `${serviceName}-fixed.json`);
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn(`Translation '${overlayId}/${serviceName}': data file unreadable — ${err.message}`);
    return null;
  }
}

function listAvailableTranslations() {
  try {
    return fs.readdirSync(TRANSLATIONS_DIR, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('_'))
      .map(e => e.name);
  } catch {
    return [];
  }
}

// Allowed enum values for manifest schema validation.
const ALLOWED_KINDS = new Set(['tradition', 'parish', 'jurisdiction']);
const ALLOWED_JURISDICTIONS = new Set([
  'oca', 'rocor', 'antiochian', 'goa', 'serbian', 'romanian', 'bulgarian', 'georgian',
]);

/** Validates a manifest. Returns an array of human-readable warnings (empty = OK).
 *  All checks are non-fatal; loader handles defaults so the overlay still loads.
 *  Pass `allIds` (the set of existing overlay ids on disk) to validate extends refs. */
function validateManifest(id, manifest, allIds) {
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    warnings.push('manifest.json missing or unreadable');
    return warnings;
  }
  if (!manifest.name || typeof manifest.name !== 'string') {
    warnings.push("missing or non-string 'name' field");
  }
  if (!manifest.kind) {
    warnings.push("missing 'kind' field (defaulting to 'tradition')");
  } else if (!ALLOWED_KINDS.has(manifest.kind)) {
    warnings.push(`unknown kind '${manifest.kind}' (allowed: ${[...ALLOWED_KINDS].join(', ')})`);
  }
  if (manifest.jurisdiction != null) {
    if (typeof manifest.jurisdiction !== 'string') {
      warnings.push(`jurisdiction must be a string id or null, got ${typeof manifest.jurisdiction}`);
    } else if (!ALLOWED_JURISDICTIONS.has(manifest.jurisdiction)) {
      warnings.push(`unknown jurisdiction '${manifest.jurisdiction}' (allowed: ${[...ALLOWED_JURISDICTIONS].join(', ')}, or null)`);
    }
  }
  if (manifest.extends !== undefined) {
    if (!Array.isArray(manifest.extends)) {
      warnings.push("'extends' must be an array (use [] if no parents)");
    } else {
      manifest.extends.forEach((parent, i) => {
        if (typeof parent !== 'string') {
          warnings.push(`extends[${i}] must be a string id, got ${typeof parent}`);
        } else if (parent === id) {
          warnings.push(`extends[${i}] is self-reference '${parent}' (will be detected as cycle)`);
        } else if (allIds && !allIds.has(parent)) {
          warnings.push(`extends[${i}] '${parent}' is not a known overlay id`);
        }
      });
    }
  }
  return warnings;
}

function getTranslationManifests() {
  const ids = listAvailableTranslations();
  const idSet = new Set(ids);
  return ids.map(id => {
    const m = loadOverlayManifest(id) || {};
    const warnings = validateManifest(id, m, idSet);
    return {
      id,
      name: m.name || id,
      kind: m.kind || 'tradition',
      jurisdiction: m.jurisdiction ?? null,
      extends: Array.isArray(m.extends) ? m.extends : [],
      description: m.description || null,
      sources: m.sources || null,
      ...(warnings.length ? { warnings } : {}),
    };
  });
}

/** Validates all overlays at startup and logs any warnings. Called once
 *  at boot so misconfigured manifests surface in the server log immediately,
 *  not just when an end-user happens to load /api/translations. */
function validateAllTranslations() {
  const ids = listAvailableTranslations();
  const idSet = new Set(ids);
  let total = 0;
  for (const id of ids) {
    const m = loadOverlayManifest(id);
    const warnings = validateManifest(id, m, idSet);
    if (warnings.length) {
      total += warnings.length;
      for (const w of warnings) console.warn(`Translation manifest '${id}': ${w}`);
    }
  }
  if (total) console.warn(`Translation overlay validation: ${total} warning(s) across ${ids.length} overlay(s).`);
  else console.log(`Translation overlay validation: ${ids.length} overlay(s) OK.`);
}

/** Returns the set of leaf-text keys present anywhere in the base object.
 *  Used to flag overlay keys that don't correspond to any base key (likely a typo). */
function collectKeyPaths(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return out;
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_')) continue;
    const p = prefix ? `${prefix}.${k}` : k;
    out.add(p);
    collectKeyPaths(obj[k], p, out);
  }
  return out;
}

function warnUnknownKeys(overlayId, overlay, base, serviceName = 'liturgy') {
  let basePaths = baseKeySetCache.get(base);
  if (!basePaths) { basePaths = collectKeyPaths(base); baseKeySetCache.set(base, basePaths); }
  const stack = [['', overlay]];
  while (stack.length) {
    const [prefix, node] = stack.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    for (const k of Object.keys(node)) {
      if (k.startsWith('_')) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (!basePaths.has(p)) {
        console.warn(`Translation '${overlayId}/${serviceName}': key '${p}' not present in base ${serviceName}-fixed.json (silent drift?)`);
      } else {
        stack.push([p, node[k]]);
      }
    }
  }
}

/** Resolves an overlay's full extends chain depth-first, parents before children.
 *  Detects cycles. Returns the chain as an ordered list of ids (parents first,
 *  the requested id last). */
function resolveExtendsChain(overlayId, visited = new Set(), stack = new Set()) {
  if (!overlayId) return [];
  if (stack.has(overlayId)) {
    console.warn(`Translation '${overlayId}': circular extends chain (path: ${[...stack, overlayId].join(' → ')})`);
    return [];
  }
  if (visited.has(overlayId)) return [];  // already merged earlier in the walk
  visited.add(overlayId);
  stack.add(overlayId);
  const manifest = loadOverlayManifest(overlayId);
  const parents = Array.isArray(manifest?.extends) ? manifest.extends : [];
  const chain = [];
  for (const parent of parents) {
    chain.push(...resolveExtendsChain(parent, visited, stack));
  }
  chain.push(overlayId);
  stack.delete(overlayId);
  return chain;
}

/** Generalized overlay loader. Returns the base fixed-text for `serviceName`
 *  (e.g. 'liturgy', 'presanctified') with the named overlay's cascade applied.
 *  When no overlay is selected, returns the base unmodified. */
function getOverlayFixed(serviceName, overlayName) {
  const base = fixedTextRegistry[serviceName];
  if (!base) {
    console.warn(`Translation: no base registered for service '${serviceName}'`);
    return null;
  }
  if (!overlayName) return base;
  const cacheKey = `${serviceName}:${overlayName}`;
  if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);
  const chain = resolveExtendsChain(overlayName);
  let merged = base;
  for (const id of chain) {
    const overlay = loadOverlayData(id, serviceName);
    if (overlay) {
      warnUnknownKeys(id, overlay, base, serviceName);
      merged = deepMergeOverlay(merged, overlay);
    }
  }
  translationCache.set(cacheKey, merged);
  return merged;
}

/** Backward-compatible wrapper. Existing callers (and the four routes we've
 *  wired so far) keep working unchanged. New routes / callers can use
 *  getOverlayFixed directly. */
function getLiturgyFixed(overlayName) {
  return getOverlayFixed('liturgy', overlayName);
}

// ─── Overlay diff + provenance ──────────────────────────────────────────────
// For attribution: when an overlay overrides a string value, the resulting
// ServiceBlock should be tagged with `_overlay: "<id>"` so consumers (and
// devs debugging) can see exactly which blocks came from the active overlay.
//
// Approach: post-merge, walk both base and merged, collect the set of string
// values that exist in merged but not in base. After assembly, any block
// whose `text` is in that set gets the `_overlay` tag.

const overlayStringsCache = new Map();   // key: "<serviceFile>:<overlayId>" → Set<string>
const overlayDiffCache    = new Map();   // key: "<serviceFile>:<overlayId>" → diff array

function collectStringValues(obj, out = new Set()) {
  if (typeof obj === 'string') { out.add(obj); return out; }
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) { obj.forEach(v => collectStringValues(v, out)); return out; }
  for (const k of Object.keys(obj)) {
    if (k.startsWith('_')) continue;
    collectStringValues(obj[k], out);
  }
  return out;
}

/** Returns the set of string values introduced by the overlay (present in the
 *  merged result but not in the base). Used for block-level attribution. */
function getOverlayIntroducedStrings(serviceName, overlayId) {
  if (!overlayId) return null;
  const cacheKey = `${serviceName}:${overlayId}`;
  if (overlayStringsCache.has(cacheKey)) return overlayStringsCache.get(cacheKey);
  const base = fixedTextRegistry[serviceName];
  const merged = getOverlayFixed(serviceName, overlayId);
  if (!base || !merged) return null;
  const baseStrs = collectStringValues(base);
  const mergedStrs = collectStringValues(merged);
  const introduced = new Set();
  for (const s of mergedStrs) if (!baseStrs.has(s)) introduced.add(s);
  overlayStringsCache.set(cacheKey, introduced);
  return introduced;
}

/** Tags blocks whose text matches an overlay-introduced string with the
 *  overlay id. Mutates blocks in place; safe no-op when overlayId is null. */
function tagBlocksWithOverlay(blocks, serviceName, overlayId) {
  if (!overlayId || !Array.isArray(blocks)) return;
  const introduced = getOverlayIntroducedStrings(serviceName, overlayId);
  if (!introduced || introduced.size === 0) return;
  for (const b of blocks) {
    if (b && b.text && introduced.has(b.text)) b._overlay = overlayId;
  }
}

/** Returns the diff between base and merged for a given service+overlay.
 *  Each entry: { path: "dotted.key.path", base: "...", overlay: "..." }.
 *  Arrays are diffed wholesale (path points at the array, before/after are JSON-encoded). */
function diffOverlay(serviceName, overlayId) {
  if (!overlayId) return [];
  const cacheKey = `${serviceName}:${overlayId}`;
  if (overlayDiffCache.has(cacheKey)) return overlayDiffCache.get(cacheKey);
  const base = fixedTextRegistry[serviceName];
  const merged = getOverlayFixed(serviceName, overlayId);
  if (!base || !merged) return [];

  const diffs = [];
  function walk(prefix, b, m) {
    if (b === m) return;
    if (typeof b === 'string' || typeof m === 'string'
        || typeof b !== 'object' || typeof m !== 'object'
        || b === null || m === null
        || Array.isArray(b) !== Array.isArray(m)) {
      diffs.push({ path: prefix, base: b ?? null, overlay: m ?? null });
      return;
    }
    if (Array.isArray(b)) {
      if (JSON.stringify(b) !== JSON.stringify(m)) {
        diffs.push({ path: prefix, base: b, overlay: m });
      }
      return;
    }
    const keys = new Set([...Object.keys(b), ...Object.keys(m)]);
    for (const k of keys) {
      if (k.startsWith('_')) continue;
      const p = prefix ? `${prefix}.${k}` : k;
      if (!(k in b)) { diffs.push({ path: p, base: null, overlay: m[k] }); continue; }
      if (!(k in m)) { diffs.push({ path: p, base: b[k], overlay: null }); continue; }
      walk(p, b[k], m[k]);
    }
  }
  walk('', base, merged);

  overlayDiffCache.set(cacheKey, diffs);
  return diffs;
}

function resolveTranslation(query) {
  return query?.translation || process.env.LITURGY_TRANSLATION || null;
}

/** Recursively tag all hymn-like objects in a source tree with a provenance label. */
function tagProvenance(obj, label) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => tagProvenance(item, label)); return; }
  // Tag objects that look like hymns (have a 'text' property)
  if (obj.text && typeof obj.text === 'string' && !obj.provenance) obj.provenance = label;
  // Also tag hymns arrays
  if (obj.hymns) obj.hymns.forEach(h => { if (h && !h.provenance) h.provenance = label; });
  for (const v of Object.values(obj)) tagProvenance(v, label);
}

function loadSources() {
  const octoechos  = loadJSON('variable-sources/octoechos.json');
  const prokeimena = loadJSON('variable-sources/prokeimena.json');

  // Load all available menaion files
  const menaion = {};
  const menaionDir = path.join(__dirname, 'variable-sources', 'menaion');
  if (fs.existsSync(menaionDir)) {
    for (const file of fs.readdirSync(menaionDir).filter(f => f.endsWith('.json'))) {
      const key  = file.replace('.json', '');         // e.g. "march-07"
      const data = loadJSON(`variable-sources/menaion/${file}`);
      menaion[key] = data.vespers || data;
    }
  }

  // Load all available triodion files, keyed by each file's "key" field.
  // e.g. lent-soul-saturday-2.json has key "lent.soulSaturday2"
  //   → triodion.lent.soulSaturday2 = raw.vespers
  const triodion = {};
  const triodionDir = path.join(__dirname, 'variable-sources', 'triodion');
  if (fs.existsSync(triodionDir)) {
    for (const file of fs.readdirSync(triodionDir).filter(f => f.endsWith('.json'))) {
      const raw = loadJSON(`variable-sources/triodion/${file}`);
      const key = raw.key;
      if (!key) { console.warn(`triodion/${file}: missing "key" field, skipping`); continue; }
      // Navigate/create the nested path: "lent.soulSaturday2" → triodion.lent.soulSaturday2
      const parts = key.split('.');
      let cur = triodion;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] ??= {};
        cur = cur[parts[i]];
      }
      const sourceData = raw.vespers || raw;
      // Tag all hymn objects with provenance so dev-mode shows the publisher
      tagProvenance(sourceData, 'OCA');
      cur[parts[parts.length - 1]] = sourceData;
    }
  }

  // 'db' source is populated in Step 2; include empty object now so the
  // assembler doesn't warn on unresolved db: references in generated entries.
  // Load eothinon cycle data
  const eothinonPath = path.join(__dirname, 'variable-sources', 'eothinon.json');
  const eothinon = fs.existsSync(eothinonPath) ? loadJSON('variable-sources/eothinon.json') : {};

  return { octoechos, prokeimena, menaion, triodion, eothinon, db: {} };
}

/**
 * Returns a calendar entry for the date, or null if unavailable.
 * Priority:
 *   1. calendar-rules.js auto-generation (for supported seasons)
 *   2. Hand-authored calendar JSON (for Lenten/special dates)
 *
 * When both exist, the auto-generated entry is used as the base (vespers),
 * and any `liturgy` field from the hand-authored file is merged in.
 */
function getCalendarEntry(dateStr) {
  const calPath     = path.join(__dirname, 'variable-sources', 'calendar', `${dateStr}.json`);
  const handAuthored = fs.existsSync(calPath) ? loadJSON(`variable-sources/calendar/${dateStr}.json`) : null;

  const generated = generateCalendarEntry(dateStr);

  if (generated && handAuthored) {
    // Merge: auto-generated base + hand-authored liturgy (and commemorations if present)
    if (handAuthored.liturgy)         generated.liturgy         = handAuthored.liturgy;
    if (handAuthored.commemorations)  generated.commemorations  = handAuthored.commemorations;
    return generated;
  }

  return generated ?? handAuthored;
}

/**
 * Returns the next calendar date as a YYYY-MM-DD string.
 * Used for the Vespers date-shift: Vespers served on date X is liturgically
 * the first service of date X+1, so we look up the next day's calendar entry.
 */
function getNextDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// ─── Home page ────────────────────────────────────────────────────────────────

const HOME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    background: #f9f6f2;
    color: #1a1a1a;
    margin: 0;
    padding: 40px 20px;
    min-height: 100vh;
  }
  .layout {
    max-width: 860px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 36px 40px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin: 0 0 6px;
    text-align: center;
  }
  h2 {
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555;
    margin: 0 0 20px;
    text-align: center;
    border-bottom: 1px solid #e8e0d8;
    padding-bottom: 12px;
  }
  .subtitle {
    text-align: center;
    color: #666;
    font-size: 10pt;
    margin: 0 0 28px;
  }
  label {
    display: block;
    font-size: 9.5pt;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 5px;
  }
  input[type=date], select {
    width: 100%;
    font-family: inherit;
    font-size: 12pt;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    color: #1a1a1a;
    margin-bottom: 16px;
    cursor: pointer;
  }
  .pronoun-group {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }
  .pronoun-group label {
    flex: 1;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11pt;
    font-weight: normal;
    cursor: pointer;
    margin: 0;
  }
  .pronoun-group input { margin-right: 6px; }
  button {
    width: 100%;
    padding: 11px;
    background: #8b1a1a;
    color: #fff;
    font-family: inherit;
    font-size: 11.5pt;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover { background: #a02020; }
  .note {
    font-size: 9pt;
    color: #888;
    margin-top: 16px;
    font-style: italic;
    text-align: center;
  }
  .date-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 480px;
    overflow-y: auto;
  }
  .date-list li { border-bottom: 1px solid #f0ebe4; }
  .date-list li:last-child { border-bottom: none; }
  .date-list a {
    display: block;
    padding: 8px 4px;
    color: #1a1a1a;
    text-decoration: none;
    font-size: 11pt;
  }
  .date-list a:hover { background: #faf7f4; color: #8b1a1a; }
  .date-list .badge {
    float: right;
    font-size: 8.5pt;
    color: #999;
    font-style: italic;
  }
`;

function renderHomePage(collectedDates) {
  // Build list of collected dates (from DB, grouped)
  const byDate = {};
  for (const { date, pronoun } of collectedDates) {
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(pronoun);
  }

  const listItems = Object.keys(byDate).sort().map(d => {
    const p = byDate[d].includes('tt') ? 'tt' : byDate[d][0];
    return `<li><a href="/service?date=${d}&pronoun=${p}">${formatDate(d)} <span class="badge">collected</span></a></li>`;
  }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OCA Service Texts</title>
  <style>${HOME_CSS}</style>
</head>
<body>
  <div class="layout">

    <div class="card">
      <h1>Great Vespers</h1>
      <p class="subtitle">Enter any date to view the assembled service</p>

      <form method="GET" action="/service">
        <label for="date-input">Date</label>
        <input type="date" id="date-input" name="date" value="2026-09-26" required />

        <label>Pronouns</label>
        <div class="pronoun-group">
          <label><input type="radio" name="pronoun" value="tt" checked /> Thee / Thy</label>
          <label><input type="radio" name="pronoun" value="yy" /> You / Your</label>
        </div>

        <button type="submit">View Service</button>
      </form>

      <p class="note">
        Regular Saturdays in ordinary time are generated automatically.<br />
        Other dates require a hand-authored calendar file.
      </p>
    </div>

    <div class="card">
      <h2>Collected Dates</h2>
      <ul class="date-list">
        ${listItems || '<li style="padding:8px;color:#999;">No dates collected yet.</li>'}
      </ul>
    </div>

  </div>
</body>
</html>`;
}

// ─── Error / info pages ───────────────────────────────────────────────────────

/**
 * Converts a raw {source, key} warning from assembler.js into a human-readable message.
 * Returns null if the warning is minor/expected and shouldn't be shown.
 */
function formatAssemblyWarning(source, key) {
  const k = key || '';

  if (source === 'octoechos') {
    // Extract tone number
    const toneMatch = k.match(/^tone(\d)/);
    const toneNum = toneMatch ? toneMatch[1] : '?';

    if (k.includes('lordICall.martyrs')) {
      return `Martyrs stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.departedGlory')) {
      return `Doxastichon "For the Departed" at Lord, I Have Cried (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.resurrectional')) {
      return `Resurrectional stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('dogmatikon')) {
      return `Dogmatikon (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('aposticha')) {
      return `Aposticha stichera (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('troparion')) {
      return `Resurrectional troparion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('dismissalTheotokion')) {
      return `Dismissal theotokion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    return `Octoechos Tone ${toneNum} data is incomplete (${k}).`;
  }

  if (source === 'triodion') {
    if (k.includes('lordICall')) return `Lord, I Have Cried stichera from the Triodion are missing (${k}).`;
    if (k.includes('aposticha')) return `Aposticha stichera from the Triodion are missing (${k}).`;
    if (k.includes('troparia')) return `Troparia from the Triodion are missing (${k}).`;
    return `Triodion texts are missing (${k}).`;
  }

  if (source === 'menaion') {
    if (k.includes('lordICall')) return `Menaion Lord, I Have Cried stichera are not available for this date.`;
    if (k.includes('troparion')) return `Menaion troparion is not available for this date.`;
    return `Menaion texts are not available for this date (${k}).`;
  }

  if (source === 'prokeimena') {
    return `Evening prokeimenon text is missing (${k}).`;
  }

  // 'db' source is the SQLite Lenten/Pentecostarion DB — suppress from user-facing banners
  // (the server handles these separately via its own coverage checks)
  if (source === 'db') return null;

  return `Missing liturgical text: ${source} → ${k}`;
}

function renderErrorPage(message, detail = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — OCA Service Texts</title>
  <style>
    body { font-family: Georgia, serif; padding: 60px; color: #1a1a1a; max-width: 640px; margin: 0 auto; }
    h1 { color: #8b1a1a; font-size: 16pt; }
    p { font-size: 12pt; line-height: 1.6; }
    a { color: #8b1a1a; }
    .detail { font-size: 10.5pt; color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>Service Unavailable</h1>
  <p>${escHtml(message)}</p>
  ${detail ? `<p class="detail">${escHtml(detail)}</p>` : ''}
  <p><a href="/">← Back</a></p>
</body>
</html>`;
}

/**
 * Renders blocks as a standalone HTML service sheet with back-bar and warnings.
 * Used by all service routes when format=html is requested.
 */
function renderServiceHTML(res, blocks, title, date, pronoun) {
  const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
  const html = renderService(blocks, { title, date: `${date}${pronounLabel}` });
  const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
  const rawWarnings = blocks._warnings || [];
  const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
  const uniqueWarnings = [...new Set(warningMessages)];
  const warningBanner = uniqueWarnings.length > 0
    ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
         <strong>⚠ Some portions of this service are incomplete:</strong>
         <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
       </div>`
    : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace('<body>', '<body>' + backBar + warningBanner));
}

// ─── Menaion DB helpers ───────────────────────────────────────────────────────

/**
 * Returns the primary commemoration for a day — the first one that has a
 * troparion, which corresponds to the highest-ranking saint on the OCA page
 * (they are listed in descending rank order).
 */
function getMenaionPrimary(month, day) {
  const comms = getMenaionDay(month, day);
  if (!comms) return null;
  return comms.find(c => c.troparia.some(t => t.type === 'troparion')) ?? null;
}

/**
 * Returns all Lord I Call stichera for a given month/day from oca.db.
 * Shape: [{ commemoration, stichera: [{ order, tone, label, text }] }]
 */
function getSticheraDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.id, c.title, c.rank,
             s."order", s.section, s.tone, s.label, s.text
      FROM stichera s
      JOIN commemorations c ON c.id = s.commemoration_id
      WHERE c.month = ? AND c.day = ?
      ORDER BY c.id, s.section, s."order"
    `).all(month, day);
    if (rows.length === 0) return null;
    const byComm = {};
    for (const row of rows) {
      if (!byComm[row.id]) {
        byComm[row.id] = { id: row.id, title: row.title, rank: row.rank, stichera: [] };
      }
      byComm[row.id].stichera.push({
        section: row.section,
        order:   row.order,
        tone:    row.tone,
        label:   row.label,
        text:    row.text,
      });
    }
    return Object.values(byComm);
  } catch (err) {
    console.error('getSticheraDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Returns ranked Menaion data for service assembly.
 * Single DB call combining commemorations + troparia + stichera.
 *
 * Returns:
 *   {
 *     principal:    { id, title, tone, rank, troparia, stichera, hasTroparion, hasStichera }
 *     sticheraComm: same shape | null   — the commemoration that owns stichera
 *     notable:      [...same shape]     — all comms with troparia, sorted by id (= OCA priority)
 *     all:          [...same shape]     — all comms for the day
 *   }
 *
 * principal = stichera-saint (if any, and it has a troparion), else first notable by id.
 * This ensures the saint OCA published stichera for is treated as the primary, even
 * when a moveable feast (Triodion/Pentecostarion) sits at a lower id.
 */
function getMenaionRanked(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    const comms = db.prepare(`
      SELECT id, title, rank, tone, saint_type FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;

    const ids          = comms.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');

    const tropRows = db.prepare(
      `SELECT commemoration_id, type, tone, text, pronoun
       FROM troparia WHERE commemoration_id IN (${placeholders})`
    ).all(...ids);

    const stRows = db.prepare(
      `SELECT commemoration_id, "order", section, tone, label, text, source AS dbSource
       FROM stichera WHERE commemoration_id IN (${placeholders})
       ORDER BY commemoration_id, section, "order"`
    ).all(...ids);

    const tropariaMap  = {};
    const sticheraMap  = {};
    for (const t of tropRows) {
      (tropariaMap[t.commemoration_id] ??= []).push(t);
    }
    for (const s of stRows) {
      (sticheraMap[s.commemoration_id] ??= []).push({
        order: s.order, section: s.section, tone: s.tone, label: s.label, text: s.text,
        dbSource: s.dbSource,
      });
    }
    // Prefer OCA source when multiple translations exist for the same slot
    for (const [commId, stichera] of Object.entries(sticheraMap)) {
      sticheraMap[commId] = deduplicateBySource(
        stichera,
        s => `${s.section}:${s.order}`,
        'dbSource'
      );
    }

    const enriched = comms.map(c => ({
      id:           c.id,
      title:        c.title,
      rank:         c.rank,
      tone:         c.tone,
      saint_type:   c.saint_type,
      troparia:     tropariaMap[c.id] ?? [],
      stichera:     sticheraMap[c.id] ?? [],
      hasTroparion: (tropariaMap[c.id] ?? []).some(t => t.type === 'troparion'),
      hasStichera:  !!(sticheraMap[c.id]?.length),
    }));

    const sticheraSaint = enriched.find(c => c.hasStichera && c.hasTroparion)
                       ?? enriched.find(c => c.hasStichera);
    const firstNotable  = enriched.find(c => c.hasTroparion);
    const principal     = sticheraSaint ?? firstNotable ?? enriched[0] ?? null;
    const sticheraComm  = enriched.find(c => c.hasStichera) ?? null;
    const notable       = enriched.filter(c => c.hasTroparion);

    return { principal, sticheraComm, notable, all: enriched };
  } catch (err) {
    console.error('getMenaionRanked error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

// ─── General Menaion fallback ────────────────────────────────────────────────

/**
 * Extracts a short name from a commemoration title for (name) substitution.
 * "Hieromartyr Silvanus of Gaza" → "Silvanus"
 * "Venerable Seraphim, Wonderworker of Sarov" → "Seraphim"
 */
function extractShortName(title) {
  let name = title
    // Strip rank prefixes
    .replace(/^(Holy,?\s*Glorious\s+)?/i, '')
    .replace(/^(Saint|Venerable|Hieromartyr|Hieromartyrs?|Martyr|Martyrs|Great[- ]Martyr|New Martyr|Virgin Martyr|Maiden Martyr|Monastic Martyr|Nun Martyr|Prophet|Apostle|Apostles|Blessed|Righteous)\s+/i, '')
    .replace(/^(Holy|Glorious|Great|New)\s+/i, '');
  // Strip "of Location", "at Location", "in Location", "near Location" suffixes
  name = name.replace(/\s+(?:of|at|in|near)\s+.*$/i, '');
  // Strip parenthetical and comma suffixes
  name = name.replace(/\s*\(.*$/, '');
  name = name.replace(/,\s+.*$/, '');
  return name.trim() || title;
}

/**
 * Fallback mapping for saint types that don't have their own General Menaion PDF
 * to a type that does.
 */
const GENERAL_MENAION_FALLBACK = {
  'hieromartyrs': 'hieromartyr',   // plural → singular as fallback
  'hierarchs':    'hierarch',
  'monastics':    'monastic',
  'monasticMartyrs': 'monasticMartyr',
  'maidenMartyrs':   'maidenMartyr',
  'nuns':            'nun',
  'apostles':        'apostle',
};

/**
 * Fetches General Menaion texts for a given saint type, substituting
 * the (name) placeholder with the actual saint's name.
 *
 * Returns stichera-compatible rows or null if none found.
 */
function getGeneralMenaionTexts(saintType, title) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    // Try exact type, then fallback
    const types = [saintType];
    if (GENERAL_MENAION_FALLBACK[saintType]) types.push(GENERAL_MENAION_FALLBACK[saintType]);

    for (const type of types) {
      const rows = db.prepare(`
        SELECT saint_type, section, "order", tone, label, verse, text
        FROM general_menaion WHERE saint_type = ?
        ORDER BY section, "order"
      `).all(type);

      if (rows.length > 0) {
        const shortName = extractShortName(title);
        const sub = t => t.replace(/\(name(?:\s+of\s+the\s+event\/Icon)?\)/gi, shortName);
        return rows.map(r => ({
          order:    r.order,
          section:  r.section,
          tone:     r.tone,
          label:    r.label,
          text:     sub(r.text),
          verse:    r.verse ? sub(r.verse) : null,
          dbSource: 'stSergius-general',
        }));
      }
    }
    return null;
  } catch (err) {
    console.error('getGeneralMenaionTexts error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Lightweight version for the /api/days list — returns only titles.
 * Avoids loading full troparia/stichera text for every day in the view.
 *
 * Returns: { principal: string, commemorations: string[] } | null
 */
function getMenaionDayList(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.title
      FROM commemorations c
      JOIN troparia t ON t.commemoration_id = c.id
      WHERE c.month = ? AND c.day = ? AND t.type = 'troparion'
      GROUP BY c.id
      ORDER BY c.id
    `).all(month, day);
    if (rows.length === 0) return null;
    return { principal: rows[0].title, commemorations: rows.map(r => r.title) };
  } catch { return null; }
  finally { db?.close(); }
}

/**
 * Returns all commemorations + troparia for a given month/day from oca.db.
 * Shape: [{ id, title, rank, tone, troparia: [{ type, tone, text }] }, …]
 */
function getMenaionDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const comms = db.prepare(`
      SELECT id, title, rank, tone FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;
    const getTroparia = db.prepare(`
      SELECT type, tone, text, pronoun FROM troparia
      WHERE commemoration_id = ? ORDER BY type
    `);
    return comms.map(c => ({
      id:       c.id,
      title:    c.title,
      rank:     c.rank,
      tone:     c.tone,
      troparia: getTroparia.all(c.id),
    }));
  } catch (err) {
    console.error('getMenaionDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

// ─── DB helpers (for home page date list) ────────────────────────────────────

// ─── DB helpers ───────────────────────────────────────────────────────────────

const SECTION_LABELS = {
  lordICall : 'Lord, I Have Cried',
  aposticha : 'Aposticha',
  troparia  : 'Troparia',
  litya     : 'Litya',
  epistle   : 'Epistle',
  gospel    : 'Gospel',
};
const SECTION_ORDER = ['lordICall', 'aposticha', 'troparia', 'litya', 'epistle', 'gospel'];

function openDb() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'storage', 'oca.db');
  if (!fs.existsSync(dbPath)) return null;
  return new DatabaseSync(dbPath, { readonly: true });
}

function openDbWrite() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(__dirname, 'storage', 'oca.db');
  if (!fs.existsSync(dbPath)) return null;
  return new DatabaseSync(dbPath);
}

// ─── Orthocal API cache ───────────────────────────────────────────────────────

function ensureOrthocalCacheTable() {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.exec(`CREATE TABLE IF NOT EXISTS orthocal_cache (
      date       TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
  } catch (err) {
    console.error('Failed to create orthocal_cache table:', err.message);
  }
}

function getOrthocalCache(dateStr) {
  try {
    const db = openDb();
    if (!db) return null;
    const row = db.prepare('SELECT data FROM orthocal_cache WHERE date = ?').get(dateStr);
    return row ? JSON.parse(row.data) : null;
  } catch { return null; }
}

function setOrthocalCache(dateStr, data) {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.prepare(
      'INSERT OR REPLACE INTO orthocal_cache (date, data, fetched_at) VALUES (?, ?, ?)'
    ).run(dateStr, JSON.stringify(data), new Date().toISOString());
  } catch (err) {
    console.error('Orthocal cache write error:', err.message);
  }
}

async function fetchOrthocalDay(dateStr) {
  const cached = getOrthocalCache(dateStr);
  if (cached) return cached;

  const [year, month, day] = dateStr.split('-').map(Number);
  const url = `https://orthocal.info/api/gregorian/${year}/${month}/${day}/`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Orthocal API ${res.status} for ${dateStr}`);
  const data = await res.json();

  setOrthocalCache(dateStr, data);
  return data;
}

/**
 * Build Beatitudes troparia array for the Liturgy Third Antiphon.
 * On Sundays: 8 troparia from Octoechos Canon of the Resurrection (Odes 3+6).
 * Each item has { tone, label, source, text }.
 */
function buildBeatitudesTroparia(isSunday, tone, srcs) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;
  if (!beatData) return [];

  const troparia = [];
  const src = 'octoechos';

  // Ode 3: irmos, troparion1, troparion2, theotokion
  if (beatData.ode3) {
    const o = beatData.ode3;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 3', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 3', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 3', source: src, text: o.theotokion });
  }

  // Ode 6: irmos, troparion1, troparion2, theotokion
  if (beatData.ode6) {
    const o = beatData.ode6;
    if (o.irmos)      troparia.push({ tone, label: 'Irmos of Ode 6', source: src, text: o.irmos });
    if (o.troparia?.[0]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[0] });
    if (o.troparia?.[1]) troparia.push({ tone, label: 'Troparion of Ode 6', source: src, text: o.troparia[1] });
    if (o.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 6', source: src, text: o.theotokion });
  }

  return troparia;
}

// ─── Great Feast Variants ─────────────────────────────────────────────────────
// Liturgy variants for each Great Feast — antiphons, troparia/kontakia,
// prokeimenon, alleluia, entrance hymn, megalynarion, communion hymn.
// Data lives in variable-sources/great-feast-variants.json; keys match
// getGreatFeastKey() return values.
const GREAT_FEAST_VARIANTS = loadJSON('variable-sources/great-feast-variants.json');
delete GREAT_FEAST_VARIANTS._meta;

// ─── Pentecostarion Sunday Overrides ──────────────────────────────────────────
// Feast-only Liturgy propers (troparia/kontakia/ikos/prokeimenon/alleluia/
// communion hymn) for each Pentecostarion Sunday. Keyed by days-since-Pascha
// (7=Antipascha, 14=Myrrhbearers, …, 49=Pentecost). JSON keys are strings,
// but JS object indexing works with the numeric daysSincePascha.
const PENTECOSTARION_SUNDAY_OVERRIDES = loadJSON('variable-sources/pentecostarion-sunday-overrides.json');
delete PENTECOSTARION_SUNDAY_OVERRIDES._meta;

/**
 * Builds a liturgy spec object from orthocal.info API data.
 * Used when no hand-authored liturgy key exists for the date.
 *
 * Provides: variant, entrance hymn, epistle (with full text), gospel (with full text),
 *           megalynarion, communion hymn, dismissal (with day-of-week patron),
 *           troparia/kontakia from Octoechos + Menaion DB.
 * Deferred:  (none — all major sections now populated for ordinary Sundays).
 */
// ─── Matins Spec Builder ──────────────────────────────────────────────────────

/**
 * Builds the matins spec for a given date from available menaion data.
 * Currently supports:
 *   - Fixed-calendar Great Feasts with menaion matins data (e.g. Annunciation)
 *
 * Returns null if no matins data is available for the date.
 */

/**
 * Build Sunday Matins spec from Octoechos data.
 * Sundays always use the Great Doxology path and have a Gospel.
 */
function _loadFestalMatins(feastKey, season, dow, tone) {
  const festalPath = path.join(__dirname, 'variable-sources', 'festal-matins', `${feastKey}.json`);
  if (!fs.existsSync(festalPath)) return null;

  const data = loadJSON(`variable-sources/festal-matins/${feastKey}.json`);
  const isSunday = dow === 'sunday';

  const spec = {
    isSunday,
    feastRank: data.feastRank || 'greatFeast',
    feastType: data.feastType || null,
    tone: data.tone || (data.troparion && data.troparion.tone) || tone || 1,
    useSmallDoxology: false,
    // Great feasts follow the Sunday kathisma layout (2+3) regardless of weekday.
    kathismaCount: 2,
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion: data.sedalion || [],
  };

  if (data.troparion)              spec.troparion              = data.troparion;
  if (data.magnification)          spec.magnification          = data.magnification;
  if (data.prokeimenon)            spec.prokeimenon            = data.prokeimenon;
  if (data.gospel)                 spec.gospel                 = data.gospel;
  if (data.postGospelSticheron)    spec.postGospelSticheron    = data.postGospelSticheron;
  if (data.canon)                  spec.canon                  = data.canon;
  if (data.exapostilaria)          spec.exapostilaria          = data.exapostilaria;
  if (data.exapostilarion)         spec.exapostilarion         = data.exapostilarion;
  if (data.lauds)                  spec.lauds                  = data.lauds;
  if (data.troparionAfterDoxology) spec.troparionAfterDoxology = data.troparionAfterDoxology;
  if (data.finalTroparion)         spec.finalTroparion         = data.finalTroparion;
  if (data.venerationStichera)     spec.venerationStichera     = data.venerationStichera;
  if (data.isGreatFeastOfLord != null) spec.isGreatFeastOfLord = data.isGreatFeastOfLord;
  if (data.includeHavingBeheld != null) spec.includeHavingBeheld = data.includeHavingBeheld;

  return spec;
}

function _buildGreatFeastMatinsStub(feastKey, season, date) {
  const variant = GREAT_FEAST_VARIANTS[feastKey];
  if (!variant) return null;

  const trop = variant.troparia?.[0];
  const kont = variant.kontakia?.[0];

  const spec = {
    isSunday: true,
    feastRank: 'greatFeast',
    feastType: variant.type || null,
    tone: trop?.tone || kont?.tone || 1,
    useSmallDoxology: false,
    kathismaCount: 2,
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion: [],
    _stub: true,
    _stubNote: `Festal Matins propers for ${variant.label} are a known content gap; serving troparion + kontakion only.`,
  };

  if (trop) spec.troparion = { text: trop.text, tone: trop.tone, label: variant.label };
  if (kont) spec.kontakion = { text: kont.text, tone: kont.tone, label: variant.label };
  if (variant.prokeimenon) spec.prokeimenon = variant.prokeimenon;

  if (spec.troparion) spec.finalTroparion = spec.troparion;

  return spec;
}

function _buildSundayMatinsFromOctoechos(tone, season, menaionData, date) {
  const tk = `tone${tone}`;
  const oct = sources.octoechos[tk];
  if (!oct?.sunday?.matins) return null;

  const matins = oct.sunday.matins;
  const vespers = oct.saturday?.vespers;

  // ── Resurrectional troparion (from Saturday Vespers data) ──────────────
  const troparionRaw = vespers?.troparion;
  const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;

  // ── Sessional hymns → sedalion array ──────────────────────────────────
  // The assembler expects spec.sedalion[0] = after K2, spec.sedalion[1] = after K3
  const sedalion = [];
  if (matins.sessionalHymns?.afterKathisma2?.[0]) {
    const h = matins.sessionalHymns.afterKathisma2[0];
    sedalion[0] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }
  if (matins.sessionalHymns?.afterKathisma3?.[0]) {
    const h = matins.sessionalHymns.afterKathisma3[0];
    sedalion[1] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }

  // ── Antiphons of Degrees ──────────────────────────────────────────────
  // Combine all antiphon troparia into one text block
  let antiphonsText = '';
  if (matins.antiphonsOfDegrees) {
    const parts = [];
    matins.antiphonsOfDegrees.forEach((ant, i) => {
      parts.push(`Antiphon ${i + 1}`);
      ant.troparia.forEach(t => parts.push(t));
    });
    antiphonsText = parts.join('\n\n');
  }

  // ── Prokeimenon ───────────────────────────────────────────────────────
  const prokeimenon = matins.prokeimenon ? {
    refrain: matins.prokeimenon.refrain,
    verse: matins.prokeimenon.verse,
    tone,
  } : null;

  // ── Canon irmoi + troparia → canon spec ──────────────────────────────
  const canonSpec = { tone };
  if (matins.canonIrmoi) {
    for (const [odeStr, irmosText] of Object.entries(matins.canonIrmoi)) {
      canonSpec[`ode${odeStr}`] = { irmos: irmosText };
    }
  }
  if (matins.canonTroparia) {
    for (const [odeStr, troparia] of Object.entries(matins.canonTroparia)) {
      const odeKey = `ode${odeStr}`;
      if (!canonSpec[odeKey]) canonSpec[odeKey] = {};
      canonSpec[odeKey].troparia = troparia;
    }
  }
  // Kontakion from Octoechos (resurrectional)
  const kontakionRaw = vespers?.kontakion || oct.sunday?.liturgy?.kontakion;
  if (kontakionRaw) {
    canonSpec.kontakion = typeof kontakionRaw === 'object'
      ? kontakionRaw : { text: kontakionRaw, tone };
  }

  const matinsSource = matins._source || 'oca-parma-stsergius';

  // ── Post-Gospel sticheron ─────────────────────────────────────────────
  const postGospelSticheron = matins.postGospelSticheron ? {
    text: matins.postGospelSticheron,
    tone: 6, // always Tone 6
    source: 'octoechos',
    _source: matinsSource,
  } : null;

  // ── Lauds stichera ───────────────────────────────────────────────────
  const lauds = matins.laudsStichera ? {
    read: false,
    tone,
    stichera: matins.laudsStichera.map(s => ({
      text: s.text,
      verse: s.verse,
      tone,
    })),
  } : null;

  // ── Build spec ────────────────────────────────────────────────────────
  const spec = {
    isSunday: true,
    feastRank: null,
    tone,
    useSmallDoxology: false,
    kathismaCount: 2, // Sundays: Kathisma 2 and 3 (17th read separately at Vigil)
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion,
  };

  if (troparionText) {
    spec.troparion = { text: troparionText, tone };
  }

  if (antiphonsText) {
    spec.antiphons = { text: antiphonsText, tone, _source: matinsSource };
  }

  if (prokeimenon) {
    prokeimenon._source = matinsSource;
    spec.prokeimenon = prokeimenon;
  }

  // ── Eothinon cycle (Gospel, Exapostilarion, Doxastikon) ────────────────
  const eothinonNum = date ? getEothinon(date) : null;
  const eothinonData = eothinonNum ? sources.eothinon?.[String(eothinonNum)] : null;

  if (eothinonData) {
    spec.gospel = {
      reading: eothinonData.gospel.reading,
      text: null, // Scripture text not yet sourced
      source: 'eothinon',
      _eothinon: eothinonNum,
      _source: eothinonData._source,
    };

    // Exapostilarion + theotokion
    spec.exapostilaria = [
      {
        text: eothinonData.exapostilarion,
        tone: eothinonData.tone,
        label: `Eothinon ${eothinonNum}`,
        source: 'eothinon',
        _source: eothinonData._source,
      },
      ...(eothinonData.theotokion ? [{
        text: eothinonData.theotokion,
        tone: eothinonData.tone,
        label: 'Theotokion',
        source: 'eothinon',
        _source: eothinonData._source,
      }] : []),
    ];

    // Post-Gospel sticheron is tone-6 fixed (from Octoechos), not eothinon-specific
    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }

    // Lauds doxastikon (the eothinon sticheron sung after "Glory..." at Lauds)
    if (lauds && eothinonData.doxastikon) {
      lauds.doxastikon = {
        text: eothinonData.doxastikon,
        tone: eothinonData.tone,
        author: `Eothinon ${eothinonNum}`,
        _source: eothinonData._source,
      };
    }
  } else {
    // No eothinon data (Triodion period or missing data)
    spec.gospel = {
      reading: eothinonNum
        ? `[Eothinon ${eothinonNum} — data not loaded]`
        : '[Sunday Matins Gospel — Eothinon suspended during Triodion]',
      text: null,
      source: 'eothinon',
    };

    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }
  }

  spec.canon = canonSpec;

  if (lauds) {
    spec.lauds = lauds;
  }

  return spec;
}

function buildMatinsSpec(dateStr, date, dow, season, tone) {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const mm = String(mo).padStart(2, '0');
  const dd = String(dy).padStart(2, '0');

  // ── Check for great feast menaion data ──────────────────────────────────
  const feastKey = getGreatFeastKey(date);
  const monthNames = ['', 'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const menaionKey = `${monthNames[mo]}-${dd}`;
  const menaionPath = path.join(__dirname, 'variable-sources', 'menaion', `${menaionKey}.json`);

  let menaionData = null;
  if (fs.existsSync(menaionPath)) {
    menaionData = loadJSON(`variable-sources/menaion/${menaionKey}.json`);
  }

  const isSunday = dow === 'sunday';
  const isLent = season === 'greatLent';
  const isLentenWeekday = isLent && !isSunday && dow !== 'saturday';

  // ── Holy Week / Bright Week: no regular Matins ─────────────────────────
  // Mon–Sat of Holy Week have special services (Bridegroom, Passion Gospels,
  // Lamentations). Bright Week has Paschal Matins/Hours.
  // Palm Sunday keeps regular Sunday Matins (with festal content).
  if ((season === 'holyWeek' && !isSunday) || season === 'brightWeek') return null;

  // ── Moveable-feast / weekday festal matins (Pentecost, Ascension, …) ────
  // Tried first so that a feast falling on a weekday gets full festal
  // propers rather than the DB-injected weekday stub below.
  if (feastKey && (!menaionData || !menaionData.matins)) {
    const festalSpec = _loadFestalMatins(feastKey, season, dow, tone);
    if (festalSpec) return festalSpec;
  }

  // ── Sunday Matins from Octoechos ──────────────────────────────────────────
  if (isSunday && (!menaionData || !menaionData.matins)) {
    const sundaySpec = _buildSundayMatinsFromOctoechos(tone, season, menaionData, date);
    if (sundaySpec) return sundaySpec;

    // Octoechos returned null and no festal matins data — fall back to a
    // minimal stub from GREAT_FEAST_VARIANTS so the service is at least
    // browsable; this signals a content gap rather than a 404.
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]) {
      return _buildGreatFeastMatinsStub(feastKey, season, date);
    }
    return null;
  }

  // ── Weekday/Saturday Matins (no menaion matins data) ────────────────────
  // Build a minimal spec with fixed content + Menaion DB troparion/kontakion
  if (!menaionData || !menaionData.matins) {
    const kathNums = getMatinsKathismata(dow, season);
    const menaionRanked = getMenaionRanked(mo, dy);
    const principal = menaionRanked?.principal;

    const spec = {
      isSunday: false,
      feastRank: null,
      tone,
      alleluia: isLentenWeekday,
      useSmallDoxology: true,
      kathismaCount: kathNums.length || 2,
      kathismaNumbers: kathNums,
    };

    // Troparion from Menaion DB
    if (principal?.hasTroparion) {
      const trop = principal.troparia.find(t => t.type === 'troparion');
      if (trop) {
        spec.troparion = { text: trop.text, tone: trop.tone, label: principal.title };
      }
    }

    // Kontakion from Menaion DB (placed after Ode 6 if we have a canon stub)
    if (principal) {
      const kont = principal.troparia.find(t => t.type === 'kontakion');
      if (kont) {
        spec.kontakion = { text: kont.text, tone: kont.tone, label: principal.title };
      }
    }

    // Final troparion for small doxology path
    if (spec.troparion) {
      spec.finalTroparion = spec.troparion;
    }

    return spec;
  }

  const mat = menaionData.matins;

  // ── Determine doxology type ─────────────────────────────────────────────
  // During Lent on weekdays, even great feasts use the Small (read) Doxology
  const useSmallDoxology = isLentenWeekday;

  // ── Build the spec ──────────────────────────────────────────────────────
  const spec = {
    isSunday,
    feastRank: menaionData._meta?.feastRank || (feastKey ? 'greatFeast' : null),
    feastType: menaionData._meta?.feastType || null,
    tone: menaionData._meta?.tone || tone,
    alleluia: false, // great feasts override Lenten Alleluia
    useSmallDoxology,
  };

  // Troparion
  if (menaionData.troparion) {
    spec.troparion = menaionData.troparion;
  }

  // Kathismata
  const kathNums = getMatinsKathismata(dow, season);
  spec.kathismaCount = kathNums.length || (isSunday ? 3 : 2);
  spec.kathismaNumbers = kathNums;

  // Magnification (at Polyeleios)
  if (mat.magnification) {
    spec.magnification = mat.magnification;
  }

  // Prokeimenon
  if (mat.prokeimenon) {
    spec.prokeimenon = mat.prokeimenon;
  }

  // Gospel
  if (mat.gospel) {
    spec.gospel = mat.gospel;
  }

  // Post-Gospel sticheron
  if (mat.postGospelSticheron) {
    spec.postGospelSticheron = mat.postGospelSticheron;
  }

  // Sessional hymns after Kathismata (rendered at the kathisma reading points)
  if (mat.sedalion) {
    spec.sedalion = mat.sedalion;
  }

  // Canon
  if (mat.canon) {
    const canonSpec = {
      tone: mat.canon.tone || spec.tone,
      author: mat.canon.author,
    };
    // Copy ode data + every canon-level field (metadata, skipMagnificat,
    // sedalenAfterOde3, etc.). `tone`/`author` are already set above.
    for (const [k, v] of Object.entries(mat.canon)) {
      if (k === 'tone' || k === 'author') continue;
      canonSpec[k] = v;
    }
    // Sessional hymns after Ode 3 (matins-level overrides canon-level)
    if (mat.sessionalHymns) {
      canonSpec.sedalenAfterOde3 = mat.sessionalHymns;
    } else if (mat.sedalen) {
      canonSpec.sedalenAfterOde3 = mat.sedalen;
    }
    // Kontakion/ikos (placed inside canon spec so they appear after Ode 6).
    // Prefer the matins-canon kontakion if present (festal-specific text);
    // otherwise fall back to the top-level menaion kontakion.
    if (mat.canon.kontakion) {
      canonSpec.kontakion = mat.canon.kontakion;
    } else if (menaionData.kontakion) {
      canonSpec.kontakion = menaionData.kontakion;
    }
    // Skip Magnificat on great feasts that have their own Ode 9 megalynarion
    if (mat.canon.ode9?.megalynarion) {
      canonSpec.skipMagnificat = true;
    }
    spec.canon = canonSpec;
  }

  // Exapostilaria (array or singular with `repeat: N`)
  if (mat.exapostilaria) {
    spec.exapostilaria = mat.exapostilaria;
  } else if (mat.exapostilarion) {
    spec.exapostilarion = mat.exapostilarion;
  }

  // Festal troparion after the Great Doxology (overrides Sunday default)
  if (mat.troparionAfterDoxology) {
    spec.troparionAfterDoxology = mat.troparionAfterDoxology;
  }

  // Veneration stichera (Elevation procession after the Great Doxology, etc.)
  if (mat.venerationStichera) {
    spec.venerationStichera = mat.venerationStichera;
  }

  // Flags forwarded from the festal matins data
  if (mat._meta?.feastRank)        spec.feastRank        = mat._meta.feastRank;
  if (mat._meta?.feastType)        spec.feastType        = mat._meta.feastType;
  if (mat.isGreatFeastOfLord != null) spec.isGreatFeastOfLord = mat.isGreatFeastOfLord;
  if (mat.includeHavingBeheld != null) spec.includeHavingBeheld = mat.includeHavingBeheld;

  // Lauds
  if (mat.lauds) {
    spec.lauds = {
      read: isLentenWeekday, // read on Lenten weekdays, sung otherwise
      tone: mat.lauds.stichera?.[0]?.tone || spec.tone,
      stichera: mat.lauds.stichera,
      doxastikon: mat.lauds.doxastikon,
    };
  }

  // Aposticha (Lenten weekday only)
  if (isLentenWeekday && mat.aposticha) {
    spec.aposticha = mat.aposticha;
  }

  // Final troparion (for aposticha path)
  if (useSmallDoxology && menaionData.troparion) {
    spec.finalTroparion = menaionData.troparion;
  }

  return spec;
}

function buildLiturgyFromOrthocal(orthocalData, dateStr, srcs) {
  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const date    = new Date(Date.UTC(yr, mo - 1, dy));
  const dow     = getDayOfWeek(date);
  const tone    = getTone(date);
  const variant = getLiturgyVariant(date);
  const isBasil  = variant === 'basil';
  const isSunday = dow === 'sunday';
  const tk       = `tone${tone}`;

  // ── Paschal period detection ────────────────────────────────────────────────
  // "Christ is risen" opening, Paschal megalynarion, and "We Have Seen" replacement
  // apply from Pascha through the Leavetaking (Wed before Ascension = Pascha + 38).
  const pascha = calculatePascha(date.getUTCFullYear());
  const DAY = 86400000;
  const daysSincePascha = Math.round((date - pascha) / DAY);
  const isPaschalPeriod = daysSincePascha >= 0 && daysSincePascha <= 38;
  // Ascension (Pascha+39) through Apodosis of Ascension (Friday before Pentecost = Pascha+47).
  // During this period the Troparion of the Ascension replaces "We have seen the true Light"
  // and is used as the seasonal Theotokos magnification at the dismissal.
  // Source: OCA Department of Liturgical Music & Translations service text (2026-0521-tt.docx).
  const isAscensionAfterfeast = daysSincePascha >= 39 && daysSincePascha <= 47;
  // Pentecost (Pascha+49) through Apodosis of Pentecost (Saturday after Pentecost = Pascha+55).
  // Same substitution rule as Ascension afterfeast: "We have seen the true Light" is replaced
  // by the Troparion of Pentecost. Pascha+48 is the Saturday of Souls before Pentecost — a
  // memorial day, not part of the feast window. Pascha+56 is All Saints Sunday.
  const isPentecostAfterfeast = daysSincePascha >= 49 && daysSincePascha <= 55;

  // Pentecostarion Sunday overrides (defined at module scope, see top).
  const pentOverride = isSunday ? PENTECOSTARION_SUNDAY_OVERRIDES[daysSincePascha] : null;

  // ── Co-celebrated saints overlay ────────────────────────────────────────────
  // For dates where a major fixed-calendar commemoration falls on a Great Feast,
  // OCA's published "combined" service appends a secondary set of propers:
  // troparion + kontakion (before the feast kontakion), 2nd prokeimenon,
  // 2nd epistle/alleluia/gospel, 2nd communion hymn.
  // Source: OCA Department of Liturgical Music & Translations service texts.
  const COCELEBRATED_OVERLAYS = {
    // May 21: Sts. Constantine and Helen co-celebrated with Ascension
    '5-21': {
      troparion: {
        tone: 8,
        rubric: 'Troparion of Sts. Constantine and Helen, Tone 8:',
        text: 'Thy servant Constantine, O Lord and only Lover of man,\nbeheld the figure of the Cross in the heavens.\nLike Paul, not having received his call from men,\nbut as an apostle among rulers set by Thy hand over the royal city,\nhe preserved lasting peace through the prayers of the Theotokos.',
      },
      kontakion: {
        tone: 3,
        rubric: 'Kontakion of Sts. Constantine and Helen, Tone 3:',
        connector: 'Glory to the Father, and to the Son, and to the Holy Spirit.',
        text: 'Today Constantine and his mother Helen reveal the precious Cross,\nthe weapon of Orthodox Christians against their enemies,\nfor it is manifest for us as a great and fearful sign in struggle.',
      },
      prokeimenon: {
        tone: 8,
        label: 'Sts. Constantine and Helen',
        refrain: 'Their proclamation has gone out into all the earth, and their words to the ends of the universe.',
      },
      alleluia: {
        tone: 1,
        label: 'Sts. Constantine and Helen',
        verses: ['I have exalted one chosen out of My people.'],
      },
      communionHymn: {
        label: 'Sts. Constantine and Helen',
        text: 'Their proclamation has gone out into all the earth, and their words to the ends of the universe. Alleluia, Alleluia, Alleluia!',
      },
      // Second readings for epistle and gospel are pulled automatically from
      // orthocal's readings[] array when present (Acts 26:1-5,12-20; John 10:1-9).
    },
  };
  const dateKey = `${mo}-${dy}`;
  const overlay = COCELEBRATED_OVERLAYS[dateKey] || null;

  // ── Scripture readings from the API ──────────────────────────────────────────
  const readings   = orthocalData.readings || [];
  const epistleAll = readings.filter(r => r.source === 'Epistle');
  const gospelAll  = readings.filter(r => r.source === 'Gospel');
  const epistleR   = epistleAll[0];
  const gospelR    = gospelAll[0];
  const epistleR2  = epistleAll[1] || null;
  const gospelR2   = gospelAll[1] || null;

  // orthocal returns the generic book name "Apostol" for all epistles; the
  // actual book lives in the display field (e.g. "Acts 16.16-34",
  // "Romans 6.18-23"). Derive a proper liturgical announcement from it.
  //   Acts → "the Acts of the Holy Apostles"
  //   Pauline → "the Epistle of the Holy Apostle Paul to the X"
  //   Catholic → "the Epistle of the Holy Apostle X"
  function announceEpistleBook(display) {
    if (!display) return 'Epistle';
    const m = display.match(/^((?:[123] )?[A-Za-z]+)/);
    const book = m ? m[1] : null;
    if (!book) return 'Epistle';
    // Phrasing slots in after "The reading from the " — return the part
    // that follows. (No leading "the".)
    if (/^Acts$/i.test(book)) return 'Acts of the Holy Apostles';
    const paulineMap = {
      Romans: 'Romans',
      '1 Corinthians': 'Corinthians', '2 Corinthians': 'Corinthians',
      Galatians: 'Galatians', Ephesians: 'Ephesians',
      Philippians: 'Philippians', Colossians: 'Colossians',
      '1 Thessalonians': 'Thessalonians', '2 Thessalonians': 'Thessalonians',
      '1 Timothy': 'Timothy', '2 Timothy': 'Timothy',
      Titus: 'Titus', Philemon: 'Philemon', Hebrews: 'Hebrews',
    };
    if (book in paulineMap) {
      return `Epistle of the Holy Apostle Paul to the ${paulineMap[book]}`;
    }
    const catholicMap = {
      James: 'James', '1 Peter': 'Peter', '2 Peter': 'Peter',
      '1 John': 'John', '2 John': 'John', '3 John': 'John', Jude: 'Jude',
    };
    if (book in catholicMap) {
      return `Catholic Epistle of the Holy Apostle ${catholicMap[book]}`;
    }
    return book;
  }

  // Extract full passage text from orthocal's passage[] array
  function extractPassageText(reading) {
    if (!reading?.passage?.length) return null;
    return reading.passage.map(v => v.content).join(' ');
  }

  // ── Great Feast + season detection (needed by troparia, prokeimenon, etc.) ──
  const season = getLiturgicalSeason(date);
  const feastKey = getGreatFeastKey(date);
  const feast    = feastKey ? GREAT_FEAST_VARIANTS[feastKey] : null;

  // ── Troparia & Kontakia ──────────────────────────────────────────────────────
  // Great Feasts & Pentecostarion feast Sundays: use only the feast's own
  // troparia/kontakia (no resurrectional, no Menaion).
  const troparia = [];
  const kontakia = [];
  const feastOnly = !!feast?.troparia || !!(pentOverride?.feastOnly);

  if (feast?.troparia) {
    troparia.push(...feast.troparia);
  } else if (pentOverride?.troparia) {
    troparia.push(...pentOverride.troparia);
  } else if (!feastOnly) {
    // Start with resurrectional troparion (Sundays)
    const troparionRaw  = srcs.octoechos?.[tk]?.saturday?.vespers?.troparion;
    const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;
    if (isSunday && troparionText) {
      troparia.push({ tone, rubric: `Troparion of the Resurrection, Tone ${tone}:`, text: troparionText });
    }

    // Inject Menaion troparia from DB
    const ranked = getMenaionRanked(mo, dy);
    if (ranked?.notable) {
      for (const comm of ranked.notable) {
        const trop = comm.troparia.find(t => t.type === 'troparion');
        if (trop) {
          troparia.push({ tone: trop.tone, rubric: `Troparion of ${comm.title}, Tone ${trop.tone}:`, text: trop.text });
        }
      }
    }
  }

  if (feast?.kontakia) {
    kontakia.push(...feast.kontakia);
  } else if (pentOverride?.kontakia) {
    kontakia.push(...pentOverride.kontakia);
  } else if (!feastOnly) {
    // Start with resurrectional kontakion (Sundays)
    const kontakionRaw = srcs.octoechos?.[tk]?.saturday?.vespers?.kontakion;
    if (isSunday && kontakionRaw) {
      const kText = typeof kontakionRaw === 'object' ? kontakionRaw.text : kontakionRaw;
      const kTone = typeof kontakionRaw === 'object' ? (kontakionRaw.tone ?? tone) : tone;
      if (kText) kontakia.push({ tone: kTone, rubric: `Kontakion of the Resurrection, Tone ${kTone}:`, text: kText });
    }

    // Inject Menaion kontakia from DB
    const ranked = getMenaionRanked(mo, dy);
    if (ranked?.notable) {
      for (const comm of ranked.notable) {
        const kont = comm.troparia.find(t => t.type === 'kontakion');
        if (kont) {
          kontakia.push({ tone: kont.tone, rubric: `Kontakion of ${comm.title}, Tone ${kont.tone}:`, text: kont.text });
        }
      }
    }
  }

  // If no kontakia at all, add the default Theotokos kontakion as the final kontakion
  // (OCA rubric: when no other kontakion is appointed, "O protection of Christians..." is sung)
  // This is already handled by the dismissal troparia section, so leave kontakia empty if none found.

  // Layer co-celebrated saints onto troparia/kontakia. The saint's troparion is
  // appended after the feast troparion; the saint's kontakion is inserted BEFORE
  // the feast kontakion (per OCA combined-service layout — "Glory…" then saint
  // kontakion, then "Now and ever…" then feast kontakion).
  if (overlay?.troparion) {
    troparia.push(overlay.troparion);
  }
  if (overlay?.kontakion && kontakia.length > 0) {
    // Force "Now and ever..." connector onto the feast kontakion (was implicit default)
    kontakia[0] = { ...kontakia[0], connector: 'Now and ever, and unto ages of ages. Amen.' };
    kontakia.unshift(overlay.kontakion);
  } else if (overlay?.kontakion) {
    kontakia.push(overlay.kontakion);
  }

  // ── Communion Hymn ───────────────────────────────────────────────────────────
  const COMMUNION_HYMNS = {
    sunday:    'Praise the Lord from the heavens, praise Him in the highest. Alleluia, Alleluia, Alleluia!',
    monday:    'He maketh His angels spirits, and His ministers a flame of fire. Alleluia, Alleluia, Alleluia!',
    tuesday:   'The righteous shall be in everlasting remembrance; he shall not fear evil tidings. Alleluia, Alleluia, Alleluia!',
    wednesday: 'O taste and see that the Lord is good. Alleluia, Alleluia, Alleluia!',
    thursday:  'Their proclamation has gone out into all the earth, and their words to the ends of the universe. Alleluia, Alleluia, Alleluia!',
    friday:    'Salvation is created in the midst of the earth, O God. Alleluia, Alleluia, Alleluia!',
    saturday:  'Rejoice in the Lord, O ye righteous; praise befits the just. Alleluia, Alleluia, Alleluia!',
  };

  // DAY_PATRONS moved to module scope

  // ── Sunday Prokeimena (by Octoechos tone — correct for ordinary-time Sundays) ─
  // Source: OCA Department of Liturgical Music & Translations service texts
  const SUNDAY_PROKEIMENA = {
    1: { refrain: 'Let Thy mercy, O Lord, be upon us, as we have set our hope on Thee!',
         verse: 'Rejoice in the Lord, O you righteous! Praise befits the just!' },
    2: { refrain: 'The Lord is my strength and my song; He has become my salvation.',
         verse: 'The Lord has chastened me sorely, but He has not given me over to death.' },
    3: { refrain: 'Sing praises to our God, sing praises; sing praises to our King, sing praises.',
         verse: 'Clap your hands, all ye nations; shout unto God with the voice of rejoicing.' },
    4: { refrain: 'O how magnified are Thy works, O Lord; in wisdom hast Thou made them all.',
         verse: 'Bless the Lord, O my soul; O Lord my God, Thou art very great.' },
    5: { refrain: 'Thou, O Lord, shalt protect us and preserve us from this generation forever.',
         verse: 'Save me, O Lord, for there is no longer any that is godly!' },
    6: { refrain: 'O Lord, save Thy people, and bless Thine inheritance!',
         verse: 'To Thee, O Lord, will I call. O my God, be not silent to me!' },
    7: { refrain: 'The Lord shall give strength to His people. The Lord shall bless His people with peace.',
         verse: 'Offer to the Lord, O you sons of God! Offer young rams to the Lord!' },
    8: { refrain: 'Pray and make your vows before the Lord our God.',
         verse: 'In Judah is God known; His name is great in Israel.' },
  };

  // ── Sunday Alleluia verses (by Octoechos tone) ────────────────────────────────
  const SUNDAY_ALLELUIA = {
    1: ['God gives vengeance unto me, and subdues people under me.',
        'He magnifies the salvation of the King and deals mercifully with David, His anointed, and his seed forever.'],
    2: ['May the Lord hear thee in the day of trouble! May the name of the God of Jacob protect thee!',
        'Save the King, O Lord, and hear us on the day we call!'],
    3: ['In Thee, O Lord, have I hoped; let me never be put to shame.',
        'Be Thou a God of protection for me, a house of refuge in order to save me.'],
    4: ['Go forth, and prosper, and reign, because of truth and meekness and righteousness.',
        'Thou lovest righteousness and hatest iniquity.'],
    5: ['I will sing of Thy mercies, O Lord, forever; with my mouth I will proclaim Thy truth from generation to generation.',
        'For Thou hast said: Mercy will be established forever; Thy truth will be prepared in the heavens.'],
    6: ['He who dwelleth in the shelter of the Most High will abide in the shadow of the heavenly God.',
        'He will say to the Lord: My Protector and my Refuge; my God, in Whom I trust.'],
    7: ['It is good to give thanks to the Lord, to sing praises to Thy Name, O Most High.',
        'To declare Thy mercy in the morning, and Thy truth by night.'],
    8: ['Come, let us rejoice in the Lord; let us make a joyful noise to God our Savior.',
        'Let us come before His face with thanksgiving; let us make a joyful noise unto Him with psalms.'],
  };

  // ── Weekday Prokeimena (fixed by day-of-week, not tone) ─────────────────────
  // Source: Ponomar / OCA tradition — daily commemorations
  const WEEKDAY_PROKEIMENA = {
    monday:    { tone: 4, refrain: 'Who maketh His angels spirits, His servers a flaming fire.',
                          verse: 'Bless the Lord, O my soul; O Lord my God, Thou art become very great.' },
    tuesday:   { tone: 7, refrain: 'The righteous shall rejoice in the Lord, and he shall hope in Him.',
                          verse: 'Hear my prayer, O God, when I pray unto Thee.' },
    wednesday: { tone: 3, refrain: 'My soul doth magnify the Lord, and my spirit hath rejoiced in God my Savior.',
                          verse: 'For He hath looked upon the humility of His servant; for behold from henceforth all generations shall bless me.' },
    thursday:  { tone: 8, refrain: 'Their sound is gone forth into all the earth; their sayings to the ends.',
                          verse: 'The heavens declare the glory of God; and the firmament proclaimeth His handiwork.' },
    friday:    { tone: 7, refrain: 'Exalt ye the Lord our God, and worship at His footstool, for He is holy.',
                          verse: 'The Lord hath reigned, let the people rage.' },
    saturday:  { tone: 8, refrain: 'Be glad in the Lord, and rejoice, ye righteous.',
                          verse: 'Blessed are they whose transgressions are forgiven, and whose sins are covered.' },
  };

  // ── Weekday Alleluia (fixed by day-of-week) ────────────────────────────────
  const WEEKDAY_ALLELUIA = {
    monday:    { tone: 5, verses: ['Praise ye the Lord, all His angels; praise ye Him all His powers.',
                                   'For He spoke, and they came into being; He commanded and they were created.'] },
    tuesday:   { tone: 4, verses: ['The righteous shall flourish like the palm tree; like the cedars of Lebanon.',
                                   'They that are planted in the house of the Lord shall flourish in the courts.'] },
    wednesday: { tone: 8, verses: ['Hearken, O Daughter, and see, and incline thine ear.',
                                   'The rich among the people of the earth shall entreat thy countenance.'] },
    thursday:  { tone: 1, verses: ['The heavens confess Thy wonders, O Lord, Thy truth in the church of the saints.',
                                   'God, who is glorified in the council of the saints.'] },
    friday:    { tone: 1, verses: ['Remember Thy congregation, which Thou hast possessed from the beginning.',
                                   'God is our King before the ages; He hath wrought salvation in the midst.'] },
    saturday:  { tone: 4, verses: ['The righteous cried, and the Lord heard them, and delivered them out of all tribulations.',
                                   'Many are the tribulations of the righteous, but out of them all will the Lord deliver them.',
                                   'Blessed are they whom Thou hast chosen and taken, O Lord; their memory is from generation to generation.'] },
  };

  // ── Lenten/Special Sunday Prokeimena & Alleluia ─────────────────────────────
  // During Great Lent the prokeimenon follows the Apostolos (Epistle lectionary),
  // NOT the weekly Octoechos tone. Each Lenten Sunday has a fixed prokeimenon.
  // Source: OCA 2026 service texts, verified against Ponomar/Apostolos.
  const LENTEN_SUNDAY_PROKEIMENA = {
    meatfare:   { tone: 3, refrain: 'Great is our Lord, and abundant in power; His understanding is beyond measure.',
                           verse: 'Praise the Lord! For it is good to sing praises to our God!' },
    cheesefare: { tone: 8, refrain: 'Pray and make your vows before the Lord, our God!',
                           verse: 'In Judah God is known; His name is great in Israel.' },
    1: { tone: 4, refrain: 'Blessed art Thou, O Lord God of our fathers, and praised and glorified is Thy Name forever!',
                  verse: 'For Thou art just in all that Thou hast done for us!' },
    2: { tone: 5, refrain: 'Thou, O Lord, shalt protect us and preserve us from this generation forever.',
                  verse: 'Save me, O Lord, for there is no longer any that is godly!' },
    3: { tone: 6, refrain: 'O Lord, save Thy people, and bless Thine inheritance!',
                  verse: 'To Thee, O Lord, will I call. O my God, be not silent to me!' },
    4: { tone: 8, refrain: 'Pray and make your vows before the Lord, our God!',
                  verse: 'In Judah God is known; His Name is great in Israel.' },
    5: { tone: 1, refrain: 'Let Thy mercy, O Lord, be upon us, as we have set our hope on Thee!',
                  verse: 'Rejoice in the Lord, O you righteous! Praise befits the just!' },
  };
  const LENTEN_SUNDAY_ALLELUIA = {
    meatfare:   { tone: 8, verses: ['Come, let us rejoice in the Lord! Let us make a joyful noise to God our Savior!',
                                    'Let us come before His presence with thanksgiving; let us make a joyful noise to Him with songs of praise.'] },
    cheesefare: { tone: 6, verses: ['It is good to give thanks to the Lord, to sing praises to Thy Name, O Most High.',
                                    'To declare Thy mercy in the morning, and Thy truth by night.'] },
    1: { tone: 4, verses: ['Moses and Aaron were among His priests; Samuel also was among those who called on His Name.',
                            'They called to the Lord and He answered them.'] },
    2: { tone: 6, verses: ['He who dwelleth in the shelter of the Most High will abide in the shadow of the heavenly God.',
                            'He will say to the Lord: "My Protector and my Refuge; my God, in Whom I trust."'] },
    3: { tone: 8, verses: ['Remember Thy congregation, which Thou hast purchased of old!',
                            'God is our King before the ages; He has worked salvation in the midst of the earth!'] },
    4: { tone: 8, verses: ['Come, let us rejoice in the Lord! Let us make a joyful noise to God our Savior!',
                            'Let us come before His face with thanksgiving; let us make a joyful noise to Him with songs of praise!'] },
    5: { tone: 1, verses: ['God gives vengeance unto me, and subdues people under me.',
                            'He magnifies the salvation of the King and deals mercifully with David, His anointed, and his seed forever.'] },
  };

  // ── Cherubic Hymn override ───────────────────────────────────────────────────
  let cherubicOverride = null;
  if (season === 'holyWeek' && dow === 'thursday') cherubicOverride = 'great-thursday';
  if (season === 'holyWeek' && dow === 'saturday') cherubicOverride = 'great-saturday';

  // ── Build prokeimenon & alleluia ────────────────────────────────────────────
  let prokeimenon = null;
  let alleluia = null;

  // Determine Lenten Sunday key (if applicable)
  let lentenKey = null;
  if (isSunday && season === 'greatLent') {
    lentenKey = getWeekOfLent(date);
  } else if (isSunday && season === 'preLenten') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const DAY = 86400000;
    const cheesefareDate = new Date(pascha.getTime() - 49 * DAY);
    const meatfareDate   = new Date(pascha.getTime() - 56 * DAY);
    if (date.getTime() === cheesefareDate.getTime()) lentenKey = 'cheesefare';
    if (date.getTime() === meatfareDate.getTime())   lentenKey = 'meatfare';
  }

  // Great Feast / Pentecostarion Sunday prokeimenon/alleluia override (highest priority)
  if (feast?.prokeimenon) {
    const fp = feast.prokeimenon;
    prokeimenon = { tone: fp.tone, refrain: fp.refrain, verse: fp.verse };
  } else if (pentOverride?.prokeimenon) {
    const pp = pentOverride.prokeimenon;
    prokeimenon = { tone: pp.tone, refrain: pp.refrain, verse: pp.verse };
  } else if (lentenKey !== null && LENTEN_SUNDAY_PROKEIMENA[lentenKey]) {
    const lp = LENTEN_SUNDAY_PROKEIMENA[lentenKey];
    prokeimenon = { tone: lp.tone, refrain: lp.refrain, verse: lp.verse };
  } else if (isSunday && SUNDAY_PROKEIMENA[tone]) {
    const sp = SUNDAY_PROKEIMENA[tone];
    prokeimenon = { tone, refrain: sp.refrain, verse: sp.verse };
  } else if (!isSunday && WEEKDAY_PROKEIMENA[dow]) {
    const wp = WEEKDAY_PROKEIMENA[dow];
    prokeimenon = { tone: wp.tone, refrain: wp.refrain, verse: wp.verse };
  }

  // Attach co-celebrated secondary prokeimenon (e.g., Constantine & Helen on Ascension)
  if (prokeimenon && overlay?.prokeimenon) {
    prokeimenon = { ...prokeimenon, secondary: overlay.prokeimenon };
  }

  if (feast?.alleluia) {
    const fa = feast.alleluia;
    alleluia = { tone: fa.tone, verses: fa.verses };
  } else if (pentOverride?.alleluia) {
    const pa = pentOverride.alleluia;
    alleluia = { tone: pa.tone, verses: pa.verses };
  } else if (lentenKey !== null && LENTEN_SUNDAY_ALLELUIA[lentenKey]) {
    const la = LENTEN_SUNDAY_ALLELUIA[lentenKey];
    alleluia = { tone: la.tone, verses: la.verses };
  } else if (isSunday && SUNDAY_ALLELUIA[tone]) {
    alleluia = { tone, verses: SUNDAY_ALLELUIA[tone] };
  } else if (!isSunday && WEEKDAY_ALLELUIA[dow]) {
    const wa = WEEKDAY_ALLELUIA[dow];
    alleluia = { tone: wa.tone, verses: wa.verses };
  }

  // ── Entrance hymn: feast override → Paschal period → Sunday → weekday ────
  // From Pascha through the Leavetaking, the entrance hymn takes the
  // Pentecostarion form ("In the gatherings bless God the Lord, from the
  // wellsprings of Israel"), regardless of day of week.
  let entranceHymn;
  if (feast?.entranceHymn) {
    entranceHymn = { text: feast.entranceHymn };
  } else if (isSunday) {
    entranceHymn = { text: 'Come, let us worship and fall down before Christ. O Son of God, who art risen from the dead, save us who sing to Thee: Alleluia!' };
  } else {
    entranceHymn = { text: 'Come, let us worship and fall down before Christ. O Son of God, who art wondrous in Thy saints, save us who sing to Thee: Alleluia!' };
  }

  // ── Megalynarion: feast → Paschal period → Basil → typical ─────────────────
  const PASCHAL_MEGALYNARION = 'The Angel cried to the Lady, full of grace:\n"Rejoice, O pure Virgin! Again, I say: Rejoice,\nthy Son is risen from His three days in the tomb!\nWith Himself He has raised all the dead."\nRejoice, O ye people!\n\nShine, shine, O new Jerusalem!\nThe glory of the Lord has shone on thee.\nExult now, and be glad, O Zion!\nBe radiant, O pure Theotokos,\nin the Resurrection of thy Son!';
  let megalynarion;
  if (feast?.megalynarion) {
    megalynarion = { text: feast.megalynarion };
  } else if (pentOverride?.megalynarion) {
    megalynarion = { text: pentOverride.megalynarion };
  } else if (isPaschalPeriod) {
    megalynarion = { text: PASCHAL_MEGALYNARION };
  } else if (isBasil) {
    megalynarion = 'basil-liturgy';
  } else {
    megalynarion = null;
  }

  // Attach co-celebrated secondary alleluia (e.g., Constantine & Helen on Ascension)
  if (alleluia && overlay?.alleluia) {
    alleluia = { ...alleluia, secondary: overlay.alleluia };
  }

  // ── Communion hymn: feast → Pentecostarion Sunday → day-of-week ───────────
  let communionHymn = feast?.communionHymn
    ? { text: feast.communionHymn }
    : pentOverride?.communionHymn
      ? { text: pentOverride.communionHymn }
      : { text: COMMUNION_HYMNS[dow] || COMMUNION_HYMNS.sunday };
  if (overlay?.communionHymn) {
    communionHymn = { ...communionHymn, secondary: overlay.communionHymn };
  }

  // ── Feast antiphons (Lord's feasts only) ──────────────────────────────────
  let feastAntiphons = (feast?.type === 'lord' && feast.antiphons) ? feast.antiphons : null;

  // ── Paschal antiphons for 1st/2nd during Bright Week only ────────────────
  // Most OCA parishes sing Paschal Antiphons (Ps. 65/66) only during Bright
  // Week and revert to Typical Antiphons (Ps. 102/145, "Bless the Lord, O
  // my soul") for the rest of the Paschal period.
  const isBrightWeek = daysSincePascha >= 0 && daysSincePascha <= 6;
  const paschalAntiphons12 = (!feastAntiphons && isBrightWeek)
    ? { first: GREAT_FEAST_VARIANTS.pascha.antiphons.first,
        second: GREAT_FEAST_VARIANTS.pascha.antiphons.second }
    : null;

  // ── Litany for the Departed (Soul Saturdays) ─────────────────────────────
  const includeDepartedLitany = isSoulSaturday(date);

  return {
    variant,
    feastAntiphons,
    paschalAntiphons12,
    beatitudes: feastAntiphons ? null : { troparia: pentOverride?.beatitudesTroparia || buildBeatitudesTroparia(isSunday, tone, srcs) },
    includeDepartedLitany,
    entranceHymn,
    troparia,
    kontakia,
    trisagion: { substitution: getTrisagionSubstitution(date) },
    prokeimenon,
    epistle:  epistleR ? {
      book: announceEpistleBook(epistleR.display),
      display: epistleR.display,
      text: extractPassageText(epistleR),
      secondary: epistleR2 ? {
        book: announceEpistleBook(epistleR2.display),
        display: epistleR2.display,
        text: extractPassageText(epistleR2),
      } : null,
    } : null,
    alleluia,
    gospel:   gospelR ? {
      book: gospelR.book,
      display: gospelR.display,
      text: extractPassageText(gospelR),
      secondary: gospelR2 ? {
        book: gospelR2.book,
        display: gospelR2.display,
        text: extractPassageText(gospelR2),
      } : null,
    } : null,
    megalynarion,
    cherubicOverride,
    communionHymn,
    paschalOpening: isPaschalPeriod,
    weHaveSeen:
      pentOverride?.weHaveSeen
      || (isPaschalPeriod ? 'paschal' : null)
      || (isAscensionAfterfeast
        ? 'Thou didst ascend in glory, O Christ our God, granting joy to Thy Disciples by the promise of the Holy Spirit. Through the blessing, they were assured that Thou art the Son of God, the Redeemer of the world!'
        : null)
      || (isPentecostAfterfeast
        ? 'Blessed art Thou, O Christ our God, who hast revealed the fishermen as most wise by sending down upon them the Holy Spirit; through them Thou didst draw the world into Thy net. O Lover of Man, glory to Thee!'
        : null),
    dismissal: {
      opening: feast ? 'feast' : (isSunday ? 'sunday' : 'weekday'),
      feastLabel: feast?.label || null,
      dayPatron: DAY_PATRONS[dow] || null,
      // Dismissal saints: prefer orthocal's "feasts" (major commemorations) over
      // "saints" (minor entries). On a great feast, skip feasts[0] — it's named
      // in the introit. Co-celebrated commemorations (Constantine & Helen on
      // Ascension, etc.) come from feasts[1+]; fall back to minor saints if empty.
      saints: (() => {
        const f = orthocalData.feasts || [];
        const s = orthocalData.saints || [];
        const coCelebrated = feast ? f.slice(1) : f;
        return [...coCelebrated, ...s].slice(0, 3);
      })(),
      // Festal dismissal introit and seasonal Theotokos magnification.
      // Apply on the feast itself and through its afterfeast period.
      dismissalIntroit:
        feast?.dismissalIntroit
        || (isAscensionAfterfeast ? GREAT_FEAST_VARIANTS.ascension.dismissalIntroit : null),
      dismissalTheotokos:
        feast?.dismissalTheotokos
        || (isAscensionAfterfeast ? GREAT_FEAST_VARIANTS.ascension.dismissalTheotokos : null),
    },
    // Dismissal Troparia: repeated after Psalm 33 before the final dismissal.
    // - Great Feast: feast troparion + kontakion (single).
    // - Pentecostarion Sunday with pentOverride: repeat the full set of Liturgy
    //   troparia + kontakia (Sunday's Resurrection + feast troparia, etc.).
    // - Otherwise: fall back to liturgy-saint troparion + default Theotokion
    //   (rendered inside _litDismissalTroparia).
    dismissalTroparia: feast
      ? { troparion: feast.troparia?.[0] || null, kontakion: feast.kontakia?.[0] || null }
      : pentOverride?.troparia
        ? { troparia: troparia, kontakia: kontakia }
        : null,
  };
}

function getCollectedDates() {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    return db.prepare(`
      SELECT DISTINCT date, pronoun FROM source_files
      WHERE date IS NOT NULL ORDER BY date, pronoun
    `).all();
  } catch { return []; }
  finally { db?.close(); }
}

// ─── DB source resolver ───────────────────────────────────────────────────────

/**
 * Builds a nested object from a dot-notation path so that deepGet() in the
 * assembler can navigate it.  e.g.:
 *   buildNestedPath('lent.week.2.thursday', { vespers: {...} })
 *   → { lent: { week: { '2': { thursday: { vespers: {...} } } } } }
 */
function buildNestedPath(dotPath, value) {
  const parts = dotPath.split('.');
  const root  = {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

/**
 * Transforms a flat array of DB block rows for one section into the nested
 * object shape the assembler expects via deepGet():
 *
 *   { text, tone, label, hymns: [{text,tone,label}, …], glory: {…}, now: {…} }
 *
 * Rules:
 *   - Hymns with position='glory' or position='now' go into glory/now slots.
 *   - For lordICall only: the very first hymn (before any verse block) is the
 *     sung refrain already provided by fixed texts — skip it.
 *   - All other hymns are collected into hymns[] in document order.
 *   - text/tone/label are convenience aliases for hymns[0] (idiomelon pattern).
 */
function categorizeHymn(label) {
  if (!label) return null;
  // Order matters: Midfeast pattern is checked before the broader
  // "from the Pentecostarion" pattern that would otherwise match.
  if (/for the Resurrection/i.test(label))                 return 'resurrectional';
  if (/for Midfeast/i.test(label))                         return 'midfeastIdiomela';
  if (/for the Forerunner/i.test(label))                   return 'menaionFeast';
  if (/Theotokion/i.test(label))                           return 'theotokion';
  if (/Dogmatikon/i.test(label))                           return 'dogmatikon';
  // Holy Fathers Sunday: distinguish Ascension idiomela from Fathers idiomela
  // so the calendar can fill separate LIC slots.
  if (/for the Ascension/i.test(label))                    return 'ascensionIdiomela';
  if (/for the Fathers/i.test(label))                      return 'fatherIdiomela';
  // Day-specific Pentecostarion Sunday idiomela:
  //   "for the <Sunday-name>" — Paralytic, Samaritan Woman, Blind Man, Myrrhbearers, Thomas, Antipascha
  //   "from the Pentecostarion[, …]" — generic Pentecostarion idiomelon when the Sunday-name suffix is absent
  //   "by <hymnographer>" — Romanos, John the Monk, Anatolius (compose Pentecostarion idiomela)
  if (/for the (Samaritan Woman|Paralytic|Blind Man|Myrrhbearers)/i.test(label)) return 'feastIdiomela';
  if (/for Thomas/i.test(label) || /for Antipascha/i.test(label)) return 'feastIdiomela';
  if (/from the Pentecostarion/i.test(label))              return 'feastIdiomela';
  if (/by (Romanos|John the Monk|Anatolius)/i.test(label)) return 'feastIdiomela';
  return null;
}

function transformSectionBlocks(section, blocks) {
  const hymns = [];
  let glory      = null;
  let now        = null;
  let seenVerse  = false;

  // When the data has no verse-type blocks (sparse scraped data), don't apply
  // the seenVerse guard — all hymns are real stichera, not a refrain.
  const hasVerseBlocks = blocks.some(b => b.type === 'verse');

  for (const b of blocks) {
    if (b.type === 'verse')        { seenVerse = true; continue; }
    if (b.type === 'glory_marker') { continue; }
    if (b.type === 'now_marker')   { continue; }
    if (b.type !== 'hymn')         { continue; }

    if (b.position === 'glory') { glory = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }
    if (b.position === 'now')   { now   = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }

    // lordICall only: skip the opening refrain (appears before any psalm verse)
    // Only applies when verse blocks exist — sparse data has no refrain block.
    if (section === 'lordICall' && !seenVerse && hasVerseBlocks) continue;

    hymns.push({
      text: b.text, tone: b.tone, label: b.label,
      category: categorizeHymn(b.label),
      ...(b.source_filename && { provenance: 'OCA' }),
    });
  }

  return {
    text:  hymns[0]?.text  ?? null,
    tone:  hymns[0]?.tone  ?? null,
    label: hymns[0]?.label ?? null,
    ...(hymns[0]?.provenance && { provenance: hymns[0].provenance }),
    hymns,
    ...(glory ? { glory } : {}),
    ...(now   ? { now }   : {}),
  };
}

/**
 * Queries vespers blocks from the DB for a given date/pronoun and returns a
 * source object compatible with the assembler's resolveSource/deepGet system.
 *
 * When the date has a liturgical key (Lenten dates), queries by liturgical_key
 * so texts collected in any year can be used for the same liturgical position
 * in future years. Otherwise falls back to querying by calendar date.
 *
 * The returned object is nested to match the key path used in calendar entries:
 *   liturgical key  → { lent: { week: { '2': { thursday: { vespers: {…} } } } } }
 *   calendar date   → { '2026-10-03': { vespers: {…} } }
 */
function buildDbSource(date, pronoun) {
  let db;
  try {
    db = openDb();
    if (!db) return {};

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);

    const rows = litKey
      ? db.prepare(`
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.liturgical_key = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(litKey, pronoun)
      : db.prepare(`
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.date = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(date, pronoun);

    if (rows.length === 0) return {};

    // Normalize source_filename to a source key for priority ranking
    for (const row of rows) {
      row.dbSource = (row.source_filename || '').startsWith('stSergius')
        ? 'stSergius' : 'oca-menaion';
    }
    // Prefer OCA blocks when multiple sources cover the same section+order
    const deduped = deduplicateBySource(
      rows,
      r => `${r.section}:${r.block_order}`,
      'dbSource'
    );

    const bySection = {};
    for (const row of deduped) {
      (bySection[row.section] ??= []).push(row);
    }

    const vespers = {};
    for (const [section, blocks] of Object.entries(bySection)) {
      vespers[section] = transformSectionBlocks(section, blocks);
    }

    const topKey = litKey || date;
    return buildNestedPath(topKey, { vespers });
  } catch (err) {
    console.error('buildDbSource error:', err.message);
    return {};
  } finally {
    db?.close();
  }
}

function getDbBlocks(date, pronoun, service = 'vespers') {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);
    if (litKey) {
      return db.prepare(`
        SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
        FROM blocks WHERE liturgical_key = ? AND pronoun = ? AND service = ?
        ORDER BY section, block_order
      `).all(litKey, pronoun, service);
    }
    return db.prepare(`
      SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
      FROM blocks WHERE date = ? AND pronoun = ? AND service = ?
      ORDER BY section, block_order
    `).all(date, pronoun, service);
  } catch { return []; }
  finally { db?.close(); }
}

function mapDbBlocks(dbBlocks) {
  const sectionRank = k => { const i = SECTION_ORDER.indexOf(k); return i === -1 ? 99 : i; };
  const sorted = [...dbBlocks].sort((a, b) =>
    sectionRank(a.section) - sectionRank(b.section) || a.block_order - b.block_order
  );
  return sorted.map((b, i) => {
    const section = SECTION_LABELS[b.section] || b.section;
    let type = b.type, text = b.text || '', speaker = null;
    if (b.type === 'glory_marker') { type = 'doxology'; text = 'Glory to the Father, and to the Son, and to the Holy Spirit:'; }
    else if (b.type === 'now_marker') { type = 'doxology'; text = 'Now and ever, and unto ages of ages. Amen.'; }
    else if (b.type === 'hymn') speaker = 'choir';
    return { id: `db-${i}`, section, type, speaker, text, tone: b.tone || null, label: b.label || null };
  });
}

// ─── assembleForDate helper ───────────────────────────────────────────────────

/**
 * Core assembly function. Returns { blocks, calendarEntry, serviceTitle, tone }
 * or null if no calendar entry exists for the date.
 * Throws on assembly error.
 */
function assembleForDate(date, pronoun, entryOverride) {
  const calendarEntry = entryOverride || getCalendarEntry(date);
  if (!calendarEntry) return null;

  const dbSource = buildDbSource(date, pronoun);

  let menaionOverride = sources.menaion;
  const injectSeasons = ['ordinaryTime', 'pentecostarion', 'preLenten'];
  const isSaturdayInjection = calendarEntry.dayOfWeek === 'saturday';
  const isGreatVespers      = calendarEntry.vespers?.serviceType === 'greatVespers' ||
                              calendarEntry.vespers?.serviceType === 'all-night-vigil';
  const isWeekdayInjection  = !isSaturdayInjection;
  // Skip Menaion injection when the service already has complete Triodion content
  // (lordICall slots are DB-sourced, meaning a special observance like Meatfare Saturday)
  // Also skip for Pentecostarion Sundays — they use only Octoechos + Pentecostarion texts
  const hasTriodionContent = calendarEntry.vespers?.lordICall?.slots?.some(s => s.source === 'db');
  const isPentSundayVespers = calendarEntry.vespers?.isPentecostarionSunday;
  if (calendarEntry._meta?.generated && injectSeasons.includes(calendarEntry.liturgicalContext?.season) && !hasTriodionContent && !isPentSundayVespers) {
    const [, mm, dd] = date.split('-').map(Number);
    const ranked = getMenaionRanked(mm, dd);
    const primary = ranked?.principal ?? null;
    let sticheraData = ranked?.sticheraComm
      ? [{ id: ranked.sticheraComm.id, title: ranked.sticheraComm.title,
           rank: ranked.sticheraComm.rank, stichera: ranked.sticheraComm.stichera }]
      : null;

    // General Menaion fallback: when no day-specific stichera exist,
    // use generic texts for this saint's category
    if (!sticheraData && primary?.saint_type) {
      const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
      if (gmTexts) {
        sticheraData = [{ id: primary.id, title: primary.title,
          rank: primary.rank, stichera: gmTexts }];
      }
    }

    if (primary) {
      const troparion = primary.troparia.find(t => t.type === 'troparion');
      const autoSlot  = { troparion: { text: troparion.text, tone: troparion.tone, label: primary.title } };

      // Determine provenance label for dev-mode display
      const firstDbSrc = sticheraData?.[0]?.stichera?.[0]?.dbSource;
      let menaionProvenance = firstDbSrc && firstDbSrc.startsWith('stSergius')
        ? 'St. Sergius'
        : 'OCA';

      // Great Feast all-night-vigil: up to 8 stichera (unique hymns repeat to fill slots)
      // Great Vespers: up to 6; Daily Vespers: up to 3
      const isVigilFeast  = calendarEntry.vespers?.serviceType === 'all-night-vigil';
      const maxLicStichera = isVigilFeast ? 8 : (isGreatVespers ? 6 : (isSaturdayInjection ? 6 : 3));
      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, maxLicStichera) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection && !calendarEntry.liturgicalContext?.greatFeast && !isVigilFeast) {
          // Saturday: split verses between resurrectional (Octoechos) and Menaion
          const menaionCount        = licStichera.length;
          const resurrectionalCount = 6 - menaionCount;
          const allVerses           = [6, 5, 4, 3, 2, 1];
          if (resurrectionalCount === 0) {
            lic.slots = [];
          } else {
            lic.slots[0].verses = allVerses.slice(0, resurrectionalCount);
            lic.slots[0].count  = resurrectionalCount;
          }
          lic.slots.push({
            verses: allVerses.slice(resurrectionalCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else if (isVigilFeast && licStichera.length < 8) {
          // All-Night Vigil: unique hymns repeat to fill 8 slots (e.g. 4 unique × 2)
          const totalSlots = lic.totalStichera || 8;
          const allVerses  = Array.from({ length: totalSlots }, (_, i) => totalSlots - i);
          lic.slots = [{
            verses: allVerses,
            count:  totalSlots,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
          // Build hymns array with repeats to fill totalSlots
          const hymns = [];
          for (let i = 0; i < totalSlots; i++) {
            hymns.push({ text: licStichera[i % licStichera.length].text,
                         tone: licStichera[i % licStichera.length].tone,
                         label: licStichera[i % licStichera.length].label });
          }
          autoSlot.lordICall = { hymns };
        } else if (isWeekdayInjection && !isGreatVespers && lic.slots?.length > 0 && lic.slots[0].source === 'octoechos') {
          // Weekday Daily Vespers: split 6 stichera between Octoechos and Menaion
          const menaionCount    = Math.min(licStichera.length, 3);
          const octoechosCount  = 6 - menaionCount;
          const allVerses       = [6, 5, 4, 3, 2, 1];
          lic.slots[0].verses   = allVerses.slice(0, octoechosCount);
          lic.slots[0].count    = octoechosCount;
          lic.slots.push({
            verses: allVerses.slice(octoechosCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else {
          // Great Vespers or Vigil with ≥8 unique stichera — all Menaion
          const allVerses = isVigilFeast
            ? [8, 7, 6, 5, 4, 3, 2, 1].slice(0, licStichera.length)
            : [6, 5, 4, 3, 2, 1].slice(0, licStichera.length);
          lic.slots = [{
            verses: allVerses,
            count:  licStichera.length,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
        }

        if (!autoSlot.lordICall) {
          autoSlot.lordICall = { hymns: licStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) };
        }

        if (licGlory) {
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title, combinesGloryNow: true };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      // Inject Menaion aposticha stichera when available
      let apostStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'aposticha' && s.order >= 1
      ).slice(0, 3) ?? [];
      let apostGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'aposticha' && s.order === 0
      ) ?? null;

      // General Menaion aposticha fallback when day-specific aposticha is missing
      if (apostStichera.length === 0 && !apostGlory && primary?.saint_type) {
        const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
        if (gmTexts) {
          const gmApost = gmTexts.filter(r => r.section === 'aposticha' && r.order >= 1).slice(0, 3);
          const gmGlory = gmTexts.find(r => r.section === 'aposticha' && r.order === 0) ?? null;
          if (gmApost.length > 0 || gmGlory) {
            apostStichera = gmApost;
            apostGlory = gmGlory;
            menaionProvenance = 'St. Sergius (General)';
          }
        }
      }

      if (apostStichera.length > 0 || apostGlory) {
        autoSlot.aposticha = {
          hymns: apostStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
        };

        const apost = calendarEntry.vespers.aposticha;
        const isGreatFeast = !!calendarEntry.liturgicalContext?.greatFeast;
        const hasOctoechosAposticha = apost.slots?.some(s => s.source === 'octoechos');

        if (hasOctoechosAposticha && !isGreatFeast) {
          // Weekday/Saturday: keep Octoechos aposticha, only overlay Menaion glory
          // (Octoechos provides the 3 base hymns; Menaion provides the Glory sticheron)
        } else {
          // Great feast or no Octoechos base: replace slots with Menaion stichera
          apost.slots = apostStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.aposticha.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
          }));
          // Add repeatPrevious placeholders only when fewer than 3 stichera are available
          while (apost.slots.length < 3) {
            apost.slots.push({ position: apost.slots.length + 1, repeatPrevious: true });
          }
        }

        if (apostGlory) {
          apost.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.glory`, tone: apostGlory.tone, label: primary.title, combinesGloryNow: isGreatFeast };
          // Weekday: Octoechos theotokion already set as `now` in calendar entry
          // Saturday: set Octoechos theotokion explicitly
          if (isSaturdayInjection && !isGreatFeast) {
            apost.now = { source: 'octoechos', key: `tone${calendarEntry.liturgicalContext.tone}.saturday.vespers.aposticha.theotokion`, tone: calendarEntry.liturgicalContext.tone, label: 'Theotokion' };
          }
          autoSlot.aposticha.glory = { text: apostGlory.text, tone: apostGlory.tone, label: apostGlory.label };
        }
        // If no doxastichon, keep the existing combinesGloryNow theotokion from calendar entry
      }

      // ── Inject Litya stichera from DB (great feast and vigil services) ────
      if (calendarEntry.vespers?.litya) {
        const lityaStichera = sticheraData?.[0]?.stichera.filter(
          s => s.section === 'litya' && s.order >= 1
        ) ?? [];
        const lityaGlory = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === 0
        ) ?? null;
        const lityaNow = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === -1
        ) ?? null;

        if (lityaStichera.length > 0) {
          const litya = calendarEntry.vespers.litya;
          litya.slots = lityaStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.litya.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
          }));

          autoSlot.litya = {
            hymns: lityaStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
          };

          if (lityaGlory) {
            litya.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.glory`, tone: lityaGlory.tone, label: primary.title };
            autoSlot.litya.glory = { text: lityaGlory.text, tone: lityaGlory.tone, label: lityaGlory.label };
          }
          if (lityaNow) {
            litya.now = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.now`, tone: lityaNow.tone, label: primary.title };
            autoSlot.litya.now = { text: lityaNow.text, tone: lityaNow.tone, label: lityaNow.label };
          }
        }
      }

      menaionOverride = { ...sources.menaion, auto: { [date]: autoSlot } };

      const slots    = calendarEntry.vespers.troparia.slots;
      const nowIdx   = slots.findIndex(s => s.position === 'now');
      const insertAt = nowIdx !== -1 ? nowIdx : slots.length;
      slots.splice(insertAt, 0, {
        position: 'glory',
        source:   'menaion', provenance: menaionProvenance,
        key:      `auto.${date}.troparion`,
        tone:     troparion.tone,
        label:    primary.title,
      });

      // Populate all notable saints (those with troparia, in OCA priority order)
      calendarEntry.commemorations = (ranked?.notable ?? [{ ...primary }]).map(c => ({
        title:        c.title,
        tone:         c.troparia.find(t => t.type === 'troparion')?.tone ?? c.tone,
        isPrincipal:  c.id === primary.id,
        hasStichera:  c.hasStichera,
      }));
    }
  }

  // Build Vespers dismissal spec if not already present
  if (!calendarEntry.vespers.dismissal) {
    const dow = calendarEntry.dayOfWeek;
    const feastKey = calendarEntry.liturgicalContext?.greatFeast;
    // Saturday Great Vespers begins the Sunday celebration → resurrectional dismissal
    const isSundayVespers = dow === 'sunday' ||
      (dow === 'saturday' && isGreatVespers && !feastKey);
    calendarEntry.vespers.dismissal = {
      opening: feastKey ? 'feast' : (isSundayVespers ? 'sunday' : 'weekday'),
      feastLabel: feastKey || null,
      dayPatron: DAY_PATRONS[dow] || null,
      saints: (calendarEntry.commemorations || []).slice(0, 3).map(c => c.title),
    };
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, fixedTexts, reqSources);

  if (pronoun === 'yy') {
    for (const block of blocks) {
      if (block.text) block.text = applyYouYour(block.text);
      if (block.label) block.label = applyYouYour(block.label);
    }
  }

  const svcType = calendarEntry.vespers?.serviceType;
  const svcKey  = calendarEntry.vespers?.serviceKey;
  const serviceTitle = svcKey === 'burialVespers'
    ? 'Burial Vespers'
    : svcType === 'dailyVespers'
      ? 'Daily Vespers'
      : svcType === 'all-night-vigil'
        ? 'All-Night Vigil \u2014 Great Vespers'
        : 'Great Vespers';
  const tone = calendarEntry.vespers?.lordICall?.tone ?? calendarEntry.liturgicalContext?.tone ?? null;

  return { blocks, calendarEntry, serviceTitle, tone };
}

// ─── Pronoun substitution (Thee/Thy → You/Your) ───────────────────────────────

const YOU_YOUR_RULES = [
  // Predicate-nominative Thine first (before general Thine → Your)
  [/\bThine(?=\s+is\b)/g,       'Yours'],
  [/\bthine(?=\s+is\b)/g,       'yours'],
  // Pronouns
  [/\bThou\b/g,    'You'],     [/\bthou\b/g,    'you'],
  [/\bThee\b/g,    'You'],     [/\bthee\b/g,    'you'],
  [/\bThy\b/g,     'Your'],    [/\bthy\b/g,     'your'],
  [/\bThine\b/g,   'Your'],    [/\bthine\b/g,   'your'],
  [/\bThyself\b/g, 'Yourself'],[/\bthyself\b/g, 'yourself'],
  // Irregular verb forms
  [/\bArt\b/g,      'Are'],    [/\bart\b/g,      'are'],
  [/\bHast\b/g,     'Have'],   [/\bhast\b/g,     'have'],
  [/\bDost\b/g,     'Do'],     [/\bdost\b/g,     'do'],
  [/\bWilt\b/g,     'Will'],   [/\bwilt\b/g,     'will'],
  [/\bWast\b/g,     'Were'],   [/\bwast\b/g,     'were'],
  [/\bDidst\b/g,    'Did'],    [/\bdidst\b/g,    'did'],
  [/\bHadst\b/g,    'Had'],    [/\bhadst\b/g,    'had'],
  [/\bShouldst\b/g, 'Should'], [/\bshouldst\b/g, 'should'],
  [/\bWouldst\b/g,  'Would'],  [/\bwouldst\b/g,  'would'],
  [/\bCouldst\b/g,  'Could'],  [/\bcouldst\b/g,  'could'],
  // -est verbs requiring -e restoration on the stem
  [/\bGavest\b/g,   'Gave'],   [/\bgavest\b/g,   'gave'],
  [/\bGivest\b/g,   'Give'],   [/\bgivest\b/g,   'give'],
  [/\bHidest\b/g,   'Hide'],   [/\bhidest\b/g,   'hide'],
  [/\bLovest\b/g,   'Love'],   [/\blovest\b/g,   'love'],
  [/\bMakest\b/g,   'Make'],   [/\bmakest\b/g,   'make'],
  [/\bRidest\b/g,   'Ride'],   [/\bridest\b/g,   'ride'],
  [/\bTakest\b/g,   'Take'],   [/\btakest\b/g,   'take'],
  // -est verbs where stripping -est gives the correct stem
  [/\bBeholdest\b/g, 'Behold'],  [/\bbeholdest\b/g, 'behold'],
  [/\bCallest\b/g,   'Call'],    [/\bcallest\b/g,   'call'],
  [/\bCoverest\b/g,  'Cover'],   [/\bcoverest\b/g,  'cover'],
  [/\bDwellest\b/g,  'Dwell'],   [/\bdwellest\b/g,  'dwell'],
  [/\bFillest\b/g,   'Fill'],    [/\bfillest\b/g,   'fill'],
  [/\bHearest\b/g,   'Hear'],    [/\bhearest\b/g,   'hear'],
  [/\bHoldest\b/g,   'Hold'],    [/\bholdest\b/g,   'hold'],
  [/\bKeepest\b/g,   'Keep'],    [/\bkeepest\b/g,   'keep'],
  [/\bKnowest\b/g,   'Know'],    [/\bknowest\b/g,   'know'],
  [/\bLeadest\b/g,   'Lead'],    [/\bleadest\b/g,   'lead'],
  [/\bLettest\b/g,   'Let'],     [/\blettest\b/g,   'let'],
  [/\bOpenest\b/g,   'Open'],    [/\bopenest\b/g,   'open'],
  [/\bRemainest\b/g, 'Remain'],  [/\bremainist\b/g, 'remain'],
  [/\bRenewest\b/g,  'Renew'],   [/\brenewest\b/g,  'renew'],
  [/\bSendest\b/g,   'Send'],    [/\bsendest\b/g,   'send'],
  [/\bSeekest\b/g,   'Seek'],    [/\bseekest\b/g,   'seek'],
  [/\bSeest\b/g,     'See'],     [/\bseest\b/g,     'see'],
  [/\bSpeakest\b/g,  'Speak'],   [/\bspeakest\b/g,  'speak'],
  [/\bTeachest\b/g,  'Teach'],   [/\bteachest\b/g,  'teach'],
  [/\bTurnest\b/g,   'Turn'],    [/\bturnest\b/g,   'turn'],
  [/\bWalkest\b/g,   'Walk'],    [/\bwalkest\b/g,   'walk'],
  [/\bWaterest\b/g,  'Water'],   [/\bwaterest\b/g,  'water'],
  [/\bWeepest\b/g,   'Weep'],    [/\bweepest\b/g,   'weep'],
];

function applyYouYour(text) {
  for (const [re, rep] of YOU_YOUR_RULES) text = text.replace(re, rep);
  return text;
}

// ─── getDayLabel helper ───────────────────────────────────────────────────────

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

function getDayLabel(entry, dow, season, date) {
  // Great Feasts override every season's default label.
  if (date) {
    const d = date instanceof Date ? date : new Date(date + 'T12:00:00Z');
    const feastKey = getGreatFeastKey(d);
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.label) {
      return GREAT_FEAST_VARIANTS[feastKey].label;
    }
  }
  if (season === 'greatLent') {
    if (dow === 'saturday') {
      const note = entry._meta?.note || '';
      // Soul Saturdays
      const soulMatch = note.match(/Soul Saturday (\d)/);
      if (soulMatch) return `Soul Saturday ${soulMatch[1]}`;
      // Lazarus Saturday
      if (/Lazarus/.test(note)) return 'Lazarus Saturday';
      // Numbered Saturdays
      const satNum = entry.liturgicalContext?.weekOfLent || entry.liturgicalContext?.specialDayIndex;
      if (satNum) return `${ORDINALS[satNum] || satNum + 'th'} Saturday of Great Lent`;
      return null;
    }
    if (dow === 'sunday') {
      const wk = entry.liturgicalContext?.weekOfLent;
      const names = {
        1: 'Sunday of Orthodoxy',
        2: 'Sunday of St. Gregory Palamas',
        3: 'Sunday of the Holy Cross',
        4: 'Sunday of St. John of the Ladder',
        5: 'Sunday of St. Mary of Egypt',
        6: 'Palm Sunday',
      };
      return names[wk] || null;
    }
    // Weekday
    const wk  = entry.liturgicalContext?.weekOfLent;
    const cap = dow.charAt(0).toUpperCase() + dow.slice(1);
    if (wk) return `${cap}, ${ORDINALS[wk] || wk + 'th'} Week of Great Lent`;
    return null;
  }

  if (season === 'preLenten') {
    const litKey = entry.liturgicalContext?.litKey || null;
    const TRIODION_NAMES = {
      'triodion.publicanPharisee':  'Sunday of the Publican and Pharisee',
      'triodion.prodigalSon':       'Sunday of the Prodigal Son',
      'triodion.meatfareSaturday':  'Meatfare Saturday',
      'triodion.meatfareSunday':    'Meatfare Sunday',
      'triodion.forgivenessSunday': 'Forgiveness Sunday',
    };
    // Try to extract the litKey from the meta note
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return TRIODION_NAMES[key] || null;
  }

  if (season === 'holyWeek') {
    const names = {
      sunday: 'Palm Sunday', monday: 'Holy Monday', tuesday: 'Holy Tuesday',
      wednesday: 'Holy Wednesday', thursday: 'Great and Holy Thursday',
      friday: 'Great and Holy Friday', saturday: 'Great and Holy Saturday',
    };
    return names[dow] || null;
  }

  if (season === 'brightWeek') {
    const names = {
      sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
      wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
      friday: 'Bright Friday', saturday: 'Bright Saturday',
    };
    return names[dow] || null;
  }

  if (season === 'pentecostarion') {
    const FEAST_NAMES = {
      'pentecostarion.week.2.sunday': 'Thomas Sunday (Antipascha)',
      'pentecostarion.week.3.sunday': 'Sunday of the Myrrhbearers',
      'pentecostarion.week.4.sunday': 'Sunday of the Paralytic',
      'pentecostarion.week.5.sunday': 'Sunday of the Samaritan Woman',
      'pentecostarion.week.6.sunday': 'Sunday of the Blind Man',
      'pentecostarion.week.7.sunday': 'Sunday of the Holy Fathers of the 1st Ecumenical Council — Afterfeast of the Ascension',
      'pentecostarion.ascension':     'The Ascension of our Lord',
      'pentecostarion.pentecost':     'Holy Pentecost',
    };
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return FEAST_NAMES[key] || null;
  }

  return null;
}

// ─── Dashboard data builder ──────────────────────────────────────────────────

/**
 * Builds coverage data for every day in the given year.
 * Returns an array of { date, season, tone, feast, hasService, score, primarySource, layers, services }.
 *
 * score: 0–1 composite coverage (calendar entry, octoechos, prokeimena, troparia, stichera)
 * primarySource: 'oca' | 'stSergius' | 'generic' | 'mixed' | null
 * layers: { calendarEntry, octoechos, prokeimena, troparia, stichera, aposticha, triodion }
 *         each: { present: bool, source: string|null }
 */
function buildDashboardData(year) {
  const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;
  const jan1  = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));

  // Batch-load Menaion DB data for the whole year
  let tropariaCounts = {};  // "MM-DD" → count
  let sticheraCounts = {};  // "MM-DD" → { count, sources }
  let generalMenaionTypes = {};  // "MM-DD" → saint_type if any
  try {
    const db = openDb();
    if (db) {
      // Count troparia per day
      const tropRows = db.prepare(`
        SELECT c.month, c.day, COUNT(DISTINCT t.commemoration_id) AS cnt
        FROM troparia t JOIN commemorations c ON c.id = t.commemoration_id
        WHERE t.type = 'troparion'
        GROUP BY c.month, c.day
      `).all();
      for (const r of tropRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        tropariaCounts[key] = r.cnt;
      }

      // Count stichera per day with source info and section breakdown
      const stichRows = db.prepare(`
        SELECT c.month, c.day, COUNT(*) AS cnt,
               GROUP_CONCAT(DISTINCT s.source) AS sources,
               GROUP_CONCAT(DISTINCT s.section) AS sections
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
        GROUP BY c.month, c.day
      `).all();
      for (const r of stichRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        sticheraCounts[key] = { count: r.cnt, sources: r.sources || '', sections: r.sections || '' };
      }

      // Get saint_type for primary commemoration per day (for general menaion fallback detection)
      const gmRows = db.prepare(`
        SELECT month, day, saint_type FROM commemorations
        WHERE saint_type IS NOT NULL
        ORDER BY id
      `).all();
      for (const r of gmRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        if (!generalMenaionTypes[key]) generalMenaionTypes[key] = r.saint_type;
      }

      db.close();
    }
  } catch (err) {
    console.error('Dashboard DB query error:', err.message);
  }

  // Check which saint types have general menaion entries
  let gmAvailableTypes = new Set();
  try {
    const db = openDb();
    if (db) {
      const gmTypes = db.prepare(`SELECT DISTINCT saint_type FROM general_menaion`).all();
      for (const r of gmTypes) gmAvailableTypes.add(r.saint_type);
      // Add fallback mappings
      for (const [plural, singular] of Object.entries(GENERAL_MENAION_FALLBACK)) {
        if (gmAvailableTypes.has(singular)) gmAvailableTypes.add(plural);
      }
      db.close();
    }
  } catch (_) {}

  const result = [];
  let cur = new Date(jan1);

  while (cur <= dec31) {
    const dateStr = cur.toISOString().slice(0, 10);
    const [, mm, dd] = dateStr.split('-');
    const dayKey = `${mm}-${dd}`;
    const dowIdx = cur.getUTCDay();
    const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

    // Get calendar entry (cheap)
    const entry = getCalendarEntry(dateStr);
    const season = entry ? (entry.liturgicalContext?.season || null) : getLiturgicalSeason(cur);
    const tone = entry ? (entry.liturgicalContext?.tone ?? null) : null;

    const hasService = !!entry;
    const services = {
      greatVespers: entry?.vespers?.serviceType === 'greatVespers' && !entry?.vespers?.serviceKey,
      dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
      allNightVigil: entry?.vespers?.serviceType === 'all-night-vigil',
      burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
      lamentations: isLamentationsDay(cur),
      vesperalLiturgy: isVesperalLiturgyDay(cur),
      royalHours: isRoyalHoursDay(cur),
      matins: !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur)),
      liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
      passionGospels: isPassionGospelsDay(cur),
      presanctified: isPresanctifiedDay(cur),
      paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
      paschaCollection: (() => {
        const p = calculatePascha(cur.getUTCFullYear());
        return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
      })(),
    };

    // Feast name from Menaion DB
    let feast = null;
    try {
      const dayList = getMenaionDayList(parseInt(mm), parseInt(dd));
      if (dayList) feast = dayList.principal;
    } catch (_) {}

    // Coverage layers
    const hasTroparia  = !!tropariaCounts[dayKey];
    const stichInfo    = sticheraCounts[dayKey];
    const hasStichera  = !!stichInfo;
    const saintType    = generalMenaionTypes[dayKey];
    const hasGmFallback = saintType && gmAvailableTypes.has(saintType) && !hasStichera;

    // Determine sources used
    const sourcesUsed = new Set();
    if (hasStichera && stichInfo.sources) {
      for (const s of stichInfo.sources.split(',')) {
        if (s === 'oca-menaion') sourcesUsed.add('oca');
        else if (s.startsWith('stSergius')) sourcesUsed.add('stSergius');
        else if (s) sourcesUsed.add(s);
      }
    }
    if (hasGmFallback) sourcesUsed.add('generic');

    // Determine Octoechos presence (relevant for Saturday Great Vespers / Friday)
    const needsOctoechos = dowStr === 'saturday' || dowStr === 'friday';
    const hasOctoechos = hasService && needsOctoechos;
    // Prokeimena always available from JSON
    const hasProkeimena = hasService;
    // Triodion check — relevant for Lenten season
    const lentenSeasons = ['greatLent', 'preLenten', 'holyWeek', 'brightWeek', 'pentecostarion'];
    const needsTriodion = lentenSeasons.includes(season);
    const hasTriodion = needsTriodion ? (entry?.vespers?.lordICall?.slots?.some(s => s.source === 'db' || s.source === 'triodion') || false) : true;

    // Composite score — contextual weights based on what the service actually needs
    let score = 0;
    if (hasService) {
      // Saturdays: full 6-layer scoring; weekdays: skip octoechos weight and redistribute
      const isSat = needsOctoechos;
      const weights = isSat
        ? { calendar: 0.15, octoechos: 0.2, prokeimena: 0.1, troparia: 0.2, stichera: 0.25, triodion: 0.1 }
        : { calendar: 0.15, prokeimena: 0.1, troparia: 0.3, stichera: 0.35, triodion: 0.1 };
      score += weights.calendar; // always have calendar entry if hasService
      if (isSat && hasOctoechos) score += weights.octoechos;
      if (hasProkeimena) score += weights.prokeimena;
      if (hasTroparia)   score += weights.troparia;
      if (hasStichera || hasGmFallback) score += weights.stichera;
      if (hasTriodion)   score += weights.triodion;
    }

    // Liturgy content score — the liturgy is dynamically built from orthocal + Menaion DB,
    // so any day with liturgy served gets a base score; troparia/kontakia add more.
    const liturgyServed = services.liturgy;
    let liturgyScore = 0;
    if (liturgyServed) {
      liturgyScore = 0.5;                        // base: fixed texts + orthocal readings
      if (hasTroparia) liturgyScore += 0.25;     // saint troparia/kontakia from Menaion DB
      if (dowStr === 'sunday') liturgyScore += 0.25; // resurrectional content from Octoechos
      else if (hasTroparia) liturgyScore += 0.25; // weekday: troparia are the main variable
      liturgyScore = Math.min(liturgyScore, 1.0);
    }

    // Primary source
    let primarySource = null;
    if (sourcesUsed.size > 1) primarySource = 'mixed';
    else if (sourcesUsed.has('oca')) primarySource = 'oca';
    else if (sourcesUsed.has('stSergius')) primarySource = 'stSergius';
    else if (sourcesUsed.has('generic')) primarySource = 'generic';
    else if (hasService && hasTroparia) primarySource = 'oca'; // troparia from OCA scraper

    const layers = {};
    if (hasService) {
      layers.calendarEntry = { present: true, source: entry?._meta?.generated ? 'auto-generated' : 'hand-authored' };
      layers.octoechos     = { present: hasOctoechos, source: hasOctoechos ? 'OCA Obikhod' : null };
      layers.prokeimena    = { present: hasProkeimena, source: 'prokeimena.json' };
      layers.troparia      = { present: hasTroparia, source: hasTroparia ? 'OCA Menaion' : null };
      layers.stichera      = { present: hasStichera, source: hasStichera ? formatSticheraSource(stichInfo.sources) : (hasGmFallback ? 'General Menaion' : null) };
      if (hasGmFallback && !hasStichera) {
        layers.stichera.present = true;
        layers.stichera.source = 'General Menaion (fallback)';
      }
      layers.aposticha     = { present: hasStichera && stichInfo.sections?.includes('aposticha'), source: hasStichera && stichInfo.sections?.includes('aposticha') ? formatSticheraSource(stichInfo.sources) : null };
      if (needsTriodion) {
        layers.triodion = { present: hasTriodion, source: hasTriodion ? 'triodion JSON' : null };
      }
    }

    result.push({
      date: dateStr,
      dayOfWeek: dowStr,
      season,
      tone,
      feast,
      hasService,
      score: Math.round(score * 100) / 100,
      liturgyScore,
      primarySource,
      layers,
      services,
    });

    cur = new Date(cur.getTime() + DAY_MS_LOCAL);
  }

  return result;
}

function formatSticheraSource(sourcesStr) {
  if (!sourcesStr) return null;
  const parts = sourcesStr.split(',');
  const labels = parts.map(s => {
    if (s === 'oca-menaion') return 'OCA';
    if (s.startsWith('stSergius')) return 'St. Sergius';
    return s;
  });
  return [...new Set(labels)].join(' + ');
}

// ─── Static file serving ──────────────────────────────────────────────────────

function serveStatic(res, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }
  res.writeHead(200, { 'Content-Type': contentType + '; charset=utf-8' });
  res.end(fs.readFileSync(filePath));
}

// ─── Request handler ──────────────────────────────────────────────────────────

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  return Object.fromEntries(new URLSearchParams(url.slice(idx + 1)));
}

// Pre-load sources once at startup
// Day-of-week patron saints for dismissal (shared by Liturgy and Vespers)
const DAY_PATRONS = {
  sunday:    'the holy, glorious, and all-laudable Apostles',
  monday:    'the honorable, bodiless Powers of Heaven',
  tuesday:   'the honorable, glorious Prophet, Forerunner, and Baptist John',
  wednesday: 'the power of the precious and life-giving Cross',
  thursday:  'the holy, glorious, and all-laudable Apostles; our father among the saints Nicholas the Wonderworker, Archbishop of Myra in Lycia',
  friday:    'the power of the precious and life-giving Cross',
  saturday:  'the holy, glorious, and right-victorious Martyrs',
};

let sources;
try {
  sources = loadSources();
  console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
} catch (err) {
  console.error('Failed to load sources:', err.message);
  process.exit(1);
}

let fixedTexts;
try {
  fixedTexts = loadJSON('fixed-texts/vespers-fixed.json');
  console.log('Fixed texts loaded.');
} catch (err) {
  console.error('Failed to load fixed texts:', err.message);
  process.exit(1);
}

let liturgyFixed;
try {
  liturgyFixed = loadJSON('fixed-texts/liturgy-fixed.json');
  registerBaseFixed('liturgy', liturgyFixed);
  console.log('Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load liturgy fixed texts:', err.message);
  process.exit(1);
}

let presanctifiedFixed;
try {
  presanctifiedFixed = loadJSON('fixed-texts/presanctified-fixed.json');
  registerBaseFixed('presanctified', presanctifiedFixed);
  console.log('Presanctified fixed texts loaded.');
} catch (err) {
  console.error('Failed to load presanctified fixed texts:', err.message);
  process.exit(1);
}

// Defer translation validation until AFTER all base fixed-text files have
// registered, so drift warnings have a base to check against.
validateAllTranslations();

let paschalHoursFixed;
try {
  paschalHoursFixed = loadJSON('fixed-texts/paschal-hours-fixed.json');
  console.log('Paschal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Hours fixed texts:', err.message);
  process.exit(1);
}

let midnightOfficeFixed;
try {
  midnightOfficeFixed = loadJSON('fixed-texts/midnight-office-fixed.json');
  console.log('Midnight Office fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Midnight Office fixed texts:', err.message);
  process.exit(1);
}

let paschalMatinsFixed;
try {
  paschalMatinsFixed = loadJSON('fixed-texts/paschal-matins-fixed.json');
  console.log('Paschal Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Matins fixed texts:', err.message);
  process.exit(1);
}

let passionGospelsFixed;
try {
  passionGospelsFixed = loadJSON('fixed-texts/passion-gospels-fixed.json');
  console.log('Passion Gospels fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Passion Gospels fixed texts:', err.message);
  process.exit(1);
}

let bridegroomMatinsFixed;
try {
  bridegroomMatinsFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
  console.log('Bridegroom Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Bridegroom Matins fixed texts:', err.message);
  process.exit(1);
}

let lamentationsFixed;
try {
  lamentationsFixed = loadJSON('fixed-texts/lamentations-fixed.json');
  console.log('Lamentations fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Lamentations fixed texts:', err.message);
  process.exit(1);
}

let vesperalLiturgyFixed;
try {
  vesperalLiturgyFixed = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
  console.log('Vesperal Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Vesperal Liturgy fixed texts:', err.message);
  process.exit(1);
}

let royalHoursFixed;
try {
  royalHoursFixed = loadJSON('fixed-texts/royal-hours-fixed.json');
  console.log('Royal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Royal Hours fixed texts:', err.message);
  process.exit(1);
}

let matinsFixed;
try {
  matinsFixed = loadJSON('fixed-texts/matins-fixed.json');
  console.log('Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Matins fixed texts:', err.message);
  process.exit(1);
}

ensureOrthocalCacheTable();

function handleRequest(req, res) {
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  try {
    if (pathname === '/') {
      serveStatic(res, path.join(__dirname, 'public', 'index.html'), 'text/html');

    } else if (pathname === '/favicon.svg') {
      serveStatic(res, path.join(__dirname, 'public', 'favicon.svg'), 'image/svg+xml');

    } else if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/')) {
      const filePath = path.join(__dirname, 'public', pathname);
      const ext = path.extname(filePath);
      const ct = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/plain';
      serveStatic(res, filePath, ct);

    } else if (pathname === '/api/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      // ── Vespers date-shift ─────────────────────────────────────────────────
      // Vespers is the first service of the next liturgical day.  The API date
      // represents the civil evening the service is served; the liturgical
      // content comes from the *next* calendar date.
      //
      // Exception: Burial Vespers (Holy Friday afternoon) uses the day's own
      // texts — it is NOT the evening vespers that begins the next day.
      const dayEntry = getCalendarEntry(date);
      const isBurialVespers = dayEntry?.vespers?.serviceKey === 'burialVespers';
      const vespersDate = isBurialVespers ? date : getNextDateStr(date);

      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API.
      // For vigil-rank Sundays with OT prophecies (e.g. Holy Fathers), enrich
      // otReadings with full scripture text from orthocal.
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(vespersDate);
        if (baseEntry?.vespers?.otReadings?.length > 0) {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          const enrichedReadings = baseEntry.vespers.otReadings.map((r, i) => {
            const match = vesperReadings[i];
            if (match?.passage?.length) {
              const text = match.passage.map(p => p.content).join(' ');
              return { ...r, text };
            }
            return r;
          });
          entryOverride = {
            ...baseEntry,
            vespers: { ...baseEntry.vespers, otReadings: enrichedReadings },
          };
        }
        if (baseEntry?.liturgicalContext?.season === 'greatLent' &&
            baseEntry?.vespers?.serviceType === 'dailyVespers') {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0) {
            // Deep-clone just the prokeimenon entries so we don't mutate the shared calendar entry
            const entries = (baseEntry.vespers?.prokeimenon?.entries || []).map(e => {
              // API returns book:"OT" for all Vespers readings; match by book name in display field
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                // Extract pericope from display (e.g. "Genesis 10.32-11.9" → "10:32–11:9")
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                // Normalize: first dot between digits becomes colon, subsequent dot becomes em-dash start
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            entryOverride = {
              ...baseEntry,
              vespers: {
                ...baseEntry.vespers,
                prokeimenon: { ...baseEntry.vespers.prokeimenon, entries },
              },
            };
          }
        }
      } catch (err) {
        console.warn('Orthocal pericope fetch failed (non-fatal):', err.message);
      }

      let result;
      try {
        result = assembleForDate(vespersDate, pronoun, entryOverride);
      } catch (err) {
        console.error('assembleForDate error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No service available for this date.', date }));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = result;
      const season = calendarEntry.liturgicalContext?.season || null;
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);

      // Use calendar entry commemorations if present; otherwise fall back to Menaion DB
      let commemorations = calendarEntry.commemorations || [];
      if (commemorations.length === 0) {
        const [, mm, dd] = vespersDate.split('-').map(Number);
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) {
          commemorations = dayList.commemorations.map((title, i) => ({
            title,
            isPrincipal: i === 0,
            tone: null,
            hasStichera: false,
          }));
        }
      }

      // Relabel 'db' source to the actual liturgical book for dev-mode display
      const dbSourceLabel = season === 'pentecostarion' ? 'pentecostarion'
        : season === 'brightWeek' ? 'pentecostarion'
        : (season === 'greatLent' || season === 'holyWeek' || season === 'preLenten') ? 'triodion'
        : 'db';
      for (const b of blocks) {
        if (b.source === 'db') b.source = dbSourceLabel;
        if (!b.provenance) b.provenance = 'OCA';
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, serviceTitle, `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        vespersDate,
        serviceType:      calendarEntry.vespers?.serviceType || 'greatVespers',
        serviceName:      serviceTitle,
        tone,
        season,
        liturgicalLabel,
        commemorations,
        blocks,
      }));
      })().catch(err => {
        console.error('/api/service async error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/education-modules') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load education modules.' }));
      }

    } else if (pathname === '/api/education-modules-vespers') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules-vespers.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load vespers education modules.' }));
      }

    } else if (pathname === '/api/translations') {
      // Lists every available translation overlay with its manifest summary.
      // Front-end uses this to build the settings-panel picker.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        default: process.env.LITURGY_TRANSLATION || null,
        translations: getTranslationManifests(),
      }));

    } else if (pathname.startsWith('/api/translations/') && pathname.endsWith('/diff')) {
      // Returns the merged-vs-base diff for an overlay. Useful for confirming
      // overrides took effect and (during STS population) for cataloguing
      // which keys an overlay touches.
      // Path: /api/translations/<id>/diff?service=liturgy
      const id = pathname.slice('/api/translations/'.length, -'/diff'.length);
      const q = parseQuery(url);
      const service = (q.service || 'liturgy').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!fixedTextRegistry[service]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown service '${service}'. Available: ${Object.keys(fixedTextRegistry).join(', ')}` }));
        return;
      }
      const diffs = diffOverlay(service, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        overlay: id,
        service,
        count: diffs.length,
        diffs,
      }));

    } else if (pathname === '/api/liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isLiturgyServed(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No Divine Liturgy is served on this date.', date }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No liturgy available for this date.', date }));
          return;
        }

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getLiturgyFixed(translation);

        let blocks;
        try {
          blocks = assembleLiturgy(calendarEntry, liturgyFixedResolved, sources);
        } catch (err) {
          console.error('assembleLiturgy error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks whose text came from the active overlay (must happen
        // BEFORE pronoun substitution, which would change the strings and
        // defeat the match).
        tagBlocksWithOverlay(blocks, 'liturgy', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        let commemorations  = calendarEntry.commemorations || [];
        if (commemorations.length === 0) {
          const [, mm, dd] = date.split('-').map(Number);
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            commemorations = dayList.commemorations.map((title, i) => ({
              title,
              isPrincipal: i === 0,
              tone: null,
              hasStichera: false,
            }));
          }
        }

        const variantName = calendarEntry.liturgy.variant === 'basil'
          ? 'Liturgy of St. Basil the Great'
          : 'Liturgy of St. John Chrysostom';
        const serviceName = `Divine Liturgy — ${variantName}`;

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, serviceName, `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'liturgy',
          serviceName,
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Liturgy route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/presanctified') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isPresanctifiedDay(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'The Liturgy of the Presanctified Gifts is not served on this date.',
            date,
          }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No calendar entry for this date.', date }));
          return;
        }

        // Enrich prokeimenon entries with pericopes from orthocal API
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0 && calendarEntry.vespers?.prokeimenon?.entries) {
            const entries = calendarEntry.vespers.prokeimenon.entries.map(e => {
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            calendarEntry = {
              ...calendarEntry,
              vespers: {
                ...calendarEntry.vespers,
                prokeimenon: { ...calendarEntry.vespers.prokeimenon, entries },
              },
            };
          }
        } catch (err) {
          console.warn('Presanctified: orthocal pericope fetch failed (non-fatal):', err.message);
        }

        // Inject DB-sourced variable texts
        const dbSource = buildDbSource(date, pronoun);
        const assemblerSources = { ...sources, db: dbSource };

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getOverlayFixed('liturgy', translation);
        const presanctifiedFixedResolved = getOverlayFixed('presanctified', translation);

        let blocks;
        try {
          blocks = assemblePresanctified(calendarEntry, fixedTexts, liturgyFixedResolved, presanctifiedFixedResolved, assemblerSources);
        } catch (err) {
          console.error('assemblePresanctified error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks from overlay overrides (both liturgy and presanctified
        // bases, since Presanctified borrows from both). Must run before
        // pronoun substitution.
        tagBlocksWithOverlay(blocks, 'liturgy', translation);
        tagBlocksWithOverlay(blocks, 'presanctified', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        const commemorations  = calendarEntry.commemorations || [];

        // Relabel 'db' source
        for (const b of blocks) {
          if (b.source === 'db') b.source = 'triodion';
          if (!b.provenance) b.provenance = 'OCA';
        }

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, 'Liturgy of the Presanctified Gifts', `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'presanctified',
          serviceName:    'Liturgy of the Presanctified Gifts',
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Presanctified route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/bridegroom-matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isBridegroomMatins(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bridegroom Matins is only served on the evenings of Palm Sunday through Holy Wednesday.',
          date,
        }));
        return;
      }

      // API date = civil evening; content from NEXT liturgical day
      const nextDay = new Date(d);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const night = getDayOfWeek(nextDay);  // monday, tuesday, wednesday, or thursday
      const NIGHT_NAMES = {
        monday:    'Holy Monday',
        tuesday:   'Holy Tuesday',
        wednesday: 'Holy Wednesday',
        thursday:  'Great and Holy Thursday',
      };

      let blocks;
      try {
        blocks = assembleBridegroomMatins(bridegroomMatinsFixed, night);
      } catch (err) {
        console.error('assembleBridegroomMatins error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Bridegroom Matins', `${formatDate(date)} · ${NIGHT_NAMES[night] || 'Holy Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'bridegroom-matins',
        serviceName:    'Bridegroom Matins',
        season:         'holyWeek',
        liturgicalLabel: NIGHT_NAMES[night] || 'Holy Week',
        blocks,
      }));

    } else if (pathname === '/api/matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      const d      = new Date(date + 'T12:00:00Z');
      const dow    = getDayOfWeek(d);
      const season = getLiturgicalSeason(d);
      const tone   = getTone(d);

      // ── Bright Week: Matins = Paschal Matins (Pascha through Bright Saturday) ──
      if (season === 'brightWeek') {
        let blocks;
        try {
          blocks = assemblePaschalMatins(paschalMatinsFixed);
        } catch (err) {
          console.error('assemblePaschalMatins error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }
        if (format === 'html') {
          renderServiceHTML(res, blocks, 'Paschal Matins', formatDate(date), pronoun);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType: 'matins',
          serviceName: 'Paschal Matins',
          season,
          blocks,
        }));
        return;
      }

      // Build the matins spec from available data
      const matinsSpec = buildMatinsSpec(date, d, dow, season, tone);

      // Enrich Matins Gospel with full scripture text from orthocal API
      if (matinsSpec?.gospel && !matinsSpec.gospel.text) {
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const matinsReading = (orthocalData.readings || []).find(
            r => r.source && r.source.includes('Matins Gospel')
          );
          if (matinsReading?.passage?.length) {
            matinsSpec.gospel.text = matinsReading.passage.map(v => v.content).join('\n\n');
            matinsSpec.gospel._source = 'orthocal';
          }
        } catch (err) {
          console.warn('Matins gospel enrichment failed (non-fatal):', err.message);
        }
      }

      if (!matinsSpec) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No Matins data available for this date. Currently supported: Sundays (all tones) and great feasts with menaion data.',
          date,
        }));
        return;
      }

      const calendarDay = {
        date,
        dayOfWeek: dow,
        liturgicalContext: { season, tone },
        matins: matinsSpec,
      };

      let blocks;
      try {
        blocks = assembleMatins(calendarDay, matinsFixed, fixedTexts, sources);
      } catch (err) {
        console.error('assembleMatins error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, 'Matins (Orthros)', `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'matins',
        serviceName:    'Matins (Orthros)',
        tone,
        season,
        blocks,
      }));
      })();

    } else if (pathname === '/api/passion-gospels') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isPassionGospelsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Service of the Twelve Passion Gospels is only served on Great Thursday evening.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePassionGospels(passionGospelsFixed);
      } catch (err) {
        console.error('assemblePassionGospels error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Twelve Passion Gospels', `${formatDate(date)} · Great and Holy Thursday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'passion-gospels',
        serviceName:    'The Twelve Passion Gospels',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Thursday',
        blocks,
      }));

    } else if (pathname === '/api/royal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isRoyalHoursDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Royal Hours are only served on the morning of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleRoyalHours(royalHoursFixed);
      } catch (err) {
        console.error('assembleRoyalHours error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Royal Hours of Great Friday', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'royalHours',
        serviceName:    'Royal Hours of Great Friday',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/lamentations') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isLamentationsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Lamentations service is only served on the evening of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleLamentations(lamentationsFixed, fixedTexts);
      } catch (err) {
        console.error('assembleLamentations error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Lamentations', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'lamentations',
        serviceName:    'The Lamentations',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/vesperal-liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isVesperalLiturgyDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Vesperal Liturgy of St. Basil is only served on Great Saturday morning.',
          date,
        }));
        return;
      }

      const translation = resolveTranslation(q);
      const liturgyFixedResolved = getLiturgyFixed(translation);

      let blocks;
      try {
        blocks = assembleVesperalLiturgy(vesperalLiturgyFixed, fixedTexts, liturgyFixedResolved);
      } catch (err) {
        console.error('assembleVesperalLiturgy error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Vesperal Liturgy of St. Basil', `${formatDate(date)} · Great and Holy Saturday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'vesperal-liturgy',
        serviceName:    'Vesperal Liturgy of St. Basil',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Saturday',
        blocks,
      }));

    } else if (pathname === '/api/paschal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const season = getLiturgicalSeason(d);
      if (season !== 'brightWeek') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Paschal Hours are only served during Bright Week (Pascha through Bright Saturday).',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePaschalHours(paschalHoursFixed);
      } catch (err) {
        console.error('assemblePaschalHours error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      const dow = getDayOfWeek(d);
      const NAMES = {
        sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
        wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
        friday: 'Bright Friday', saturday: 'Bright Saturday',
      };

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Paschal Hours', `${formatDate(date)} · ${NAMES[dow] || 'Bright Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'paschal-hours',
        serviceName:    'The Paschal Hours',
        season:         'brightWeek',
        liturgicalLabel: NAMES[dow] || 'Bright Week',
        blocks,
      }));

    } else if (pathname === '/api/pascha-collection') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const isPaschaDay = d.getUTCFullYear() === pascha.getUTCFullYear()
        && d.getUTCMonth() === pascha.getUTCMonth()
        && d.getUTCDate() === pascha.getUTCDate();

      if (!isPaschaDay) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Holy Pascha Collection is only available on Pascha Sunday.',
          date,
        }));
        return;
      }

      (async () => {
        try {
          const allBlocks = [];
          const serviceTitle = (n, title) => ({
            id: `pascha-title-${n}`,
            section: title,
            type: 'rubric',
            speaker: null,
            text: title,
            label: 'service-title',
          });

          // Each sub-service assembler uses its own id namespace (e.g. multiple
          // `dis-amen` blocks), so prefix per-service ids when bundling.
          const namespace = (prefix, blocks) =>
            blocks.map(b => b.id ? { ...b, id: `${prefix}-${b.id}` } : b);

          // ── Part 1: Midnight Office ──
          allBlocks.push(serviceTitle(1, 'The Midnight Office'));
          const moBlocks = assembleMidnightOffice(midnightOfficeFixed);
          allBlocks.push(...namespace('mo', moBlocks));

          // ── Part 2: Paschal Matins ──
          allBlocks.push(serviceTitle(2, 'Paschal Matins'));
          const matinsBlocks = assemblePaschalMatins(paschalMatinsFixed);
          allBlocks.push(...namespace('pm', matinsBlocks));

          // ── Part 3: Paschal Hours ──
          allBlocks.push(serviceTitle(3, 'The Paschal Hours'));
          const hoursBlocks = assemblePaschalHours(paschalHoursFixed);
          allBlocks.push(...namespace('ph', hoursBlocks));

          // ── Part 4: Paschal Liturgy ──
          allBlocks.push(serviceTitle(4, 'The Paschal Divine Liturgy'));
          let calendarEntry = getCalendarEntry(date);
          if (calendarEntry && !calendarEntry.liturgy) {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          }
          if (calendarEntry?.liturgy) {
            const litBlocks = assembleLiturgy(calendarEntry, getLiturgyFixed(resolveTranslation(q)), sources);
            allBlocks.push(...namespace('pl', litBlocks));
          }

          // Pronoun switching
          if (pronoun === 'yy') {
            for (const block of allBlocks) {
              if (block.text)  block.text  = applyYouYour(block.text);
              if (block.label) block.label = applyYouYour(block.label);
            }
          }

          if (format === 'html') {
            renderServiceHTML(res, allBlocks, 'Holy Pascha Collection', `${formatDate(date)} · The Holy Pascha`, pronoun);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            serviceType:     'pascha-collection',
            serviceName:     'Holy Pascha Collection',
            season:          'brightWeek',
            liturgicalLabel: 'The Holy Pascha — Resurrection of Christ',
            blocks:          allBlocks,
          }));
        } catch (err) {
          console.error('pascha-collection error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

    } else if (pathname === '/api/choir-prep') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      // Determine available services (same logic as /api/days, single date)
      const d = new Date(date + 'T12:00:00Z');
      const [, mm, dd] = date.split('-').map(Number);
      const dowIdx = d.getUTCDay();
      const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];
      const entry  = getCalendarEntry(date);
      const season = entry ? (entry.liturgicalContext?.season || null) : null;
      const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
      const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

      // Feast + commemorations
      let commemorations = [];
      try {
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) commemorations = dayList.commemorations;
      } catch (_) {}

      const svcMap = {
        greatVespers:    { key: 'greatVespers',    name: 'Great Vespers',                  endpoint: '/api/service' },
        dailyVespers:    { key: 'dailyVespers',    name: 'Daily Vespers',                  endpoint: '/api/service' },
        matins:          { key: 'matins',           name: 'Matins',                         endpoint: '/api/matins' },
        liturgy:         { key: 'liturgy',          name: 'Divine Liturgy',                 endpoint: '/api/liturgy' },
        presanctified:   { key: 'presanctified',    name: 'Presanctified Liturgy',          endpoint: '/api/presanctified' },
        bridegroomMatins:{ key: 'bridegroomMatins', name: 'Bridegroom Matins',              endpoint: '/api/bridegroom-matins' },
        passionGospels:  { key: 'passionGospels',   name: 'Twelve Passion Gospels',         endpoint: '/api/passion-gospels' },
        royalHours:      { key: 'royalHours',       name: 'Royal Hours',                    endpoint: '/api/royal-hours' },
        lamentations:    { key: 'lamentations',     name: 'The Lamentations',               endpoint: '/api/lamentations' },
        vesperalLiturgy: { key: 'vesperalLiturgy',  name: 'Vesperal Liturgy of St. Basil',  endpoint: '/api/vesperal-liturgy' },
        paschalHours:    { key: 'paschalHours',      name: 'Paschal Hours',                  endpoint: '/api/paschal-hours' },
        paschaCollection:{ key: 'paschaCollection',  name: 'Holy Pascha Collection',         endpoint: '/api/pascha-collection' },
      };

      // Build available services list
      // Vespers date-shift: vespers served this evening belongs to tomorrow
      const vespersEntry = getCalendarEntry(getNextDateStr(date));
      const available = {
        greatVespers:    vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
        dailyVespers:    vespersEntry?.vespers?.serviceType === 'dailyVespers',
        bridegroomMatins: isBridegroomMatins(d),
        lamentations:    isLamentationsDay(d),
        vesperalLiturgy: isVesperalLiturgyDay(d),
        royalHours:      isRoyalHoursDay(d),
        passionGospels:  isPassionGospelsDay(d),
        matins:          !!buildMatinsSpec(date, d, dowStr, season, getTone(d)),
        liturgy:         !!(entry?.liturgy) || isLiturgyServed(d),
        presanctified:   isPresanctifiedDay(d),
        paschalHours:    getLiturgicalSeason(d) === 'brightWeek',
        paschaCollection: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          return d.getUTCMonth() === p.getUTCMonth() && d.getUTCDate() === p.getUTCDate();
        })(),
      };

      const toFetch = Object.entries(available)
        .filter(([, avail]) => avail)
        .map(([key]) => svcMap[key])
        .filter(Boolean);

      // Fetch each service via internal HTTP requests. Thread the translation
      // overlay through so all inner Liturgy/Vespers/etc. requests see it.
      const translation = resolveTranslation(q);
      const translationSuffix = translation ? `&translation=${encodeURIComponent(translation)}` : '';
      const fetchInternal = (endpoint, dateStr, pron) => new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}${endpoint}?date=${dateStr}&pronoun=${pron}${translationSuffix}`;
        http.get(url, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
            try {
              if (resp.statusCode === 200) resolve(JSON.parse(body));
              else resolve(null);
            } catch (e) { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });

      (async () => {
        try {
          const results = await Promise.all(
            toFetch.map(svc => fetchInternal(svc.endpoint, date, pronoun))
          );

          const services = [];
          for (let i = 0; i < toFetch.length; i++) {
            const data = results[i];
            if (!data || !data.blocks) continue;
            services.push({
              type: toFetch[i].key,
              name: data.serviceName || toFetch[i].name,
              blocks: data.blocks,
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            tone,
            season,
            liturgicalLabel,
            commemorations,
            services,
          }));
        } catch (err) {
          console.error('/api/choir-prep error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

    } else if (pathname === '/api/days') {
      const q    = parseQuery(url);
      const from = (q.from || '').trim();
      const to   = (q.to   || '').trim();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid from/to parameters.' }));
        return;
      }

      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      const startDate = new Date(Date.UTC(fy, fm - 1, fd));
      const endDate   = new Date(Date.UTC(ty, tm - 1, td));

      if (endDate < startDate) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '"to" must be on or after "from".' }));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const MONTH_NAMES_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
      const DOW_NAMES_UPPER  = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
      const DAY_MS_LOCAL     = 24 * 60 * 60 * 1000;

      const result = [];
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const dateStr = cur.toISOString().slice(0, 10);
        const [, mm, dd] = dateStr.split('-').map(Number);
        const dowIdx  = cur.getUTCDay();
        const dowStr  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

        // Get calendar entry (cheap — no assembly)
        const entry  = getCalendarEntry(dateStr);
        const season = entry ? (entry.liturgicalContext?.season || null) : null;
        const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
        const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

        // Vespers date-shift: vespers served on this evening belongs to
        // the *next* liturgical day, so look up tomorrow's calendar entry.
        const vespersDateStr = getNextDateStr(dateStr);
        const vespersEntry   = getCalendarEntry(vespersDateStr);

        // Feast + commemorations list from Menaion DB
        let feast = null;
        let commemorations = [];
        try {
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            feast          = dayList.principal;
            commemorations = dayList.commemorations;
          }
        } catch (_) {}

        const services = {
          greatVespers: vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
          dailyVespers: vespersEntry?.vespers?.serviceType === 'dailyVespers',
          allNightVigil: vespersEntry?.vespers?.serviceType === 'all-night-vigil',
          burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
          lamentations: isLamentationsDay(cur),
          vesperalLiturgy: isVesperalLiturgyDay(cur),
          royalHours: isRoyalHoursDay(cur),
          passionGospels: isPassionGospelsDay(cur),
          matins:  !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur)),
          liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
          presanctified: isPresanctifiedDay(cur),
          paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
          paschaCollection: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
          })(),
        };

        result.push({
          date:           dateStr,
          dayOfWeek:      dowStr,
          displayDay:     DOW_NAMES_UPPER[dowIdx],
          displayDate:    `${MONTH_NAMES_FULL[mm - 1]} ${dd}`,
          isToday:        dateStr === today,
          season,
          tone,
          feast,
          commemorations,
          liturgicalLabel,
          services,
        });

        cur = new Date(cur.getTime() + DAY_MS_LOCAL);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/api/search') {
      const q = parseQuery(url);
      const query = (q.q || '').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }

      let results = [];
      try {
        const db = openDb();
        if (db) {
          // Find matching commemorations, deduplicate by title across months
          const rows = db.prepare(`
            SELECT id, month, day, title, rank
            FROM commemorations
            WHERE title LIKE ?
            ORDER BY rank DESC, month, day
            LIMIT 40
          `).all(`%${query}%`);

          // Compute 2026 date and check service availability
          const seen = new Set();
          for (const row of rows) {
            const key = row.title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const mm = String(row.month).padStart(2, '0');
            const dd = String(row.day).padStart(2, '0');
            // Find the nearest upcoming Saturday on or after this calendar date in 2026
            // that falls within a Saturday window, or just use the calendar date
            const dateStr = `2026-${mm}-${dd}`;
            // Find what Saturday this day falls on (Vespers is on Saturday)
            const date = new Date(`${dateStr}T12:00:00`);
            const dow = date.getDay(); // 0=Sun
            // For search results, show the calendar date; Great Vespers is Saturday night
            // so if the feast is on a Sunday, Vespers is Saturday night before (subtract 1 day)
            let serviceDate = dateStr;
            if (dow === 0) {
              // Sunday feast — Vespers was Saturday evening
              const sat = new Date(date);
              sat.setDate(sat.getDate() - 1);
              serviceDate = sat.toISOString().slice(0, 10);
            }

            const entry = getCalendarEntry(serviceDate);
            const svcType = entry?.vespers?.serviceType || null;
            const hasService = !!(svcType);

            results.push({
              id:          serviceDate,
              title:       row.title,
              dateStr:     serviceDate,
              svcType:     svcType || 'greatVespers',
              displayDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
              available:   hasService,
            });
          }
        }
      } catch (err) {
        console.error('/api/search error:', err);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));

    } else if (pathname === '/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      // Vespers date-shift: content belongs to the next liturgical day
      const vespersDate = getNextDateStr(date);

      // Try assembleForDate first
      let assembleResult;
      try {
        assembleResult = assembleForDate(vespersDate, pronoun);
      } catch (err) {
        console.error('Assembly error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`Assembly error: ${err.message}`));
        return;
      }

      if (!assembleResult) {
        // Fall back to DB-collected texts (variable sections only)
        const dbBlocks = getDbBlocks(date, pronoun);
        if (dbBlocks.length > 0) {
          const blocks = mapDbBlocks(dbBlocks);
          const html = renderVespers(blocks, {
            title: 'Vespers (Collected Texts)',
            date:  formatDate(date),
          });
          const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
          const notice = `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#e8f4fb;border-bottom:1px solid #a0c8e0;color:#1a4a6a;">
  ℹ Showing collected variable texts only — fixed liturgy (litanies, psalms, prayers) not yet available for this season.
</div>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html.replace('<body>', '<body>' + backBar + notice));
          return;
        }

        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const season  = getLiturgicalSeason(dateObj);
        const dow     = getDayOfWeek(dateObj);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(
          `No service available for ${formatDate(date)}.`,
          `This is a ${dow} in the ${season} season. ` +
          `Automatic generation is currently supported for Saturdays in ordinary time only. ` +
          `Add a hand-authored calendar file to support this date.`
        ));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = assembleResult;
      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const isGenerated  = calendarEntry._meta?.generated;
      const toneLabel    = tone ? ` · Tone ${tone}` : '';

      const html = renderVespers(blocks, {
        title: serviceTitle,
        date:  `${formatDate(date)}${toneLabel}${pronounLabel}`,
      });

      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;

      // Format assembly warnings into human-readable messages
      const rawWarnings = blocks._warnings || [];
      const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
      const uniqueWarnings = [...new Set(warningMessages)];

      const warningBanner = uniqueWarnings.length > 0
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
             <strong>⚠ Some portions of this service are incomplete:</strong>
             <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
           </div>`
        : '';

      const injected = html.replace('<body>', '<body>' + backBar + warningBanner);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);

    } else if (/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getSticheraDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No stichera found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getMenaionDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No commemorations found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (pathname === '/api/dashboard') {
      const q    = parseQuery(url);
      const year = parseInt(q.year, 10) || 2026;

      res.setHeader('Access-Control-Allow-Origin', '*');

      const result = buildDashboardData(year);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/dashboard') {
      serveStatic(res, path.join(__dirname, 'public', 'dashboard.html'), 'text/html');

    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Internal error: ${err.message}`));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
