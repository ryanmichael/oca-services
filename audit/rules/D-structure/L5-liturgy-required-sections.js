'use strict';

// Liturgy must always render its canonical skeleton. Encoded here so a refactor
// that silently drops an entire section (e.g., Kontakia disappearing on a feast
// variant path, or Hymn to the Theotokos missing because a megalynarion override
// returned []) is caught the moment it lands, on every Liturgy across the year.
//
// Catechumens / Litany for the Catechumens are intentionally NOT listed — they
// are conditionally suppressed by parish overlay rubric (omitCatechumensSeasons).
// Homily is also pastoral discretion, not invariant.

// Sections that always render under their canonical label.
const REQUIRED_SECTIONS = [
  'First Antiphon',
  'Second Antiphon',
  'Third Antiphon',
  'Little Entrance',
  'Entrance Hymn',
  'Troparia',
  'Kontakia',
  'Trisagion',
  'Prokeimenon',
  'Epistle Reading',
  'Alleluia',
  'Gospel Reading',
  'Great Entrance',
  'The Creed',
  'Anaphora',
  'Hymn to the Theotokos',
  "The Lord's Prayer",
  'Communion Hymn',
  'Communion Prayer',
  'Dismissal',
];

// The Cherubic Hymn is *substituted* on a handful of days (Holy Thursday →
// "Of Thy Mystical Supper", Holy Saturday → "Let all mortal flesh keep
// silence"). Treat any of these section labels as satisfying the requirement.
const CHERUBIC_LABELS = [
  'Cherubic Hymn',
  'Mystical Supper Hymn',
  'Let All Mortal Flesh Keep Silence',
];

module.exports = {
  id:             'L5-liturgy-required-sections',
  family:         'structure',
  severity:       'high',
  description:    'Liturgy renders the canonical section skeleton — antiphons through dismissal.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const present = new Set(blocks.map(b => b.section).filter(Boolean));
    const missing = REQUIRED_SECTIONS.filter(s => !present.has(s));
    if (!CHERUBIC_LABELS.some(l => present.has(l))) missing.push('Cherubic Hymn');
    if (!missing.length) return [];
    return [{
      message: `Liturgy missing required section(s): ${missing.join(', ')}.`,
      hint:    'Check the variant path that built this date (great-feast / paschal / weekday) — a section block is being dropped before render.',
    }];
  },
};
