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

// ── daily-propers.json ───────────────────────────────────────────────────────

const DOW_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function validateDailyPropers(data) {
  const errs = [];

  function checkDayMap(map, fieldName, valueCheck) {
    if (!isObject(map)) { errs.push(`daily-propers.${fieldName} must be object`); return; }
    for (const dow of DOW_KEYS) {
      // saturday absent from weekdayProkeimena/Alleluia is fine (covered by tone)
      // sunday absent from weekday maps is fine (covered by tone)
      if (map[dow] === undefined) continue;
      valueCheck(map[dow], `daily-propers.${fieldName}.${dow}`, errs);
    }
  }

  function checkToneMap(map, fieldName, valueCheck) {
    if (!isObject(map)) { errs.push(`daily-propers.${fieldName} must be object`); return; }
    for (let t = 1; t <= 8; t++) {
      if (map[t] === undefined) { errs.push(`daily-propers.${fieldName}.${t} missing`); continue; }
      valueCheck(map[t], `daily-propers.${fieldName}.${t}`, errs);
    }
  }

  pushIf(errs, isObject(data.dayPatrons),     'daily-propers.dayPatrons must be object');
  pushIf(errs, isObject(data.communionHymns), 'daily-propers.communionHymns must be object');
  for (const dow of DOW_KEYS) {
    pushIf(errs, isString(data.dayPatrons?.[dow]),     `daily-propers.dayPatrons.${dow} required`);
    pushIf(errs, isString(data.communionHymns?.[dow]), `daily-propers.communionHymns.${dow} required`);
  }

  // Sunday Prokeimena/Alleluia: tone is implicit in the key (1-8), not in the value.
  checkToneMap(data.sundayProkeimena, 'sundayProkeimena', (v, at, e) => {
    pushIf(e, isObject(v) && isString(v.refrain) && isString(v.verse),
      `${at} must have {refrain, verse}`);
  });
  checkToneMap(data.sundayAlleluia,   'sundayAlleluia',   (v, at, e) => {
    pushIf(e, isArrayOf(v, isString) && v.length >= 2, `${at} must be array of >=2 verse strings`);
  });

  checkDayMap(data.weekdayProkeimena, 'weekdayProkeimena', checkProkeimenon);
  checkDayMap(data.weekdayAlleluia,   'weekdayAlleluia',   (v, at, e) => checkAlleluia(v, at, e));

  // Lenten maps: keys are mix of strings ('meatfare', 'cheesefare') and integers (1-5)
  for (const map of [
    { name: 'lentenSundayProkeimena', obj: data.lentenSundayProkeimena, check: checkProkeimenon },
    { name: 'lentenSundayAlleluia',   obj: data.lentenSundayAlleluia,   check: checkAlleluia },
  ]) {
    if (!isObject(map.obj)) { errs.push(`daily-propers.${map.name} must be object`); continue; }
    for (const [k, v] of Object.entries(map.obj)) {
      map.check(v, `daily-propers.${map.name}.${k}`, errs);
    }
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

// ── liturgy-defaults.json ────────────────────────────────────────────────────

function validateLiturgyDefaults(data) {
  const errs = [];
  const at = 'liturgy-defaults';
  pushIf(errs, isObject(data.entranceHymn),                       `${at}.entranceHymn must be object`);
  if (isObject(data.entranceHymn)) {
    pushIf(errs, isString(data.entranceHymn.resurrection),        `${at}.entranceHymn.resurrection required`);
    pushIf(errs, isString(data.entranceHymn.saints),              `${at}.entranceHymn.saints required`);
  }
  pushIf(errs, isString(data.paschalMegalynarion),                `${at}.paschalMegalynarion required`);
  pushIf(errs, isObject(data.weHaveSeenSubstitutions),            `${at}.weHaveSeenSubstitutions must be object`);
  if (isObject(data.weHaveSeenSubstitutions)) {
    pushIf(errs, isString(data.weHaveSeenSubstitutions.ascensionAfterfeast),
      `${at}.weHaveSeenSubstitutions.ascensionAfterfeast required`);
    pushIf(errs, isString(data.weHaveSeenSubstitutions.pentecostAfterfeast),
      `${at}.weHaveSeenSubstitutions.pentecostAfterfeast required`);
  }
  return errs;
}

// ── liturgical-day-labels.json ───────────────────────────────────────────────

function validateLiturgicalDayLabels(data) {
  const errs = [];
  const at = 'liturgical-day-labels';
  // All six maps must be present and have string values for every key.
  const required = ['lentenSundays','preLentenSundays','holyWeek','brightWeek',
                    'pentecostarionFeasts','bridegroomMatinsNights'];
  for (const k of required) {
    pushIf(errs, isObject(data[k]), `${at}.${k} must be object`);
    if (!isObject(data[k])) continue;
    for (const [subKey, val] of Object.entries(data[k])) {
      pushIf(errs, isString(val), `${at}.${k}.${subKey} must be string`);
    }
  }
  // Lenten Sundays: keys must be 1-6
  if (isObject(data.lentenSundays)) {
    for (const k of Object.keys(data.lentenSundays)) {
      pushIf(errs, /^[1-6]$/.test(k), `${at}.lentenSundays key '${k}' must be 1-6`);
    }
  }
  // holyWeek and brightWeek: keys must be day-of-week
  for (const mapName of ['holyWeek','brightWeek']) {
    if (!isObject(data[mapName])) continue;
    for (const k of Object.keys(data[mapName])) {
      pushIf(errs, DOW_KEYS.includes(k), `${at}.${mapName} key '${k}' must be day-of-week`);
    }
  }
  return errs;
}

// ── variable-sources/menaion/*.json (great-feast files only) ─────────────────
//
// Validates the shape of feast-day menaion files when they carry a `matins`
// block. Files without a matins block (Soul Saturday, special saints) are
// not validated by this — they have their own shapes used elsewhere.

const REQUIRED_ODES = ['ode1','ode3','ode4','ode5','ode6','ode7','ode8','ode9'];

function checkCanonOde(ode, at, errs) {
  if (!isObject(ode)) { errs.push(`${at} must be object`); return; }
  pushIf(errs, isString(ode.irmos), `${at}.irmos required`);
  // katavasia is optional — some feasts use the irmos as its own katavasia
  if (ode.katavasia !== undefined) {
    pushIf(errs, isString(ode.katavasia), `${at}.katavasia must be string`);
  }
  if (ode.troparia !== undefined) {
    pushIf(errs, Array.isArray(ode.troparia), `${at}.troparia must be array`);
    if (Array.isArray(ode.troparia)) {
      ode.troparia.forEach((t, i) => {
        pushIf(errs, isObject(t),       `${at}.troparia[${i}] must be object`);
        if (!isObject(t)) return;
        pushIf(errs, isString(t.text),  `${at}.troparia[${i}].text required`);
      });
    }
  }
}

function checkLauds(lauds, at, errs) {
  if (!isObject(lauds)) { errs.push(`${at} must be object`); return; }
  // tone is optional (some feast lauds omit it; the per-sticheron tone is used)
  pushIf(errs, Array.isArray(lauds.stichera) && lauds.stichera.length >= 1,
    `${at}.stichera must be non-empty array`);
  (lauds.stichera || []).forEach((s, i) => {
    pushIf(errs, isObject(s), `${at}.stichera[${i}] must be object`);
  });
}

function validateMenaionFeast(data, filename = 'menaion file') {
  const errs = [];
  const at = filename;

  // Files without a matins block are special-case (Soul Saturday, etc.) — skip.
  if (!isObject(data.matins)) return errs;

  // Top-level troparion/kontakion expected for great-feast files
  if (data.troparion !== undefined) checkTroparion(data.troparion, `${at}.troparion`, errs);
  if (data.kontakion !== undefined) checkTroparion(data.kontakion, `${at}.kontakion`, errs);

  const m = data.matins;
  const matinsAt = `${at}.matins`;

  // Doxology-rank services omit Polyeleos (and therefore the Polyeleos-
  // Magnification + Matins Prokeimenon + Gospel triplet). They keep canon,
  // lauds, Great Doxology, troparion-after-doxology.
  const isDoxologyRank = m._meta?.feastRank === 'doxology'
    || data._meta?.feastRank === 'doxology';

  // ── Polyeleios block (greatFeast/polyeleos only) ────────────────────────
  if (!isDoxologyRank) {
    pushIf(errs, isObject(m.magnification),                  `${matinsAt}.magnification required`);
  }
  if (isObject(m.magnification)) {
    pushIf(errs, isString(m.magnification.refrain),          `${matinsAt}.magnification.refrain required`);
    // Accept either `verses` (array of strings) or `psalmVerses` (array of {text, ref})
    const hasVerses      = isArrayOf(m.magnification.verses, isString);
    const hasPsalmVerses = Array.isArray(m.magnification.psalmVerses)
      && m.magnification.psalmVerses.every(v => isObject(v) && isString(v.text));
    pushIf(errs, hasVerses || hasPsalmVerses,
      `${matinsAt}.magnification must have either .verses (strings) or .psalmVerses ({text, ref})`);
  }

  // ── Prokeimenon (Matins prokeimenon — uses .refrain only, may have .verse) ─
  if (m.prokeimenon !== undefined) checkProkeimenon(m.prokeimenon, `${matinsAt}.prokeimenon`, errs);
  else if (!isDoxologyRank) errs.push(`${matinsAt}.prokeimenon required`);

  // ── Gospel ───────────────────────────────────────────────────────────────
  if (!isDoxologyRank) {
    pushIf(errs, isObject(m.gospel),                         `${matinsAt}.gospel required`);
  }
  if (isObject(m.gospel)) {
    pushIf(errs, isString(m.gospel.reading),                 `${matinsAt}.gospel.reading required`);
  }

  // ── Canon ────────────────────────────────────────────────────────────────
  pushIf(errs, isObject(m.canon),                            `${matinsAt}.canon required`);
  if (isObject(m.canon)) {
    pushIf(errs, isNumber(m.canon.tone),                     `${matinsAt}.canon.tone required`);
    for (const odeKey of REQUIRED_ODES) {
      // Some feasts may omit specific odes; warn only if all odes are missing
    }
    let presentOdes = 0;
    for (const odeKey of REQUIRED_ODES) {
      if (m.canon[odeKey] !== undefined) {
        presentOdes++;
        checkCanonOde(m.canon[odeKey], `${matinsAt}.canon.${odeKey}`, errs);
      }
    }
    pushIf(errs, presentOdes >= 6,
      `${matinsAt}.canon must include at least 6 of ode1/3/4/5/6/7/8/9 (got ${presentOdes})`);
  }

  // ── Lauds ────────────────────────────────────────────────────────────────
  if (m.lauds !== undefined) checkLauds(m.lauds, `${matinsAt}.lauds`, errs);

  // ── Optional sections ────────────────────────────────────────────────────
  if (m.sedalion !== undefined) {
    pushIf(errs, Array.isArray(m.sedalion), `${matinsAt}.sedalion must be array`);
  }
  if (m.exapostilarion !== undefined) {
    pushIf(errs, isObject(m.exapostilarion) && isString(m.exapostilarion.text),
      `${matinsAt}.exapostilarion.text required`);
  }
  if (m.exapostilaria !== undefined) {
    pushIf(errs, Array.isArray(m.exapostilaria), `${matinsAt}.exapostilaria must be array`);
  }
  if (m.troparionAfterDoxology !== undefined) {
    checkTroparion(m.troparionAfterDoxology, `${matinsAt}.troparionAfterDoxology`, errs);
  }
  if (m.postGospelSticheron !== undefined) {
    pushIf(errs, isObject(m.postGospelSticheron) && isString(m.postGospelSticheron.text),
      `${matinsAt}.postGospelSticheron.text required`);
  }

  return errs;
}

/**
 * Validates every menaion JSON in variable-sources/menaion/. Files without
 * a matins block are skipped (they have their own shape).
 */
function validateAllMenaionFeasts(menaionDir, fs, path) {
  const errs = [];
  for (const file of fs.readdirSync(menaionDir)) {
    if (!file.endsWith('.json')) continue;
    const fullPath = path.join(menaionDir, file);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    errs.push(...validateMenaionFeast(data, `menaion/${file}`));
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
  if (loaded.dailyPropers)
    all.push(...validateDailyPropers(loaded.dailyPropers));
  if (loaded.liturgicalDayLabels)
    all.push(...validateLiturgicalDayLabels(loaded.liturgicalDayLabels));
  if (loaded.liturgyDefaults)
    all.push(...validateLiturgyDefaults(loaded.liturgyDefaults));
  if (loaded.menaionDir) {
    const fs = require('fs');
    const path = require('path');
    all.push(...validateAllMenaionFeasts(loaded.menaionDir, fs, path));
  }
  if (all.length > 0) {
    throw new Error('Data file validation failed:\n  - ' + all.join('\n  - '));
  }
}

module.exports = {
  validateAll,
  validateGreatFeastVariants,
  validatePentecostarionOverrides,
  validateCocelebratedOverlays,
  validateDailyPropers,
  validateLiturgicalDayLabels,
  validateLiturgyDefaults,
  validateMenaionFeast,
  validateAllMenaionFeasts,
};
