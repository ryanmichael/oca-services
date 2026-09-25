'use strict';

// Applies a parish's named Menaion service set (variable-sources/
// menaion-service-sets.json) to the Vespers spec after the generic Menaion
// injection has run. The set is the parish's whole answer for the day's
// Lord-I-Call / Aposticha / Troparia, so it replaces those specs rather than
// patching them — patching the generic Vigil-or-Daily result is what produced
// four wrong shapes for 10-1 before.
//
// First (and so far only) set: Tyler's Daily Vespers of the Protection, from
// the 10.01.26 packet. Found/added 2026-09-24.

/**
 * Resolve one hymn entry: `{ ref: { comm, section, order } }` or
 * `{ ref: { comm, type } }` into the day's DB rows, or an inline
 * `{ text, tone, label }`. Returns { text, tone, label } or null.
 */
function resolveHymn(entry, comms) {
  if (!entry) return null;
  if (!entry.ref) return entry.text ? { text: entry.text, tone: entry.tone, label: entry.label } : null;
  const { comm, section, order, type } = entry.ref;
  const c = (comms || []).find(x => (x.title || '').includes(comm));
  if (!c) return null;
  const row = type
    ? (c.troparia || []).find(t => t.type === type)
    : (c.stichera || []).find(s => s.section === section && s.order === order);
  return row ? { text: row.text, tone: row.tone, label: row.label || c.title } : null;
}

/**
 * @param {object} set          resolved set (serviceSetFor)
 * @param {object} vespers      calendarEntry.vespers (mutated)
 * @param {object} autoSlot     the menaion auto slot for this date (mutated)
 * @param {object[]} comms      ranked.all — the day's commemorations with rows
 * @param {string} date         liturgical date (auto key)
 * @param {string[]|null} apostVerses proper Aposticha verses, if any
 * @returns {boolean} whether the set was applied in full
 */
function applyServiceSet(set, vespers, autoSlot, comms, date, apostVerses) {
  const r = (e) => resolveHymn(e, comms);
  const prov = 'OCA';

  // ── Lord, I Call: the day's Octoechos, then the set's Menaion stichera ────
  const licHymns = (set.lordICall?.menaion || []).map(r);
  const licGloryNow = r(set.lordICall?.gloryNow);
  if (licHymns.some(h => !h) || !licGloryNow) {
    console.warn(`menaionServiceSet '${set.name}': a Lord-I-Call hymn did not resolve; using the default service`);
    return false;
  }
  const lic = vespers.lordICall;
  const octo = (lic.slots || []).find(s => s.source === 'octoechos');
  const nMen = licHymns.length;
  const verses = [6, 5, 4, 3, 2, 1];
  lic.slots = [
    ...(octo ? [{ ...octo, verses: verses.slice(0, 6 - nMen), count: 6 - nMen }] : []),
    { verses: verses.slice(6 - nMen), count: nMen, source: 'menaion', provenance: prov,
      key: `auto.${date}.lordICall`, tone: licHymns[0].tone, label: licHymns[0].label },
  ];
  lic.glory = { source: 'menaion', provenance: prov, key: `auto.${date}.lordICall.glory`,
    tone: licGloryNow.tone, label: licGloryNow.label, combinesGloryNow: true };
  lic.now = null;
  autoSlot.lordICall = { hymns: licHymns, glory: licGloryNow };

  // ── Aposticha: the feast's own stichera with proper verses ───────────────
  if (set.aposticha) {
    const hymns = (set.aposticha.hymns || []).map(r).filter(Boolean);
    const glory = r(set.aposticha.glory);
    const now   = r(set.aposticha.now);
    const ap = vespers.aposticha;
    ap.slots = hymns.map((h, i) => ({
      position: i + 1, source: 'menaion', provenance: prov,
      key: `auto.${date}.aposticha.hymns.${i}`, tone: h.tone, label: h.label,
      ...(i >= 1 && apostVerses?.[i - 1] ? { verse: apostVerses[i - 1] } : {}),
    }));
    ap.glory = glory ? { source: 'menaion', provenance: prov, key: `auto.${date}.aposticha.glory`,
      tone: glory.tone, label: glory.label, combinesGloryNow: false } : null;
    ap.now = now ? { source: 'menaion', provenance: prov, key: `auto.${date}.aposticha.now`,
      tone: now.tone, label: 'Theotokion' } : ap.now;
    autoSlot.aposticha = { hymns, ...(glory ? { glory } : {}), ...(now ? { now } : {}) };
  }

  // ── Troparia: first, then "Glory… now and ever…" ─────────────────────────
  if (set.troparia) {
    const first = r(set.troparia.first);
    const gn    = r(set.troparia.gloryNow);
    if (first && gn) {
      vespers.troparia.slots = [
        { order: 1, source: 'menaion', provenance: prov, key: `auto.${date}.troparion`,
          tone: first.tone, label: first.label },
        { position: 'now', combinesGloryNow: true, source: 'menaion', provenance: prov,
          key: `auto.${date}.feastTroparion`, tone: gn.tone, label: gn.label },
      ];
      autoSlot.troparion      = first;
      autoSlot.feastTroparion = gn;
    }
  }
  return true;
}

module.exports = { applyServiceSet, resolveHymn };
