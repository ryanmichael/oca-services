'use strict';

// Holy Fathers Bug 2 pattern: when aposticha slots all point at the section
// rather than indexed hymns, the resolver returns hymns[0] for every slot and
// the first sticheron repeats. Scope to services where aposticha hymns are
// expected to be distinct (no `repeatPrevious` slots in the calendar entry).
module.exports = {
  id:             'E4-aposticha-distinct',
  family:         'provenance',
  severity:       'high',
  description:    'Aposticha hymn slots without `repeatPrevious` must render distinct text.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers' && ctx.service !== 'presanctified') return false;
    const slots = ctx.calendarEntry?.vespers?.aposticha?.slots || [];
    if (slots.length < 2) return false;
    return !slots.some(s => s.repeatPrevious);
  },
  check: (ctx) => {
    const apo = (ctx.assembled?.blocks || [])
      .filter(b => /Aposticha/i.test(b.section || '') && b.type === 'hymn' && !/Glory|Theotokion/i.test(b.label || ''));
    if (apo.length < 2) return [];
    const fingerprints = apo.map(b => (b.text || '').replace(/\s+/g, ' ').trim().toLowerCase());
    const seen = new Map();
    const dupes = [];
    fingerprints.forEach((fp, i) => {
      if (!fp) return;
      if (seen.has(fp)) dupes.push({ first: seen.get(fp), repeat: i });
      else seen.set(fp, i);
    });
    if (!dupes.length) return [];
    return [{
      message: `Aposticha has ${dupes.length} duplicate hymn(s) (slots ${dupes.map(d => `${d.first}↔${d.repeat}`).join(', ')}); slot keys may point at section instead of hymn index`,
      hint: 'See DB_FULL_APOSTICHA / DB_APOSTICHA_HYMN_COUNT — slot.key should use .hymns.${i}',
    }];
  },
};
