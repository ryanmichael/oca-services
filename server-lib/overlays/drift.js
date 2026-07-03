'use strict';

const { loadOverlayManifest, listAvailableTranslations, validateManifest } = require('./manifest');

const baseKeySetCache = new WeakMap();

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

/** Validates the variant library at startup. Errors here are loud — a malformed
 *  library file is a contract violation (see fixed-texts/variant-library/CONTRACT.md)
 *  and means parish picks may silently fall back to default. Boot continues so the
 *  server can still answer /healthz with a useful failure mode. */
function validateVariantLibrary() {
  const { loadVariantLibrary } = require('../variants');
  try {
    const registry = loadVariantLibrary();
    const count = Object.keys(registry).length;
    const total = Object.values(registry).reduce((n, e) => n + e.all.length, 0);
    console.log(`Variant library: ${count} key(s), ${total} variant(s) loaded.`);
    return { ok: true, warnings: 0 };
  } catch (err) {
    console.error(`Variant library: load FAILED — ${err.message}`);
    return { ok: false, warnings: 1 };
  }
}

/** Validates parish_variant_picks references resolve in the library. No-op when
 *  the table doesn't exist (Phase 0; Phase 1+ has it). Each unresolved row is a
 *  silently-broken parish — warn loudly. */
function validateParishVariantPicks() {
  const { openDb } = require('../cache/sqlite');
  const { loadVariantLibrary, resolveVariant } = require('../variants');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_variant_picks'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const registry = loadVariantLibrary();
    const rows = db.prepare(
      'SELECT parish_id, variant_key, variant_id FROM parish_variant_picks'
    ).all();
    let warnings = 0;
    for (const row of rows) {
      if (!resolveVariant(registry, row.variant_key, row.variant_id)) {
        console.warn(
          `Parish '${row.parish_id}': variant pick '${row.variant_key}'='${row.variant_id}' does not resolve in library`
        );
        warnings += 1;
      }
    }
    if (warnings === 0 && rows.length > 0) {
      console.log(`Parish variant picks: ${rows.length} reference(s) all resolve.`);
    }
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Titles that are legitimately duplicated across multiple (month, day)
// tuples with identical troparia — e.g. a saint commemorated on both
// their repose date and a relic-translation date, using the same hymns.
//
// First-pass allowlist (2026-06-20): surfaced by initial drift sweep and
// triaged via orthocal cross-reference. Most are presumed legit dual-comms
// (relic translations, Marian icon multi-date cycle, OCA-Georgian saints
// without orthocal coverage). Aninas of Euphrates is the most-suspect for
// real drift — orthocal lists him only on 3-18 — but we allowlist pending
// OCA-source verification rather than risk deleting valid data.
// Each entry warrants a 1-minute OCA-source re-check at calendar rollover.
const DUPE_ALLOWLIST = new Set([
  'Icon of the Mother of God of Tolga',                    // 7-18 + 8-8: Marian icon multi-date
  'Venerable Aninas of the Euphrates',                     // 3-13 + 3-18: orthocal lists only 3-18; verify against OCA Service Book
  'New Martyr Theodore',                                   // 1-30 + 2-17: likely Russian new-martyr OCA cycle
  'Saint Martin the Merciful, Bishop of Tours',            // 10-12 + 11-11: Nov 11 = principal, Oct 12 = translation of relics
  'Venerable Mercurius the Faster of the Kiev Caves',      // 11-4 + 11-24: Kiev Caves cluster
  'Venerable Shio Mgvime',                                 // 2-9 + 3-3: Georgian saint, OCA-specific cycle
  'Venerable Theodora and her daughter Theopiste',         // 8-3 + 8-29: paired-saint commemoration
]);

// Max days between two duplicate-titled rows for the pair to be flagged as
// drift. Legit dual-commemorations (Marian icons, relic translations,
// prophets with multiple feasts) are typically months apart; drift bugs
// (saint accidentally typed onto an adjacent day) sit inside this window.
const DUPE_PROXIMITY_DAYS = 30;

/** Detects commemorations duplicated onto multiple dates with byte-identical
 *  troparia — the smoking-gun signature of a DB-row drift (saint accidentally
 *  authored onto the wrong day). A real dual-feast would either have distinct
 *  hymns or sit far apart in the year. Allowlisted titles bypass. */
function validateCommemorationDupes() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='commemorations'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const dupes = db.prepare(`
      SELECT title,
             GROUP_CONCAT(id)                       AS ids,
             GROUP_CONCAT(month || ',' || day, '|') AS dates
      FROM commemorations
      GROUP BY title
      HAVING COUNT(*) > 1
    `).all();

    let warnings = 0;
    for (const d of dupes) {
      if (DUPE_ALLOWLIST.has(d.title)) continue;
      // Afterfeast cycle rows are one-per-day of the afterfeast period and
      // legitimately share the feast's troparion. Not a drift signal.
      if (/^Afterfeast of /.test(d.title)) continue;
      const ids   = d.ids.split(',').map(Number);
      const pairs = d.dates.split('|').map(s => s.split(',').map(Number));

      // Skip if no pair is within the proximity window — likely legit
      // dual-comm (Marian icons, relic translations far apart in the year).
      const dayOfYear = ([m, day]) =>
        // Cheap approximation: 30 days/month is fine for proximity check.
        (m - 1) * 30 + day;
      let closeEnough = false;
      for (let i = 0; i < pairs.length && !closeEnough; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          if (Math.abs(dayOfYear(pairs[i]) - dayOfYear(pairs[j])) <= DUPE_PROXIMITY_DAYS) {
            closeEnough = true; break;
          }
        }
      }
      if (!closeEnough) continue;

      const ph  = ids.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT commemoration_id, type, text FROM troparia
         WHERE commemoration_id IN (${ph}) AND pronoun = 'tt'
         ORDER BY commemoration_id, type`
      ).all(...ids);
      const byId = {};
      for (const r of rows) (byId[r.commemoration_id] ??= []).push(`${r.type}:${r.text}`);
      const sets = ids.map(id => (byId[id] || []).sort().join('\n'));
      const allIdentical = sets.length > 1 && sets[0] !== '' && sets.every(s => s === sets[0]);
      if (allIdentical) {
        const human = pairs.map(([m, day]) => `${m}-${day}`).join(', ');
        console.warn(
          `Commemoration "${d.title}" duplicated across (${human}) ` +
          `with byte-identical troparia (ids: ${d.ids}). Likely a DB-row drift bug. ` +
          `Add to DUPE_ALLOWLIST in server-lib/overlays/drift.js if intentional.`
        );
        warnings += 1;
      }
    }
    if (warnings === 0) console.log('Commemoration dupes: clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// VIGIL_SAINTS + POLYELEOS_SAINTS rank-bearing principal commemorations must
// have saint_type populated in the DB so the Liturgy builder routes them to
// the correct General Menaion propers (prokeimenon/alleluia/koinonikon) on
// weekday feasts. A null saint_type would force fall-through to title-text
// inference which is a band-aid, not a contract — and a missed inference
// silently drops the saint's propers in favor of the weekday daily cycle.
//
// Surfaced 2026-06-28 auditing 2026-06-29 SS Peter and Paul: row 1306 had
// saint_type=null despite being the canonical Apostles' feast.
function validateRankSaintTypePopulated() {
  const { VIGIL_SAINTS, POLYELEOS_SAINTS } = require('../../calendar/fixed-feasts');
  const { getMenaionRanked } = require('../sources/menaion');

  const ranked = new Map([...VIGIL_SAINTS, ...POLYELEOS_SAINTS]);
  let warnings = 0;
  for (const [md, label] of ranked) {
    const [m, d] = md.split('-').map(Number);
    const r = getMenaionRanked(m, d);
    const principal = r?.principal;
    if (!principal) continue;  // no menaion data for this date — separate concern
    if (principal.saint_type) continue;
    // Principals that are not "saints" in the General-Menaion-category sense:
    // Lord's feasts, Archangel synaxes, founding-of-city commemorations.
    // These intentionally have no saint_type because no GENERAL_MENAION_PROPERS
    // category fits — the builder falls back to the weekday cycle, which is
    // the correct behavior for them. (If the principal-picker is wrong to
    // land on these instead of the rank-bearing saint, that's a separate
    // bug tracked under project_principal_saint_picker_2026_06_20.md, not a
    // saint_type-backfill bug.)
    const t = principal.title;
    if (/of our Lord and Savior Jesus Christ|^The Ascension of our Lord|^Synaxis of the Archangel|^Commemoration of the Founding of/i.test(t)) continue;
    console.warn(
      `Rank-bearing date ${md} (${label}): principal commemoration "${principal.title}" ` +
      `(id ${principal.id}) has null saint_type. Backfill: ` +
      `UPDATE commemorations SET saint_type = '<category>' WHERE id = ${principal.id};`
    );
    warnings += 1;
  }
  if (warnings === 0) console.log('Rank-bearing saint_type populated: clean.');
  return { ok: warnings === 0, warnings };
}

// Sticheron text fields that leak scrape metadata are a persistent OCA-DOCX
// pattern: the doxastikon tone marker ("Tone 8 ...") gets left in the text
// column instead of being parsed into the tone column, and OT-readings text
// bleeds into a sticheron slot when the DOCX layout puts readings and
// stichera adjacent. Both classes hide silently until a parish audit surfaces
// the mislabeled/nonsense hymn — the 2026-07-02 Sergius audit found 43 tone-
// prefix rows and 1 readings-bled row via a single date's inspection.
function validateSticheraTextIntegrity() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    let warnings = 0;

    // (A) Tone-prefix drift: "Tone N " leading a sticheron text.
    const toneDrift = db.prepare(
      `SELECT id, commemoration_id, section, "order", substr(text, 1, 60) AS preview
         FROM stichera
        WHERE text GLOB 'Tone [1-8] *' OR text GLOB 'Tone [1-8]	*'`
    ).all();
    for (const r of toneDrift) {
      console.warn(
        `Sticheron ${r.id} (comm=${r.commemoration_id} ${r.section}[${r.order}]) ` +
        `has embedded "Tone N " marker in text: "${r.preview}…". ` +
        `Fix: strip prefix, set tone column to N.`
      );
      warnings += 1;
    }

    // (B) Readings-bled drift: sticheron text containing a Bible chapter-verse
    //     citation with no non-citation prose. Signature of the Vespers OT-
    //     readings block bleeding into a hymn slot.
    const readingsDrift = db.prepare(
      `SELECT id, commemoration_id, section, "order", substr(text, 1, 80) AS preview
         FROM stichera
        WHERE (text LIKE '%Proverbs %:%' OR text LIKE '%Wisdom%:%'
            OR text LIKE '%Isaiah %:%' OR text LIKE '%Genesis %:%'
            OR text LIKE '%Jeremiah %:%' OR text LIKE '%Ezekiel %:%'
            OR text LIKE '%Numbers %:%' OR text LIKE '%Deuteronomy %:%'
            OR text LIKE '%Exodus %:%' OR text LIKE '%Malachi %:%'
            OR text LIKE '%Joel %:%' OR text LIKE '%Baruch %:%')
          AND length(text) < 200`
    ).all();
    for (const r of readingsDrift) {
      console.warn(
        `Sticheron ${r.id} (comm=${r.commemoration_id} ${r.section}[${r.order}]) ` +
        `looks like OT-readings text, not a hymn: "${r.preview}…". ` +
        `Fix: delete row or replace with the correct hymn from OCA source.`
      );
      warnings += 1;
    }

    // (C-E) Liturgy-propers-bled drift: the 2026-07-03 rescrape harness found 83
    //   rows where the OCA DOCX scrape glued Liturgy propers (epistle citation,
    //   Alleluia refrain) or Word-XML residue onto — or in place of — a
    //   sticheron. Cleaned in the same commit; these guards keep the class from
    //   silently returning on the next scrape. Signatures:
    //     C: leftover `<w:t>` Word-XML tag.
    //     D: an epistle CITATION ("Epistle (55) …" / "Epistle Tone 4 …") — the
    //        paren-number/tone form, so a hymn word like "epistles" is safe.
    //     E: the Divine-Liturgy Alleluia refrain "Alleluia, Alleluia".
    const bledDrift = db.prepare(
      `SELECT id, commemoration_id, section, "order", substr(text, 1, 80) AS preview
         FROM stichera
        WHERE text LIKE '%<w:t%'
           OR text LIKE '%Epistle (%' OR text LIKE '%Epistle Tone%'
           OR text LIKE '%Alleluia, Alleluia%'`
    ).all();
    for (const r of bledDrift) {
      console.warn(
        `Sticheron ${r.id} (comm=${r.commemoration_id} ${r.section}[${r.order}]) ` +
        `has Liturgy-propers/XML-residue bled into hymn text: "${r.preview}…". ` +
        `Fix: truncate the residue tail (keep the real hymn) or delete if it is ` +
        `pure epistle/alleluia metadata. See scripts/rescrape-diff.js.`
      );
      warnings += 1;
    }

    // (F) Editorial-rubric annotation bled into hymn text: "(at Vigil)",
    //   "(at Great Vespers)", "(at the Divine Liturgy)", etc. — a which-service
    //   marker from the DOCX layout, never part of the sung sticheron. 108 rows
    //   truncated 2026-07-03 (sibling of the C-E class without the <w:t> markers).
    const annotDrift = db.prepare(
      `SELECT id, commemoration_id, section, "order", substr(text, 1, 80) AS preview
         FROM stichera
        WHERE text LIKE '%(at Vigil)%' OR text LIKE '%(at Great Vespers)%'
           OR text LIKE '%(at Vespers)%' OR text LIKE '%(at Matins)%'
           OR text LIKE '%(at the Divine Liturgy)%'`
    ).all();
    for (const r of annotDrift) {
      console.warn(
        `Sticheron ${r.id} (comm=${r.commemoration_id} ${r.section}[${r.order}]) ` +
        `has an editorial "(at …)" rubric bled into hymn text: "${r.preview}…". ` +
        `Fix: truncate at the annotation (keep the real hymn).`
      );
      warnings += 1;
    }

    if (warnings === 0) console.log('Sticheron text integrity: clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Detects yy→tt transformer breakage in troparia text. The 2026-07-02 sweep
// found 3 rows where the stemmer stripped -ed from the adjective "naked" and
// produced "thou didst nak". Signature: "didst" followed by a truncated non-
// word (< 3 chars) or common non-verbs (be/or/us/it). Would have caught the
// bug on transformer run, before any parish saw the corrupt text.
function validateTropariaTransformIntegrity() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='troparia'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    let warnings = 0;

    // "didst X" where X looks like a truncated adjective stem (< 4 chars +
    // followed by punctuation). "didst nak," is the signature bug from the
    // yy→tt stemmer over-stripping "naked". Legitimate 2-3-char verb stems
    // exist (didst be / didst do — auxiliaries) but they're preceded by
    // whitespace + verb, not punctuation. Narrow: 1-3 char stem, followed
    // by comma/period/semicolon (mid-clause markers indicating verb-object
    // truncation).
    const candidates = db.prepare(
      `SELECT id, commemoration_id, type, text, substr(text, 1, 60) AS preview
         FROM troparia
        WHERE text LIKE '%didst %'`
    ).all();
    // Known-legit short auxiliaries/particles after "didst" (didst not do X,
    // didst do it) — exclude these from suspicion.
    const LEGIT_SHORT_AFTER_DIDST = new Set(['not', 'do', 'go', 'ye', 'we', 'i']);
    const shortStem = candidates.filter(r => {
      const m = r.text.match(/\bdidst\s+([a-z]{1,3})[,.;]/i);
      if (!m) return false;
      return !LEGIT_SHORT_AFTER_DIDST.has(m[1].toLowerCase());
    });
    for (const r of shortStem) {
      console.warn(
        `Troparion ${r.id} (comm=${r.commemoration_id} ${r.type}) has a suspicious "didst X" transform (short stem): "${r.preview}…". ` +
        `Likely yy→tt stemmer breakage — check scripts/yy-to-tt.js NEVER_STEM list.`
      );
      warnings += 1;
    }

    // Object-pronoun collision: "clothe thou" / "save thou" — IMPERATIVE verb
    // + subject pronoun ("thou") where the object "thee" is grammatically
    // required. Signature of the transformer's missing imperative pass.
    const objBroken = db.prepare(
      `SELECT id, commemoration_id, type, substr(text, 1, 80) AS preview
         FROM troparia
        WHERE text LIKE '%clothe thou %' OR text LIKE '%save thou %'
           OR text LIKE '%behold thou %' OR text LIKE '%receive thou %'
           OR text LIKE '%glorify thou %' OR text LIKE '%praise thou %'
           OR text LIKE '%bless thou %' OR text LIKE '%adore thou %'`
    ).all();
    for (const r of objBroken) {
      console.warn(
        `Troparion ${r.id} (comm=${r.commemoration_id} ${r.type}) has "IMPERATIVE thou" — likely should be "thee" (object pronoun): "${r.preview}…". ` +
        `Fix: replace with the correct object form.`
      );
      warnings += 1;
    }

    if (warnings === 0) console.log('Troparia transformer integrity: clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Cosmetic text drift in the hymn tables (troparia + stichera), surfaced by the
// 2026-07-03 rescrape sweep and cleaned in the same session:
//   - literal HTML entities ("&quot;I", "Eust&aacute;thius") that render raw.
//   - glued sentence/clause punctuation ("denial.Therefore", "therefore,we").
// Both are deterministic scrape artifacts; these guards keep them from silently
// returning. Entity-shaped tokens (&word; / &#123;) are flagged, not bare "&".
const ENTITY_RE = /&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;/;
const GLUED_RE  = /[.,;:!?][A-Za-z]/;
function validateTextCosmetics() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    let warnings = 0;
    for (const tbl of ['troparia', 'stichera']) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tbl);
      if (!exists) continue;
      const rows = db.prepare(`SELECT id, text FROM ${tbl}`).all();
      for (const r of rows) {
        if (ENTITY_RE.test(r.text)) {
          console.warn(`${tbl} ${r.id} has a literal HTML entity in text: "${r.text.slice(0, 60)}…". Fix: decode it.`);
          warnings += 1;
        }
        if (GLUED_RE.test(r.text)) {
          console.warn(`${tbl} ${r.id} has glued punctuation (missing space after . , ; : ! ?): "${r.text.slice(0, 60)}…". Fix: scripts/rescrape-diff — insertPunctuationSpaces.`);
          warnings += 1;
        }
      }
    }
    if (warnings === 0) console.log('Text cosmetics (entities + glued punctuation): clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

module.exports = {
  collectKeyPaths,
  warnUnknownKeys,
  validateAllTranslations,
  validateVariantLibrary,
  validateParishVariantPicks,
  validateCommemorationDupes,
  validateRankSaintTypePopulated,
  validateSticheraTextIntegrity,
  validateTropariaTransformIntegrity,
  validateTextCosmetics,
};
