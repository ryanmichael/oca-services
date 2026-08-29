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

/** Validates parish practice entries (server-lib/practice) still resolve.
 *
 *  This is the guardrail the practice layer depends on. Its addresses are
 *  positional ("2.1" = verse 2, stichos 1), so re-splitting or re-translating a
 *  canonical text can silently change which words a parish sings. The stored
 *  `fingerprint` pins the source the selection was derived from; a mismatch
 *  means a human must re-read the parish source before trusting the selection.
 *
 *  Also catches malformed `rubrics_extra_json` outright — `buildRubrics` parses
 *  it inside a bare try/catch and silently drops ALL extra rubrics on failure
 *  (principalOverrides and antiphonSet included), which is invisible at runtime.
 *  Found the hard way: a sqlite `readfile()` write stored the column as a BLOB
 *  and disabled three parish settings at once with no error anywhere. */
function validateParishPractice() {
  const { openDb } = require('../cache/sqlite');
  const { fingerprint, explode, parseAddress } = require('../practice');
  const { loadPracticeLibrary, resolveParishPractice, resolvePreset } = require('../practice/library');
  const { readPracticePicks } = require('../parishes');
  const { getLiturgyFixed } = require('./cascade');
  const { fixedTextRegistry, registerBaseFixed } = require('./registry');
  const { loadAllParishOverlays } = require('../parishes');

  // The CLI runs this outside server boot, where neither the base fixed texts
  // nor the in-memory parish overlays have been registered. Register what this
  // check needs so `drift:check` validates the same cascade the server serves;
  // in-process (boot) both are already present and these are no-ops.
  if (!fixedTextRegistry.liturgy) {
    const path = require('path');
    const ROOT = path.resolve(__dirname, '..', '..');
    registerBaseFixed('liturgy', require(path.join(ROOT, 'fixed-texts', 'liturgy-fixed.json')));
    loadAllParishOverlays();
  }

  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='parish_settings'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const rows = db.prepare(
      'SELECT parish_id, rubrics_extra_json FROM parish_settings'
    ).all();

    let registry;
    try {
      registry = loadPracticeLibrary();
    } catch (err) {
      console.error(`Practice library: load FAILED — ${err.message}`);
      return { ok: false, warnings: 1 };
    }

    let warnings = 0;
    let entryCount = 0;

    for (const row of rows) {
      if (!row.rubrics_extra_json) continue;

      let extra;
      try {
        extra = JSON.parse(row.rubrics_extra_json);
      } catch (err) {
        console.warn(
          `Parish '${row.parish_id}': rubrics_extra_json is not valid JSON ` +
          `(${err.message}) — ALL extra rubrics are being silently dropped`);
        warnings += 1;
        continue;
      }
      // Effective set = library presets (Bucket C) + bespoke inline entries
      // (Bucket D), resolved by exactly the code the materializer uses, so this
      // validates what actually renders rather than one of the two sources.
      const picks = readPracticePicks(db, row.parish_id);
      for (const pick of picks) {
        if (!registry[pick.practice_key]) {
          console.warn(
            `Parish '${row.parish_id}': practice pick '${pick.practice_key}' has no library file`);
          warnings += 1;
        } else if (!resolvePreset(registry, pick.practice_key, pick.preset_id)) {
          console.warn(
            `Parish '${row.parish_id}': practice pick '${pick.practice_key}'='${pick.preset_id}' ` +
            `does not resolve — the parish has silently reverted to the full canonical text`);
          warnings += 1;
        }
      }

      const effective = resolveParishPractice(
        picks, Array.isArray(extra.practice) ? extra.practice : [], registry);
      if (effective.length === 0) continue;

      let texts;
      try {
        texts = getLiturgyFixed(row.parish_id);
      } catch (err) {
        console.warn(`Parish '${row.parish_id}': cannot resolve liturgy texts — ${err.message}`);
        warnings += 1;
        continue;
      }

      for (const entry of effective) {
        entryCount += 1;
        const target = entry && entry.target;
        if (!target) {
          console.warn(`Parish '${row.parish_id}': practice entry missing 'target'`);
          warnings += 1;
          continue;
        }
        // Resolve against the PRE-practice canonical text. getLiturgyFixed does
        // not apply practice (that happens per-request in the route), so this is
        // the untransformed array the addresses are meant to index.
        const arr = target.split('.').reduce((o, k) => (o == null ? o : o[k]), texts);
        if (!Array.isArray(arr)) {
          console.warn(`Parish '${row.parish_id}': practice target '${target}' is not an array`);
          warnings += 1;
          continue;
        }

        const { byAddress } = explode(arr);
        for (const addr of [].concat(entry.keep || [], entry.reprise || [])) {
          if (!parseAddress(addr)) {
            console.warn(`Parish '${row.parish_id}': practice '${target}' has malformed address '${addr}'`);
            warnings += 1;
          } else if (!byAddress.has(addr)) {
            console.warn(
              `Parish '${row.parish_id}': practice '${target}' address '${addr}' no longer resolves ` +
              `— the canonical text has changed shape; re-derive the selection`);
            warnings += 1;
          }
        }

        if (entry.fingerprint) {
          const actual = fingerprint(arr);
          if (actual !== entry.fingerprint) {
            console.warn(
              `Parish '${row.parish_id}': practice '${target}' source fingerprint changed ` +
              `(recorded ${entry.fingerprint}, now ${actual}) — re-verify against the parish ` +
              `source, then update the fingerprint`);
            warnings += 1;
          }
        }
      }
    }

    if (warnings === 0 && entryCount > 0) {
      console.log(`Parish practice: ${entryCount} entr${entryCount === 1 ? 'y' : 'ies'} all resolve.`);
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
  const { applyPrincipalOverride } = require('../sources/menaion-principal');

  const ranked = new Map([...VIGIL_SAINTS, ...POLYELEOS_SAINTS]);
  let warnings = 0;
  for (const [md, label] of ranked) {
    const [m, d] = md.split('-').map(Number);
    const r = getMenaionRanked(m, d);
    // Honor the curated principal overrides, exactly as the three service
    // builders do. Without this the check reports on a principal no service
    // actually renders — 8-9 flagged the Afterfeast of the Transfiguration
    // when the override had already rebound the day to St. Herman of Alaska.
    const principal = applyPrincipalOverride(m, d, r?.all, r?.principal);
    if (!principal) continue;  // no menaion data for this date — separate concern
    if (principal.saint_type) continue;
    // Principals that are not "saints" in the General-Menaion-category sense:
    // Lord's feasts, Archangel synaxes, founding-of-city commemorations, and
    // "Synaxis of All Saints of X" — a company of mixed rank (martyrs, monastics
    // and hierarchs together), so no single category fits and forcing one would
    // pick the wrong propers. Added 2026-08-08 when rank batch 2 gave 9-24
    // (Synaxis of All Saints of Alaska) polyeleos rank. "Church New Year" (the
    // Indiction, 9-1) joined in batch 4 for the same reason — it is a day, not a
    // saint.
    // These intentionally have no saint_type because no GENERAL_MENAION_PROPERS
    // category fits — the builder falls back to the weekday cycle, which is
    // the correct behavior for them. (If the principal-picker is wrong to
    // land on these instead of the rank-bearing saint, that's a separate
    // bug tracked under project_principal_saint_picker_2026_06_20.md, not a
    // saint_type-backfill bug.)
    const t = principal.title;
    if (/of our Lord and Savior Jesus Christ|^The Ascension of our Lord|^Synaxis of the Archangel|^Commemoration of the Founding of|^Synaxis of All Saints|^Church New Year/i.test(t)) continue;
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
           OR text LIKE '%Alleluia, Alleluia%'
           OR text LIKE '%Prepared by the Department%'
           OR text LIKE '%Old Testament Readings%'
           OR text LIKE '%Composite %(%'`
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

    // (G) Icon-feast mis-attribution: a *saint* commemoration (martyr, monastic,
    //   hierarch, …) carrying multiple stichera written in ICON-veneration
    //   language ("…icon…" / "image of the Virgin") — the signature of a
    //   Theotokos-ICON feast's stichera being scraped onto the wrong (adjacent)
    //   saint row. Found 2026-07-07: Icon "of the Three Hands" stichera under
    //   Martyrs Proclus & Hilary (Jul 12, comm 1404 → 1411) and Pochaev Icon
    //   under Martyr Trophimus (Jul 23, comm 1473 → 1477) — both rendered Marian
    //   hymns under a martyr's label with no Now-Dogmatikon.
    //
    //   Narrowed 2026-07-07 from a general-Marian majority test to icon-specific
    //   language: the parallel Lambertsen feast/forefeast BLEND rollout
    //   intentionally co-locates general Marian *feast* stichera with the day's
    //   saint (e.g. Menodora #1857 during the Nativity-of-the-Theotokos
    //   afterfeast), which is legitimate blend, not mis-attribution. General
    //   Marian wording therefore false-positives on every blend day. Icon-
    //   veneration language is unique to icon-feast propers and appears in
    //   neither a saint's own stichera nor feast-blend stichera, so it isolates
    //   the true class. Threshold: ≥2 icon-language stichera on one saint row.
    const SAINT_TYPES = new Set([
      'monastic', 'hierarch', 'martyr', 'martyrs', 'hieromartyr', 'apostle',
      'apostles', 'monasticMartyr', 'monasticMartyrs', 'monasticConfessor',
      'maidenMartyr', 'prophet', 'fool', 'unmercenaries', 'forerunner', 'nun',
    ]);
    const ICON = /\bicons?\b|\bimage of (?:the |thy )?(?:most (?:holy|pure) )?(?:Virgin|Theotokos|Lady|Mother)\b/i;
    const iconRows = db.prepare(
      `SELECT s.commemoration_id AS cid, c.title, c.saint_type AS st, s.text
         FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id`
    ).all();
    const byComm = {};
    for (const r of iconRows) {
      if (!SAINT_TYPES.has(r.st)) continue;
      (byComm[r.cid] ||= { title: r.title, st: r.st, icon: 0 });
      if (ICON.test(r.text || '')) byComm[r.cid].icon += 1;
    }
    for (const cid of Object.keys(byComm)) {
      const g = byComm[cid];
      if (g.icon >= 2) {
        console.warn(
          `Commemoration ${cid} [${g.st}] "${(g.title || '').slice(0, 50)}" carries ` +
          `${g.icon} icon-veneration stichera on a saint row. Likely a Theotokos-` +
          `icon feast's stichera scraped onto the wrong row. ` +
          `Fix: reattach the rows to the correct icon commemoration_id.`
        );
        warnings += 1;
      }
    }

    // (H) Multi-saint mis-attribution marker: a sticheron whose text embeds the
    //   rubric "And N Stichera of the <saint>, in the same tone/melody:" — the
    //   literal seam where a SECOND saint's stichera block begins. Its presence
    //   means the day's propers for two (or more) saints were scraped onto ONE
    //   commemoration row, so the picker renders whichever row carries them and
    //   buries the real principal. Found 2026-07-07: Sep 2 dumped Mamas + John
    //   the Faster's stichera onto the orthocal-headline "Anthony of Kiev Caves"
    //   row (split to comm 1788/1790). A backlog of 16 rows (mostly afterfeast
    //   commemorations that absorbed the day's saint stichera) shares the seam
    //   and is queued for the same split treatment; those are tolerated here so
    //   the gate stays green, and any NEW occurrence (a fresh bad scrape) trips.
    // Backlog of afterfeast/headline rows that absorbed a day's saint stichera
    // (the Sep 2 class). Cleared so far: 1786 (Sep 2), 1908 (Sep 16 Euphemia).
    // NOTE: splitting the data is necessary but NOT sufficient to fix the render
    // — the picker still ranks the afterfeast above the saint (see the Sep 16
    // finding), which is a separate, known-fragile rank-aware picker change.
    const KNOWN_MISATTRIBUTION = new Set([
      43, 165, 923, 1055, 1118, 1197, 1591, 1707,
      1863, 1926, 1939, 2372, 2436, 2541, 2623,
    ]);
    const seam = db.prepare(
      `SELECT DISTINCT commemoration_id AS cid FROM stichera
        WHERE text LIKE '%Stichera of the hol%' OR text LIKE '%And % Stichera of the%'
           OR text LIKE '%Stichera of the ven%' OR text LIKE '%Stichera of the Prophet%'`
    ).all();
    for (const r of seam) {
      if (KNOWN_MISATTRIBUTION.has(r.cid)) continue;
      console.warn(
        `Commemoration ${r.cid} has a "…Stichera of the <saint>…" seam in its ` +
        `sticheron text — a second saint's block was scraped onto this row ` +
        `(multi-saint mis-attribution, cf. Sep 2 comm 1786). Fix: split the ` +
        `block to the correct commemoration_ids and strip the rubric seam.`
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
    // commemorations.title is checked for entities too: titles are interpolated
    // into the dismissal and section labels, so an undecoded &ldquo; is read
    // aloud/printed. Transfiguration's Vespers dismissal named the feast as
    // 'the Second &ldquo;Feast of the Savior&rdquo; in August'. Glued-punctuation
    // does not apply to titles (they legitimately contain "Abp.", "St.").
    for (const [tbl, col] of [['troparia', 'text'], ['stichera', 'text'], ['commemorations', 'title']]) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tbl);
      if (!exists) continue;
      const rows = db.prepare(`SELECT id, ${col} AS text FROM ${tbl}`).all();
      for (const r of rows) {
        if (!r.text) continue;
        if (ENTITY_RE.test(r.text)) {
          console.warn(`${tbl} ${r.id} has a literal HTML entity in ${col}: "${r.text.slice(0, 60)}…". Fix: decode it.`);
          warnings += 1;
        }
        if (tbl === 'commemorations') continue;
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

// Typikon/editorial prose that belongs in a rubric, never inside a sung text.
// The Lambertsen-style scrape glued these onto the hymn they introduce or follow:
//   - "And 3 Stichera, the composition of Anatolius, in Tone II: <hymn>"  (header)
//   - "<hymn> , or this Stavrotheotokion <other hymn>"                    (alternative)
//   - "<hymn> After the dismissal of vespers, the priest vesteth…"        (trailing rubric)
// Each one printed verbatim in the choir's sheet for 2026-08-02 before it was caught.
const RUBRIC_BLEED_PATTERNS = [
  [/\bor this Stavro[Tt]heotokion\b/,        'alternative-Theotokion marker'],
  [/\bthe composition of [A-Z][a-z]+/,       'composer attribution rubric'],
  [/^And \d+ Stichera\b/,                    'sticheron-count header'],
  [/\bAfter the dismissal of (vespers|matins)\b/, 'trailing typikon rubric'],
  [/\bin Tone [IVX]+:/,                      'tone header in Roman numerals'],
  // Added 2026-08-29 (backlog N4). The five patterns above cover composer
  // attributions, count headers, Roman-numeral tone headers, Stavrotheotokion
  // markers and typikon tails — but NOT a genre heading glued to the front of
  // the sung line, which is the single largest surviving class: 17 rows, 13 of
  // them sitting at order 0 or -1, i.e. in Glory and Theotokion slots. The
  // check reported "clean" on all 17 before this. Measured over both tables,
  // these three patterns hit exactly those 17 rows and nothing else.
  [/^(?:Troparion|Kontakion|Sessional Hymn|Sedalion|Exapostilarion|Ikos|Oikos|Doxastikon|Doxasticon|Aposticha|Sticheron|Stichera)\b/,
                                             'genre heading glued to the front of the sung line'],
  [/^Glory\s*\.\.+/,                         'leading "Glory …" rubric ellipsis'],
  [/^Both now\s*\.\.+/,                      'leading "Both now …" rubric ellipsis'],
];

// Empty by policy — and it stays empty. This is the SILENT suppression set: a
// row listed here is never mentioned again, so an entry means someone decided
// the rule is wrong about it. If a row legitimately contains rubric-looking
// prose, narrow RUBRIC_BLEED_PATTERNS instead of adding an exception here.
const KNOWN_RUBRIC_BLEED = new Set([]);

// The burn-down list is a DIFFERENT thing and must not be confused with the
// suppression set above. These rows are known-bad, itemized and dated; the
// check prints every one of them on every run and only declines to fail the
// gate on them. A row here is a debt with a name, not a silenced finding.
//
// Opened 2026-08-29 with the N4 pattern repair. Each needs a per-row check
// against the St Sergius source before it can be fixed — the fix is NOT
// mechanical: of the 14 that are whole troparia mis-parsed into `stichera`,
// only 2 duplicate a troparion that already exists elsewhere in the corpus, so
// 12 cannot be resolved by deletion alone. Tracked as N1 in
// docs/backlog-2026-08-29-vespers-liturgy-review.md. Do not bulk-delete on the
// pattern; several sit on feast dates where the eviction changes what is sung.
//
// To close one: fix the row, then delete its id from this list. When the list
// is empty, delete the list and the `deferred` branch with it.
const RUBRIC_BLEED_BURNDOWN = new Map([
  [6971, 'N1 — 1-30 Ecumenical Teachers, aposticha order=0 (Glory slot)'],
  [8275, 'N1 — 1-13 Afterfeast of Theophany, aposticha order=0 (Glory slot)'],
  [8276, 'N1 — 1-13 Afterfeast of Theophany, aposticha order=-1 (Theotokion slot)'],
  [8320, 'N1 — 1-22 Apostle Timothy, aposticha order=0 (Glory slot)'],
  [8530, 'N1 — 4-26 Myrrhbearing Women, lordICall order=0 (Glory slot)'],
  [8537, 'N1 — 4-28 Apostles Jason and Sosipater, lordICall order=0 (Glory slot)'],
  [8564, 'N1 — 5-09 Prophet Isaiah, lordICall order=0 (Glory slot)'],
  [8738, 'N1 — 6-25 Virgin Martyr Febronia, aposticha order=0 (Glory slot)'],
  [8852, 'N1 — 7-18 Martyr Emilian, lordICall order=3 (numbered slot)'],
  [8950, 'N1 — 8-12 Afterfeast of Transfiguration, aposticha order=0 (Glory slot)'],
  [8951, 'N1 — 8-12 Afterfeast of Transfiguration, aposticha order=-1 (Theotokion slot)'],
  [9067, 'N1 — 9-03 Hieromartyr Anthimus, aposticha order=0 (Glory slot)'],
  [9253, 'N1 — 10-11 Fathers of the 7th Council, lordICall order=0 (Glory slot)'],
  [9274, 'N1 — 10-15 Ven. Euthymius the New, aposticha order=0 (Glory slot)'],
  [9305, 'N1 — 10-22 St. Averkios, lordICall order=0 (Glory slot)'],
  [9352, 'N1 — 11-04 Hieromartyr Seraphim, aposticha order=0 (Glory slot)'],
  [9377, 'N1 — 11-07 33 Martyrs of Melitene, lordICall order=0 (Glory slot)'],
]);

// Rubric prose glued into sung stichera/troparia text. Fires on the scrape
// artifacts that survived ingestion; each hit is a row a choir would read aloud.
function validateRubricBleed() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    let warnings = 0;
    let deferredCount = 0;
    const seenDeferred = new Set();
    for (const tbl of ['troparia', 'stichera']) {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tbl);
      if (!exists) continue;
      for (const r of db.prepare(`SELECT id, text FROM ${tbl}`).all()) {
        if (tbl === 'stichera' && KNOWN_RUBRIC_BLEED.has(r.id)) continue;
        if (tbl === 'stichera' && RUBRIC_BLEED_BURNDOWN.has(r.id)) seenDeferred.add(r.id);
        // A row too short to be a hymn is a bare rubric fragment the scrape left
        // behind ("Doxasticon from the Pentecostarion.", ", or Stavrotheotokion.").
        // These render AS the hymn when they land in a Glory or Theotokion slot —
        // 5-5 Great Martyr Irene printed one as its Doxastikon. Delete the row;
        // the assembler then correctly falls through to the Octoechos.
        if (r.text.trim().length < 40) {
          console.warn(
            `${tbl} ${r.id} is content-free (${JSON.stringify(r.text.trim()).slice(0, 50)}) — ` +
            `a rubric fragment with no hymn. Fix: delete the row (see ` +
            `scripts/strip-rubric-bleed.js; tails preserved in audit/rubric-bleed-tails.json).`
          );
          warnings += 1;
          continue;
        }
        for (const [re, what] of RUBRIC_BLEED_PATTERNS) {
          if (!re.test(r.text)) continue;
          const deferred = tbl === 'stichera' && RUBRIC_BLEED_BURNDOWN.get(r.id);
          if (deferred) {
            // Printed, never silent — but does not fail the gate.
            console.warn(
              `${tbl} ${r.id} has rubric bleed (${what}) — DEFERRED: ${deferred}. ` +
              `"${r.text.replace(/\s+/g, ' ').slice(0, 60)}…"`
            );
            deferredCount += 1;
            break;
          }
          console.warn(
            `${tbl} ${r.id} has rubric bleed (${what}) inside sung text: ` +
            `"${r.text.slice(0, 70)}…". Fix: strip the rubric; if it introduces a ` +
            `second set, split those into their own rows tagged ` +
            `group_role='alternative-set' so they don't consume sung slots.`
          );
          warnings += 1;
          break;
        }
      }
    }
    // A burn-down entry whose row no longer trips any pattern is stale — it was
    // fixed (or deleted) and the list was not updated. Say so, so the list
    // cannot quietly outlive the debt it records.
    const stale = [...RUBRIC_BLEED_BURNDOWN.keys()].filter(id => !seenDeferred.has(id));
    if (stale.length) {
      console.warn(
        `RUBRIC_BLEED_BURNDOWN lists ${stale.length} row(s) that no longer trip any ` +
        `pattern (${stale.join(', ')}) — fixed already? Remove them from the list.`
      );
      warnings += stale.length;
    }
    if (warnings === 0) {
      console.log(
        deferredCount === 0
          ? 'Rubric bleed in sung text: clean.'
          : `Rubric bleed in sung text: no new findings (${deferredCount} deferred, tracked as N1).`
      );
    }
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Common capitalized liturgical words that are NOT distinctive saint/place
// names — excluded from the mis-key subject-noun heuristic below.
const STICHERA_NAME_STOPWORDS = new Set([
  'Christ', 'Jesus', 'Lord', 'God', 'Father', 'Fathers', 'Spirit', 'Holy',
  'Saint', 'Saints', 'Venerable', 'Virgin', 'Mother', 'Theotokos', 'Angel',
  'Angels', 'Apostle', 'Apostles', 'Martyr', 'Martyrs', 'Prophet', 'Cross',
  'Church', 'Heaven', 'Heavens', 'Trinity', 'Word', 'Savior', 'Saviour',
  'King', 'Master', 'Creator', 'Blessed', 'Rejoice', 'Glory', 'Today',
  'Come', 'Great', 'Council', 'Councils', 'Wonder', 'Faith', 'Grace',
]);

// Strip diacritics so "Saróv" matches "Sarov", "Sergéi" matches "Sergei".
function stripDiacritics(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// 6-char stem, diacritic-folded — tolerates transliteration endings so a
// commemoration's OWN saint isn't mistaken for a sibling: "Demetrius" (hymns)
// and "Demetrios" (title) both stem to "demetr". Words shorter than 6 chars
// stem to themselves.
function nameStem(w) {
  const s = stripDiacritics(w || '').toLowerCase();
  return s.length >= 6 ? s.slice(0, 6) : s;
}
function titleStems(title) {
  const out = new Set();
  for (const m of stripDiacritics(title || '').matchAll(/[A-Za-z]{4,}/g)) out.add(nameStem(m[0]));
  return out;
}

// Known pre-existing stichera mis-keys (source commemoration id) surfaced by
// the sweep on 2026-07-19. These are PARTIAL bleeds on shared-date pairs — the
// festal/movable first-row commemoration hoards a portion of a fixed saint's
// hymns — so remediation is per-row (move only the sibling-named stichera,
// re-order, verify against OCA source), NOT a blanket reassignment. Queued as a
// dedicated pass (see memory project_stichera_miskey_sweep_2026_07_19). Listed
// here so the guard gates only NEW mis-keys, not this known backlog.
// Already fixed (clean full moves, removed from this list): 1450 Fathers←Seraphim,
// 911 Cross←Alexis Toth, 2324 Martyrius←Theodore the Studite.
const KNOWN_STICHERA_MISKEYS = new Set([
  5,    // Forefeast of Theophany ← Seraphim of Sarov (→6)
  190,  // New Martyrs of Russia ← Gregory the Theologian (→191)
  348,  // Sunday of Meatfare ← Apostle Onesimus (→349)
  639,  // Repose of St Innocent ← Hypatius of Gangra (→640)
  795,  // Theodore Trichinas ← Anastasius of Sinai (→799)
  928,  // Sunday of the Samaritan Woman ← Apostle Simon the Zealot (→929)
  937,  // Founding of Constantinople ← Cyril & Methodius (→939)
  1319, // St John Maximovitch ← Juvenal of Jerusalem (→1322)
  2205, // Great Earthquake at Constantinople ← Demetrios of Thessaloniki (→2204)
  2211, // Mother Olga of Alaska ← Martyr Nestor of Thessalonica (→2212)
  2227, // John the Chozebite ← Stephen the Hymnographer (→2219)
  2521, // Sunday of the Forefathers ← Herman of Alaska (→2522)
  // Surfaced 2026-07-25 by the new per-section (minority-bleed) pass — genuine
  // Aposticha mis-keys onto a neighbour whose own Lord-I-Call dominated the
  // pooled count. Sibling is empty in the bled section. Queued for per-row
  // reassignment (verify texts against OCA source before moving):
  1550, // Venerable Isaac the Ascetic ← Faustus the Ascetic aposticha (→1552)
  1728, // Return of Relics of Ap. Bartholomew ← Ap. Titus aposticha (→1729)
  2186, // Macarius the Roman ← Ap. James Brother-of-the-Lord aposticha (→2187)
  // Surfaced 2026-08-02 by the rubric-bleed burn-down. Not new drift: the
  // rubric-only rows were diluting each commemoration's hymn count and holding
  // the bleed ratio under threshold. Removing them let the real mis-key show.
  // Queued for per-row reassignment on the same terms as the block above —
  // verify texts against the OCA source before moving.
  879,  // Matrona of Moscow ← Athanasius of Lubensk lordICall (→882)
  1339, // Finding of relics of Maximus the Greek ← Burial of Prince Andrew aposticha (→1343)
  1802, // Gorazd of Prague ← Hieromartyr Babylas of Antioch aposticha (→1803)
  2273, // Seraphim (Samoilovich) of Uglich ← Joannicius the Great aposticha (→2274)
]);

// Data-drift guard: a commemoration whose stichera repeatedly name a proper
// noun that instead matches a SIBLING commemoration (same month/day) — and is
// absent from the commemoration's own title — has almost certainly had that
// sibling's stichera mis-keyed onto it by the scraper (it attaches a day's
// hymns to the first commemoration row rather than the saint they address).
//
// Surfaced 2026-07-19 auditing the Sunday of the Holy Fathers: 9 stichera all
// addressing "venerable Seraphim"/"Saróv" were keyed to comm 1450 "Fathers of
// the First Six Councils" while sibling 1451 "…Seraphim of Sarov" had none.
//
// The sibling-title match keeps false positives near-zero: a generic saint-day
// whose stichera simply name the saint (already in the title) never fires.
function validateSticheraCommemorationMismatch() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    // Commemorations that share a (month, day) with at least one sibling.
    const siblings = db.prepare(`
      SELECT id, month, day, title FROM commemorations
      WHERE (month, day) IN (
        SELECT month, day FROM commemorations GROUP BY month, day HAVING COUNT(*) > 1
      )
    `).all();

    // Index sibling titles by (month, day).
    const byDate = new Map();
    for (const c of siblings) {
      const k = `${c.month}-${c.day}`;
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(c);
    }

    // Stichera counts per (commemoration, section) and per commemoration. The
    // mis-key signature is that the sibling naming the subject is MISSING its
    // own stichera there (its hymns bled onto the neighbor). Requiring an empty
    // sibling suppresses feast/afterfeast co-celebration false positives, where
    // a feast comm legitimately carries a great co-celebrated saint's hymns and
    // the first name merely collides with an unrelated same-name sibling that
    // still has its own stichera (e.g. Jan 1 Circumcision's St. Basil-the-Great
    // aposticha vs sibling "Martyr Basil of Ancyra").
    const sectionCount = new Map(); // `${commId}::${section}` -> n
    const totalCount   = new Map(); // commId -> n
    for (const r of db.prepare('SELECT commemoration_id AS id, section, COUNT(*) n FROM stichera GROUP BY commemoration_id, section').all()) {
      sectionCount.set(`${r.id}::${r.section || 'lordICall'}`, r.n);
      totalCount.set(r.id, (totalCount.get(r.id) || 0) + r.n);
    }

    // Detect the majority subject-noun of a set of stichera whose stem matches a
    // sibling's title but not the commemoration's own. Returns {match, noun, n}
    // or null. Candidate subject-nouns are distinctive capitalized words (len ≥5)
    // appearing in ≥60% of the set, keyed by 6-char stem so transliteration
    // endings collapse together.
    const findSiblingSubject = (rows, ownStems, siblingsOfDate) => {
      const counts = new Map(); // stem -> { n, display }
      for (const s of rows) {
        const seen = new Set();
        for (const m of (s.text || '').matchAll(/\b([A-Z][a-zá-ú]{4,})\b/g)) {
          const w = m[1];
          if (STICHERA_NAME_STOPWORDS.has(w)) continue;
          const stem = nameStem(w);
          if (!seen.has(stem)) {
            seen.add(stem);
            const e = counts.get(stem) || { n: 0, display: w };
            e.n += 1;
            counts.set(stem, e);
          }
        }
      }
      const threshold = Math.ceil(rows.length * 0.6);
      for (const [stem, { n, display }] of counts) {
        if (n < threshold) continue;
        if (ownStems.has(stem)) continue; // subject is this saint — fine
        const match = siblingsOfDate.find(o => titleStems(o.title).has(stem));
        if (match) return { match, noun: display, n };
      }
      return null;
    };

    let warnings = 0;
    for (const c of siblings) {
      if (KNOWN_STICHERA_MISKEYS.has(c.id)) continue; // documented backlog — queued
      const stichera = db.prepare(
        'SELECT section, text FROM stichera WHERE commemoration_id = ?'
      ).all(c.id);
      if (stichera.length < 2) continue; // need a set to establish a subject

      const ownStems       = titleStems(c.title);
      const siblingsOfDate = (byDate.get(`${c.month}-${c.day}`) || []).filter(o => o.id !== c.id);

      // Evaluate PER SECTION, not across the whole commemoration: a minority
      // bleed (e.g. a sibling saint's entire Aposticha mis-keyed onto a saint
      // whose own Lord-I-Call dominates the combined count) stays below the 60%
      // threshold when pooled but is a clear majority within its own section.
      // Surfaced 2026-07-25 auditing 7-26: 6 Parasceva Aposticha + 2 Parasceva
      // Lord-I-Call were keyed onto St. Jacob Netsvetov (7 own Lord-I-Call);
      // pooled Parasceva was 8/15 vs a per-Aposticha 6/6.
      const bySection = new Map();
      for (const s of stichera) {
        const sec = s.section || 'lordICall';
        if (!bySection.has(sec)) bySection.set(sec, []);
        bySection.get(sec).push(s);
      }
      // Also run the whole-commemoration pass so a subject spread thinly across
      // sections (but dominant overall) is still caught. Skip the per-section
      // (minority-bleed) passes when the HOST is a feast/afterfeast: those comms
      // legitimately carry a great co-celebrated saint's stichera, and a single
      // section naming that saint is normal, not a mis-key (e.g. Jan 1
      // Circumcision's St. Basil-the-Great aposticha). The whole-comm pass still
      // runs for feasts, catching a fully-bled commemoration.
      const hostIsFeast = /\b(Feast|Forefeast|Afterfeast|Circumcision|Nativity|Theophany|Meeting|Presentation|Annunciation|Transfiguration|Dormition|Exaltation|Ascension|Pentecost|Entry|Entrance|Protection|Synaxis)\b/i.test(c.title);
      const passes = hostIsFeast ? [['(all)', stichera]] : [['(all)', stichera], ...bySection];

      for (const [sec, rows] of passes) {
        if (rows.length < 2) continue;
        const hit = findSiblingSubject(rows, ownStems, siblingsOfDate);
        if (!hit) continue;
        // Require the named sibling to be MISSING its stichera in the bled
        // location — its hymns landed on this neighbor. Whole-comm pass: the
        // sibling has none at all; per-section pass: the sibling has none in
        // that section.
        const siblingMissing = sec === '(all)'
          ? !(totalCount.get(hit.match.id) > 0)
          : !(sectionCount.get(`${hit.match.id}::${sec}`) > 0);
        if (siblingMissing) {
          console.warn(
            `Stichera under commemoration ${c.id} "${c.title}" (${c.month}-${c.day}) ` +
            `name "${hit.noun}" in ${hit.n}/${rows.length} ${sec === '(all)' ? 'hymns' : sec + ' hymns'} ` +
            `but that subject matches sibling commemoration ${hit.match.id} "${hit.match.title}". ` +
            `Likely scraper mis-key — reassign these stichera to ${hit.match.id}.`
          );
          warnings += 1;
          break; // one warning per commemoration is enough
        }
      }
    }
    if (warnings === 0) console.log('Stichera↔commemoration subject match: clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Data-drift tripwire on the LABEL column, which no other rule reads.
//
// The OCA scrape carries each hymn's own section header into `stichera.label`
// verbatim — "(for St. Herman)", "(for the Feast)". When the parser loses a
// section boundary it keys a neighbor's hymns onto the wrong commemoration but
// the label still names the true subject, so a label naming a saint who is NOT
// this commemoration's subject — while a sibling commemoration on the same date
// IS that saint — is a near-certain mis-key. Unlike the body-text subject rule
// this needs no majority threshold and no per-section heuristics, so it is
// immune to the feast-host exemption that let the 8-9 bleed through.
//
// Surfaced 2026-08-07: commemoration 1603 "Afterfeast of the Transfiguration"
// carried seven hymns labeled "(for St. Herman)" / "(St. Herman)" while sibling
// 1604 "Glorification of Venerable Herman of Alaska" had zero stichera. The
// body-text rule missed it — hostIsFeast suppressed the per-section passes and
// Herman was named in only 7/15 pooled hymns, under the 60% threshold.
// Podoben (melody) markers ride along in the same parenthetical as the subject
// — "(for the Feast)(Joseph of Arimathea)". They name the tune a sticheron is
// sung to, not its subject, and several are saints' names that collide with
// unrelated sibling commemorations. Stripped before subject extraction.
const PODOBEN_MARKERS = [
  'Joseph of Arimathea',
  'O all-praised martyrs',
  'When from the Tree',
  'Thou didst seek the heights',
  'You sought the heights',
  'Come, let us worship the Word',
  'Seeking the things on high',
];

// Same-class label mis-keys found by the 2026-08-07 year sweep that introduced
// this rule, triaged as real but deferred: each needs its own per-row
// reassignment against the OCA source docx, and the session that found them was
// scoped to the 8-08/8-09 weekend. Queued, not silenced — remove an entry as it
// is fixed. Tracked in project_session_handoff_2026_08_07.md.
const KNOWN_LABEL_MISKEYS = new Set([
  1,    // 1-1   Circumcision of the Lord     ← "(St. Basil)" x2 -> 3
  17,   // 1-4   Synaxis of the Seventy       ← "(for Ven. Theoctistus)" x3 -> 19
  63,   // 1-10  (9-13 sibling)               ← "(Sts. Gregory and Dometian)" -> 65
  71,   // 1-11  Ven. Theodosius              ← "(Ven. Theodosius)" -> 74
  124,  // 1-18  Athanasius & Cyril           ← "(Sts. Athanasius and Cyril)" x2 -> 125
  154,  // 1-21  St. Neophytus                ← "(St. Neophytus)" -> 155
  190,  // 1-25  St. Gregory                  ← "(St. Gregory)" x2 -> 191
  613,  // 3-28  Ven. Hilarion                ← "(for Ven. Hilarion)" x3 -> 617
  702,  // 4-7   St. Tikhon                   ← "(St. Tikhon)" -> 703
  919,  // 5-8   John the Theologian          ← "(for St. Arsenius)" x2 -> 920
  1127, // 6-6   Ven. Bessarion               ← "St. Hilarion" x5 -> 1128
  1465, // 7-21  Prophet Ezekiel              ← "(Sts. Simeon and John)" x2 -> 1466
  1533, // 7-31  Forefeast of the Procession  ← "(St. Eudocimus)" x2 -> 1534
  1626, // 8-13  Leavetaking of Transfiguration ← "(St. Tikhon)" -> 1627
  1707, // 8-22  Afterfeast of the Dormition  ← "the holy martyr Agathonicus" x8 -> 1708
  1728, // 8-25  Relics of Apostle Bartholomew ← "(St. Titus)" -> 1729 (already in the 7-25 backlog)
  1778, // 9-1   Church New Year              ← "(St. Simeon)" x2 -> 1779
  1831, // 9-7   Forefeast of the Nativity of the Theotokos ← "(St. Sozon)" x2 -> 1832
  1880, // 9-13  Forefeast of the Elevation   ← "(Founding)" -> 1881
  2301, // 11-9  Onesiphorus & Porphyrius     ← "(Ven. Matrona)" -> 2302
  2372, // 11-20 Forefeast of the Entry       ← "Saint Proclus" x5 -> 2374
  2391, // 11-23 Afterfeast of the Entry      ← "(Sts. Amphilochius and Gregory)" -> 2399
  2408, // 11-25 Leavetaking of the Entry     ← "(Sts. Clement and Peter)" -> 2410
  2469, // 12-4  Alexander Hotovitzky         ← "(St. Barbara)" x2 -> 2470
  2574, // 12-21 Forefeast of the Nativity    ← "(St. Juliana)" x2 -> 2577
  2593, // 12-26 Second Day of the Nativity   ← "(Synaxis of the Theotokos)" -> 2594
  2601, // 12-27 Righteous David/Joseph/James ← "(St. Stephen)" x2 -> 2606
]);

function validateSticheraLabelSubject() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const comms = db.prepare(
      'SELECT id, month, day, title FROM commemorations'
    ).all();
    const byDate = new Map();
    for (const c of comms) {
      const k = `${c.month}-${c.day}`;
      if (!byDate.has(k)) byDate.set(k, []);
      byDate.get(k).push(c);
    }
    const hasStichera = new Set(
      db.prepare('SELECT DISTINCT commemoration_id AS id FROM stichera').all().map(r => r.id)
    );

    const labelled = db.prepare(`
      SELECT s.commemoration_id AS id, s.label, COUNT(*) AS n
      FROM stichera s
      WHERE s.label IS NOT NULL AND s.label != ''
      GROUP BY s.commemoration_id, s.label
    `).all();

    let warnings = 0;
    const reported = new Set();
    for (const row of labelled) {
      if (reported.has(row.id)) continue;
      if (KNOWN_LABEL_MISKEYS.has(row.id)) continue;
      const c = comms.find(x => x.id === row.id);
      if (!c) continue;
      const ownStems = titleStems(c.title);
      const siblings = (byDate.get(`${c.month}-${c.day}`) || []).filter(o => o.id !== c.id);

      // Strip melody markers and composer attributions ("by Theodore" = Theodore
      // the Studite, the author, not the hymn's subject) before extraction.
      let label = String(row.label).replace(/\bby\s+[A-Z][a-zá-ú]+/g, ' ');
      for (const p of PODOBEN_MARKERS) label = label.split(p).join(' ');

      for (const m of label.matchAll(/\b([A-Z][a-zá-ú]{4,})\b/g)) {
        const w = m[1];
        if (STICHERA_NAME_STOPWORDS.has(w)) continue;
        const stem = nameStem(w);
        if (ownStems.has(stem)) continue;                // label names this comm's own subject
        const match = siblings.find(o => titleStems(o.title).has(stem));
        if (!match) continue;                            // no sibling owns the name — not a mis-key
        if (hasStichera.has(match.id)) continue;         // sibling has its own hymns — co-celebration, not a bleed
        console.warn(
          `Stichera under commemoration ${c.id} "${c.title}" (${c.month}-${c.day}) carry ` +
          `label "${row.label}" (${row.n} row(s)) naming "${w}", but that subject is sibling ` +
          `commemoration ${match.id} "${match.title}", which has no stichera of its own. ` +
          `Likely scraper mis-key — reassign these stichera to ${match.id}.`
        );
        warnings += 1;
        reported.add(row.id);
        break;
      }
    }
    if (warnings === 0) console.log('Stichera label↔commemoration subject match: clean.');
    return { ok: warnings === 0, warnings };
  } finally {
    db.close();
  }
}

// Commemorations verified to legitimately compose stichera from BOTH a
// day-specific source and a General-Menaion (St. Sergius) source for the SAME
// saint — e.g. day-specific Lord-I-Call numbered stichera plus a St-Sergius
// Glory/Aposticha. These are intentional, not bleeds. Verified 2026-07-25.
const KNOWN_MIXED_SOURCE_COMMS = new Set([
  487,  // 42 Martyrs of Ammoria — day LIC + St-Sergius Glory/Aposticha (all 42 Martyrs)
  599,  // Annunciation — oca-feast LIC + St-Sergius Aposticha (all Annunciation)
  2256, // Cosmas & Damian of Mesopotamia — day LIC + St-Sergius Glory/Theotokion/Aposticha
]);

// Data-drift tripwire: a commemoration whose stichera mix a General-Menaion
// source ("stSergius*") with a day-specific source ("oca-*") is almost always a
// scraper bleed — the day's General-Menaion generic set for a co-commemorated
// saint got appended onto the first commemoration row, which already carries
// its own day-specific hymns. This is the exact fingerprint of the 7-26 bug
// (surfaced 2026-07-25): St-Sergius Parasceva doxastika + aposticha keyed onto
// the oca-menaion St. Jacob Netsvetov commemoration. The category-generic bled
// hymns evade the subject-match rule (they name no saint, and the one that does
// — the doxastikon — uses a transliteration that defeats stem-matching), so the
// source seam is the reliable signal. Legitimate same-saint multi-source
// compositions are allowlisted above; a NEW mix must be human-verified.
function validateSticheraSourceMixing() {
  const { openDb } = require('../cache/sqlite');
  const db = openDb();
  if (!db) return { ok: true, warnings: 0 };
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
    ).get();
    if (!exists) return { ok: true, warnings: 0 };

    const rows = db.prepare(`
      SELECT s.commemoration_id AS id, c.title, c.month, c.day,
             group_concat(DISTINCT s.source) AS sources
      FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
      GROUP BY s.commemoration_id
      HAVING COUNT(DISTINCT s.source) > 1
    `).all();

    let warnings = 0;
    for (const r of rows) {
      if (KNOWN_MIXED_SOURCE_COMMS.has(r.id)) continue; // verified legitimate
      const sources = (r.sources || '').split(',');
      const hasGeneral     = sources.some(s => /^stSergius/i.test(s));
      const hasDaySpecific = sources.some(s => /^oca[-_]/i.test(s));
      if (hasGeneral && hasDaySpecific) {
        console.warn(
          `Commemoration ${r.id} "${r.title}" (${r.month}-${r.day}) mixes a General-Menaion ` +
          `source with a day-specific source in its stichera (${r.sources}). Likely a scraper ` +
          `bleed of a co-commemorated saint's General-Menaion set — verify the General-Menaion ` +
          `rows belong to this saint; if not, reassign them. If legitimate, add ${r.id} to ` +
          `KNOWN_MIXED_SOURCE_COMMS.`
        );
        warnings += 1;
      }
    }
    if (warnings === 0) console.log('Stichera source-mixing: clean.');
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
  validateParishPractice,
  validateCommemorationDupes,
  validateRankSaintTypePopulated,
  validateSticheraTextIntegrity,
  validateSticheraCommemorationMismatch,
  validateSticheraLabelSubject,
  validateSticheraSourceMixing,
  validateTropariaTransformIntegrity,
  validateTextCosmetics,
  validateRubricBleed,
};
