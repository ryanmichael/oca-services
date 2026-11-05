'use strict';

// Corrections for defects in the UPSTREAM orthocal.info payload.
//
// WHY THIS EXISTS AND NOT A PATCHED VENDOR FILE. `data/orthocal/*.json` is a
// verbatim mirror of the upstream response (Track B, 2026-06-19) and
// `scripts/vendor-orthocal.js --force` rewrites it from the live API. Editing a
// vendored file to fix upstream would therefore (a) silently diverge the mirror
// from the thing it mirrors, and (b) be wiped by the next refresh with nothing
// to say it had ever been there. Corrections live here instead: cited, dated,
// and applied on read.
//
// WHAT QUALIFIES. Only a defect verified against an oracle outside orthocal —
// the OCA order of services for the date, or the same date in other years of
// the vendored window. A disagreement between orthocal and our own menaion data
// is NOT a correction; that is what the principal picker is for.
//
// SELF-RETIRING. Each rule is a no-op once upstream fixes the data, so a stale
// entry costs nothing and `applyOrthocalCorrections` returns the object
// untouched. Prune on sight anyway.

/**
 * date (YYYY-MM-DD) -> { dropFeasts?: string[] }
 *
 * `dropFeasts` removes exact-match strings from `feasts[]`. Exact match, not
 * substring: a partial match could swallow a legitimate co-commemoration that
 * merely shares wording.
 */
const CORRECTIONS = new Map([
  // 2026-11-08 — Sunday, Synaxis of the Archangel Michael and the other
  // Bodiless Powers. Upstream `feasts[]` reads:
  //     ['Synaxis of the Holy Unmercenaries',
  //      'Synaxis of Archangel Michael and the Bodiless Powers']
  // The Unmercenaries (Cosmas and Damian of Asia) are 11-01, not 11-08.
  // Evidence, all outside orthocal:
  //   - reference/orders/2026-1108-order-services.txt names the Archangels
  //     alone; no Unmercenaries anywhere in the file.
  //   - 2025-11-08, 2027-11-08 and 2028-11-08 all carry the Archangels alone.
  //     2026 is the only year in the vendored window with the extra entry.
  //   - Upstream's own `stories[]` for 2026-11-08 holds ONLY the Archangels,
  //     while 2026-11-01 holds Cosmas and Damian — so the feast LABEL is on
  //     the wrong date while the saint record is on the right one.
  // Impact if uncorrected: `feasts[]` feeds the Liturgy dismissal saints
  // (server-lib/sources/liturgy-from-orthocal.js), so the priest reads
  // "of Synaxis of the Holy Unmercenaries" at a service that does not
  // commemorate them. Surfaced 2026-11-05 reviewing the 11-08 hierarchical
  // Liturgy against the choir packet.
  ['2026-11-08', { dropFeasts: ['Synaxis of the Holy Unmercenaries'] }],
]);

/**
 * Returns `data` with any correction for `dateStr` applied. Returns the SAME
 * object reference when nothing changes, so callers can treat this as free.
 */
function applyOrthocalCorrections(dateStr, data) {
  const fix = CORRECTIONS.get(dateStr);
  if (!fix || !data || typeof data !== 'object') return data;

  if (Array.isArray(fix.dropFeasts) && Array.isArray(data.feasts)) {
    const kept = data.feasts.filter(f => !fix.dropFeasts.includes(f));
    // Upstream already fixed it (or never had it) — leave the object alone.
    if (kept.length !== data.feasts.length) {
      return { ...data, feasts: kept };
    }
  }

  return data;
}

module.exports = { applyOrthocalCorrections, CORRECTIONS };
