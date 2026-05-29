/**
 * data-validators.js
 *
 * Light-weight runtime validators for the JSON data files in
 * variable-sources/. Called at server startup so missing or mistyped
 * fields fail loud rather than producing silently-broken services.
 *
 * These are intentionally not full JSON Schema — they only check the
 * fields the assembler actually reads. Add a check when a new required
 * field is introduced; don't try to be exhaustive.
 */

'use strict';

function isString(v) { return typeof v === 'string' && v.length > 0; }
function isNumber(v) { return typeof v === 'number' && Number.isFinite(v); }
function isObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function isArrayOf(v, pred) { return Array.isArray(v) && v.every(pred); }

function pushIf(errs, cond, msg) { if (!cond) errs.push(msg); }

// ── Shared shapes ────────────────────────────────────────────────────────────

function checkTroparion(t, at, errs) {
  pushIf(errs, isObject(t),           `${at} must be object`);
  if (!isObject(t)) return;
  pushIf(errs, isNumber(t.tone),      `${at}.tone must be number`);
  pushIf(errs, isString(t.text),      `${at}.text must be non-empty string`);
}

function checkProkeimenon(p, at, errs) {
  pushIf(errs, isObject(p),           `${at} must be object`);
  if (!isObject(p)) return;
  pushIf(errs, isNumber(p.tone),      `${at}.tone must be number`);
  pushIf(errs, isString(p.refrain),   `${at}.refrain must be non-empty string`);
}

function checkAlleluia(a, at, errs) {
  pushIf(errs, isObject(a),           `${at} must be object`);
  if (!isObject(a)) return;
  pushIf(errs, isNumber(a.tone),      `${at}.tone must be number`);
  pushIf(errs, isArrayOf(a.verses, isString), `${at}.verses must be array of strings`);
}

// ── great-feast-variants.json ────────────────────────────────────────────────

function validateGreatFeastVariants(data) {
  const errs = [];
  for (const [key, feast] of Object.entries(data)) {
    if (key === '_meta') continue;
    const at = `great-feast-variants.${key}`;
    pushIf(errs, ['lord','theotokos'].includes(feast.type),
      `${at}.type must be 'lord' or 'theotokos', got ${JSON.stringify(feast.type)}`);
    pushIf(errs, isString(feast.label),         `${at}.label required`);
    pushIf(errs, isString(feast.entranceHymn) || feast.type === 'theotokos',
      `${at}.entranceHymn required for feasts of the Lord`);
    pushIf(errs, isString(feast.megalynarion),  `${at}.megalynarion required`);
    pushIf(errs, isString(feast.communionHymn), `${at}.communionHymn required`);
    pushIf(errs, Array.isArray(feast.troparia) && feast.troparia.length > 0,
      `${at}.troparia must be non-empty array`);
    pushIf(errs, Array.isArray(feast.kontakia) && feast.kontakia.length > 0,
      `${at}.kontakia must be non-empty array`);
    (feast.troparia || []).forEach((t, i) => checkTroparion(t, `${at}.troparia[${i}]`, errs));
    (feast.kontakia || []).forEach((k, i) => checkTroparion(k, `${at}.kontakia[${i}]`, errs));
    if (feast.prokeimenon) checkProkeimenon(feast.prokeimenon, `${at}.prokeimenon`, errs);
    if (feast.alleluia)    checkAlleluia(feast.alleluia,       `${at}.alleluia`,    errs);
    if (feast.type === 'lord' && feast.antiphons) {
      for (const slot of ['first','second','third']) {
        const ant = feast.antiphons[slot];
        pushIf(errs, isObject(ant),                           `${at}.antiphons.${slot} required`);
        if (!isObject(ant)) continue;
        pushIf(errs, isString(ant.refrain),                   `${at}.antiphons.${slot}.refrain required`);
        pushIf(errs, isArrayOf(ant.verses, isString),         `${at}.antiphons.${slot}.verses must be array of strings`);
      }
    }
  }
  return errs;
}

// ── pentecostarion-sunday-overrides.json ─────────────────────────────────────

function validatePentecostarionOverrides(data) {
  const errs = [];
  for (const [key, entry] of Object.entries(data)) {
    if (key === '_meta') continue;
    const at = `pentecostarion-sunday-overrides.${key}`;
    pushIf(errs, /^[0-9]+$/.test(key), `${at} key must be numeric days-since-Pascha`);
    // "weHaveSeen-only" form (Pentecost, key=49)
    if (Object.keys(entry).length === 1 && isString(entry.weHaveSeen)) continue;
    // Full feast form
    pushIf(errs, entry.feastOnly === true,           `${at}.feastOnly must be true`);
    pushIf(errs, Array.isArray(entry.troparia) && entry.troparia.length > 0,
      `${at}.troparia must be non-empty array`);
    pushIf(errs, Array.isArray(entry.kontakia) && entry.kontakia.length > 0,
      `${at}.kontakia must be non-empty array`);
    pushIf(errs, isString(entry.communionHymn),      `${at}.communionHymn required`);
    (entry.troparia || []).forEach((t, i) => checkTroparion(t, `${at}.troparia[${i}]`, errs));
    (entry.kontakia || []).forEach((k, i) => checkTroparion(k, `${at}.kontakia[${i}]`, errs));
    if (entry.prokeimenon) checkProkeimenon(entry.prokeimenon, `${at}.prokeimenon`, errs);
    if (entry.alleluia)    checkAlleluia(entry.alleluia,       `${at}.alleluia`,    errs);
  }
  return errs;
}

// ── cocelebrated-overlays.json ───────────────────────────────────────────────

function validateCocelebratedOverlays(data) {
  const errs = [];
  for (const [key, entry] of Object.entries(data)) {
    if (key === '_meta') continue;
    const at = `cocelebrated-overlays.${key}`;
    pushIf(errs, /^\d{1,2}-\d{1,2}$/.test(key), `${at} key must be "M-D" date string`);
    pushIf(errs, isObject(entry), `${at} must be object`);
    if (!isObject(entry)) continue;
    if (entry.troparion)   checkTroparion(entry.troparion,   `${at}.troparion`,   errs);
    if (entry.kontakion)   checkTroparion(entry.kontakion,   `${at}.kontakion`,   errs);
    if (entry.prokeimenon) checkProkeimenon(entry.prokeimenon, `${at}.prokeimenon`, errs);
    if (entry.alleluia)    checkAlleluia(entry.alleluia,     `${at}.alleluia`,    errs);
  }
  return errs;
}

// ── Driver ───────────────────────────────────────────────────────────────────

/**
 * Validate all loaded data objects and throw with a combined error message
 * if any check fails. Call once at server startup; emit results to stderr.
 */
function validateAll(loaded) {
  const all = [];
  if (loaded.greatFeastVariants)
    all.push(...validateGreatFeastVariants(loaded.greatFeastVariants));
  if (loaded.pentecostarionOverrides)
    all.push(...validatePentecostarionOverrides(loaded.pentecostarionOverrides));
  if (loaded.cocelebratedOverlays)
    all.push(...validateCocelebratedOverlays(loaded.cocelebratedOverlays));
  if (all.length > 0) {
    throw new Error('Data file validation failed:\n  - ' + all.join('\n  - '));
  }
}

module.exports = {
  validateAll,
  validateGreatFeastVariants,
  validatePentecostarionOverrides,
  validateCocelebratedOverlays,
};
