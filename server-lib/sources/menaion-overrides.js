'use strict';

// Parish-scoped overrides for Menaion hymns held in oca.db.
//
// The translation-overlay cascade is scoped to fixed-texts/ (memory:
// overlay-variable-sources-gap), and `MENAION_HYMN_OVERRIDES` in
// liturgy-from-orthocal.js is a flat global map with no parish dimension. So
// a parish that sings a different sticheron or kontakion from the Menaion had
// nowhere to record it without changing the text for every other parish.
// Surfaced 2026-10-08: Tyler sings a Tone 8 kontakion of the Holy Fathers
// where the OCA order appoints Tone 6, and a distinct sixth Lord-I-Call
// sticheron where the OCA text repeats the first.
//
// A parish picks a variant exactly as it picks a fixed-text one — a
// `parish_variant_picks` row against a library file — and the library file's
// `_target.kind: "menaion"` says which DB hymn it stands in for. See
// features/parish-menaion-override.md and
// fixed-texts/variant-library/CONTRACT.md.
//
// ADDRESS BY POSITION, VERIFY BY CONTENT. `_target.hymn` names the slot and
// `_target.expect` lists the sha256 of the base text(s) the variant was
// authored against. Position alone is unsafe — orders get renumbered, as they
// were on 2026-10-08. Content alone is not enough either: the OCA text fills a
// short Lord-I-Call set by REPEATING a sticheron, so two slots can carry
// byte-identical text while only one is meant to be replaced. When the guard
// misses, the override DOES NOT APPLY — a re-authored base re-surfaces the
// parish's decision instead of silently redirecting it onto another hymn.
// `drift:check` reports every detached override.

const crypto = require('crypto');

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** True when `comm` ({ title }) at month/day is the one a target names. */
function matchesCommemoration(target, month, day, comm) {
  const c = target.commemoration;
  return c.month === month && c.day === day && c.title === comm.title;
}

/**
 * Resolve a parish's picks into the menaion overrides they select.
 * Fixed-text picks are ignored here; the overlay materializer handles those.
 * Returns [{ key, variantId, target, value }].
 */
function collectMenaionOverrides(library, picks, resolveVariant) {
  const out = [];
  for (const pick of picks || []) {
    const lib = library[pick.variant_key];
    if (!lib || !lib.target || lib.target.kind !== 'menaion') continue;
    const v = resolveVariant(library, pick.variant_key, pick.variant_id);
    if (!v) continue;
    out.push({
      key:       pick.variant_key,
      variantId: pick.variant_id,
      target:    lib.target,
      value:     v.value,
    });
  }
  return out;
}

/** Normalize a variant value to { tone, text }. */
function asHymn(value, fallbackTone) {
  if (value && typeof value === 'object') {
    return { tone: value.tone ?? fallbackTone, text: value.text };
  }
  return { tone: fallbackTone, text: value };
}

/**
 * Apply stichera overrides to one commemoration's rows, in place of matching
 * slots. `rows` is the shape getSticheraDay builds: [{ section, order, tone,
 * label, text, groupRole }]. Returns a new array; unmatched rows pass through.
 */
function applyToStichera(overrides, month, day, comm, rows) {
  if (!overrides?.length || !rows?.length) return rows;
  return rows.map((row) => {
    for (const o of overrides) {
      const h = o.target.hymn;
      if (h.table !== 'stichera') continue;
      if (!matchesCommemoration(o.target, month, day, comm)) continue;
      if (h.section !== row.section || h.order !== row.order) continue;
      if (!o.target.expect.includes(sha256(row.text))) continue; // detached — leave the base
      const hymn = asHymn(o.value, row.tone);
      return { ...row, tone: hymn.tone, text: hymn.text, _parishVariant: `${o.key}/${o.variantId}`,
               ...(o.target.dbSource ? { dbSource: o.target.dbSource } : {}) };
    }
    return row;
  });
}

/**
 * Apply troparia/kontakia overrides. `rows` is [{ type, tone, text, ... }].
 */
function applyToTroparia(overrides, month, day, comm, rows) {
  if (!overrides?.length || !rows?.length) return rows;
  return rows.map((row) => {
    for (const o of overrides) {
      const h = o.target.hymn;
      if (h.table !== 'troparia') continue;
      if (!matchesCommemoration(o.target, month, day, comm)) continue;
      if (h.type !== row.type) continue;
      if (!o.target.expect.includes(sha256(row.text))) continue; // detached
      const hymn = asHymn(o.value, row.tone);
      return { ...row, tone: hymn.tone, text: hymn.text, _parishVariant: `${o.key}/${o.variantId}`,
               ...(o.target.dbSource ? { dbSource: o.target.dbSource } : {}) };
    }
    return row;
  });
}

/** Pull overrides off the rubrics bag the assemblers already thread through. */
// The parish TRANSLATION layer. A parish whose choir sings Mother Raphaela's
// Menaion (rubric menaion.textSource = "raphaela"; St John of Damascus, Tyler —
// memory feedback_tyler_match_connie) takes, for every Menaion sticheron the
// corpus carries, the corpus text in place of the base row. The entries are
// generated (scripts/menaion-ingest/raphaela-parish-build.js) in exactly the
// shape of a variant pick, so they ride applyToStichera and its sha256 guard:
// a re-authored base row DETACHES its entry rather than redirecting it.
// Explicit parish picks come first and therefore win.
const path = require('path');
const fs = require('fs');
const RAPHAELA_FILE = path.join(__dirname, '..', '..', 'variable-sources', 'parish-texts', 'raphaela-menaion.json');
let raphaelaByDay = null;
function raphaelaFor(month, day) {
  if (!raphaelaByDay) {
    raphaelaByDay = new Map();
    try {
      for (const e of JSON.parse(fs.readFileSync(RAPHAELA_FILE, 'utf8')).entries || []) {
        const k = `${e.target.commemoration.month}-${e.target.commemoration.day}`;
        if (!raphaelaByDay.has(k)) raphaelaByDay.set(k, []);
        raphaelaByDay.get(k).push({ ...e, target: { ...e.target, dbSource: 'raphaela' } });
      }
    } catch (err) {
      console.error('raphaela-menaion.json unreadable:', err.message);
    }
  }
  return raphaelaByDay.get(`${month}-${day}`) || [];
}

/**
 * The overrides in force for one Menaion day: the parish's explicit picks,
 * then (when the parish sings Raphaela) that day's translation layer.
 * `month`/`day` are optional; without them only the explicit picks apply.
 */
function overridesFrom(opts, month, day) {
  const explicit = opts?.rubrics?.menaionOverrides || opts?.menaionOverrides || null;
  if (opts?.rubrics?.menaion?.textSource !== 'raphaela' || month == null) return explicit;
  // A hand-built parish service set for the day (rubrics.menaionServiceSet,
  // each made from a packet) is the parish's own decision for that day and
  // outranks the generated layer. Tyler 10-8 sings the OCA Glory "Where sin
  // increased, as the Apostle teaches" (10.08.26 packet), not Raphaela's.
  if (opts.rubrics.menaionServiceSet?.[`${month}-${day}`]) return explicit;
  const layer = raphaelaFor(month, day);
  if (!layer.length) return explicit;
  return explicit ? [...explicit, ...layer] : layer;
}

module.exports = {
  sha256,
  collectMenaionOverrides,
  applyToStichera,
  applyToTroparia,
  overridesFrom,
  matchesCommemoration,
};
