'use strict';

// A Great Feast served with an all-night vigil is appointed Old Testament
// lessons (paremias) at Great Vespers — three, typically, read after the
// prokeimenon and before the Litya.
//
// The renderer (assemblers/vespers-parts/ot-readings.js), the orthocal text
// enrichment (server-lib/routes/api-service.js) and the attachment hook
// (calendar/entry.js attachPolyeleosParemias) all already existed. Two things
// still made the lessons unreachable on every one of the Twelve Great Feasts:
//
//   1. attachPolyeleosParemias gated on `polyeleos` or `vigil` rank only, so
//      `greatFeast` — the rank most certain to have paremias — was the single
//      rank excluded. Fixed 2026-09-07.
//   2. No Great Feast menaion file carried `vespers.otReadings` at all, so
//      even with the gate open there was nothing to attach.
//
// Because both ends were empty the gap was invisible from either side, and the
// 8-09 St. Herman fix that introduced the hook did not reveal it. Found
// 2026-09-07 reviewing the 9-08 Nativity of the Theotokos vigil against OCA
// 2025-0908-texts-tt.docx, which prints Gen. 28:10-17, Ez. 43:27-44:4 and
// Prov. 9:1-11.
//
// KNOWN_SOURCE_GAPS below lists the feasts whose lessons are not yet authored.
// They are reported at `low` so the backlog stays visible without failing the
// gate; remove a date from the map as soon as its menaion file declares
// `vespers.otReadings`, and the rule starts enforcing it at full severity.

// MM-DD → why the lessons are not yet in the corpus.
const KNOWN_SOURCE_GAPS = {
  '01-06': 'Theophany — lessons not yet authored (OCA text not on hand).',
  '02-02': 'Meeting of the Lord — lessons not yet authored.',
  '03-25': 'Annunciation — lessons not yet authored.',
  '08-06': 'Transfiguration — lessons not yet authored.',
  '08-15': 'Dormition — lessons not yet authored.',
  '09-14': 'Elevation of the Cross — lessons not yet authored.',
  '11-21': 'Entry of the Theotokos — lessons not yet authored.',
  '12-25': 'Nativity of Christ — lessons not yet authored.',
};

module.exports = {
  id:             'D19-vespers-great-feast-paremias',
  family:         'structure',
  severity:       'medium',
  description:    'A Great Feast vigil must render its appointed Old Testament lessons. Gap found 2026-09-07 — `greatFeast` was excluded from the paremia gate AND no Great Feast menaion file declared otReadings.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    // The vigil enters the CONTENT day, which is what the calendar entry holds.
    return ctx.calendarEntry?.vespers?.serviceType === 'all-night-vigil'
        && !!ctx.calendarEntry?.liturgicalContext?.greatFeast;
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const lessons = blocks.filter(b => b.section === 'Old Testament Readings');
    if (lessons.length) return [];

    // Key by the content day the vigil enters.
    const d   = String(ctx.calendarEntry?.date || ctx.date || '');
    const key = d.slice(5, 10);
    const gap = KNOWN_SOURCE_GAPS[key];

    return [{
      severity: gap ? 'low' : 'medium',
      message: gap
        ? `Great Feast vigil renders no Old Testament lessons — known source gap: ${gap}`
        : `Great Feast vigil renders no Old Testament lessons, and ${key} is not a known source gap.`,
      hint: gap
        ? `Author vespers.otReadings into the menaion file for ${key} (citations alone are enough — ` +
          'orthocal fills the scripture text), then drop the date from KNOWN_SOURCE_GAPS in this rule.'
        : 'Check calendar/entry.js attachPolyeleosParemias — the rank gate must admit `greatFeast`, ' +
          'and the menaion file must declare vespers.otReadings.',
    }];
  },
};
