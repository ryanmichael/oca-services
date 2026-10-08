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
      return { ...row, tone: hymn.tone, text: hymn.text, _parishVariant: `${o.key}/${o.variantId}` };
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
      return { ...row, tone: hymn.tone, text: hymn.text, _parishVariant: `${o.key}/${o.variantId}` };
    }
    return row;
  });
}

/** Pull overrides off the rubrics bag the assemblers already thread through. */
function overridesFrom(opts) {
  return opts?.rubrics?.menaionOverrides || opts?.menaionOverrides || null;
}

module.exports = {
  sha256,
  collectMenaionOverrides,
  applyToStichera,
  applyToTroparia,
  overridesFrom,
  matchesCommemoration,
};
