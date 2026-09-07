'use strict';

// The Third Antiphon on a Great Feast that uses the Typical antiphons is the
// Beatitudes, with troparia drawn from odes 3 and 6 of the feast canon. On a
// weekday feast there is no resurrectional spine, so the whole set comes from
// the feast.
//
// server-lib/sources/beatitudes.js opens with `if (!isSunday) return []`, so
// every weekday feast renders the placeholder rubric "Beatitudes troparia for
// this day are not yet in the system." That placeholder is honest and is NOT
// what this rule objects to — it objects to it going unnoticed.
//
// DO NOT simply delete the !isSunday guard. Checked 2026-09-07 for 9-08:
// reference/orders/2024-0908-order-services.txt appoints
//     4 troparia from Ode 3 of the 1st Canon, Tone 2
//     4 troparia from Ode 6 of the 2nd Canon, Tone 8
// and variable-sources/feast-canons/nativity-theotokos.json holds Canon I only
// — 3 troparia in Ode 3 (one short) and Canon I's Ode 6 in Tone 2 (the wrong
// canon and the wrong tone). Canon II (Andrew of Crete) is absent from the
// corpus entirely.
//
// Wiring the override with that short set would be actively worse than the
// placeholder: the renderer RIGHT-ALIGNS troparia into the twelve Beatitude
// slots, so a list short by three slides every troparion three stichoi late.
// That is exactly the 2026-08-16 failure recorded in
// project_feast_window_sunday_2026_08_10.md, which was caught from the kliros
// mid-Liturgy rather than by the audit. Reserve the missing slots (the
// `missing: N` mechanism in FEAST_BEATITUDES_BLENDS) or ingest Canon II first.

// MM-DD → what is missing before the date's Beatitudes can be wired.
const KNOWN_SOURCE_GAPS = {
  '01-01': 'Circumcision + St. Basil — feast-canon odes 3/6 not in variable-sources/feast-canons/.',
  '02-02': 'Meeting of the Lord — feast-canon odes 3/6 not in variable-sources/feast-canons/.',
  '03-25': 'Annunciation — feast-canon odes 3/6 present but not registered in FEAST_BEATITUDES_OVERRIDES; counts unverified against an OCA order.',
  '08-15': 'Dormition — canon carries irmos/irmos2 only, no troparia at all (same corpus hole as the 8-16 blend).',
  '11-21': 'Entry of the Theotokos — feast-canon odes 3/6 present but counts unverified against an OCA order.',
  '09-08': 'Nativity of the Theotokos — needs Canon II (Andrew of Crete, Tone 8) Ode 6, '
         + 'and a 4th Ode 3 troparion for Canon I. Corpus has Canon I only.',
};

module.exports = {
  id:             'L40-feast-beatitudes-coverage',
  family:         'structure',
  severity:       'low',
  description:    'A Great Feast Liturgy rendering the Beatitudes placeholder must be a documented source gap, not a silent one. Opened 2026-09-07 (9-08 lacks Canon II).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy'
                   && !!ctx.calendarEntry?.liturgicalContext?.greatFeast,
  check: (ctx) => {
    const third = (ctx.assembled?.blocks || [])
      .filter(b => b.section === 'Third Antiphon');
    if (!third.length) return [];

    const placeholder = third.some(b =>
      b.type === 'rubric' && /not yet in the system/i.test(String(b.text || '')));
    if (!placeholder) return [];

    const key = String(ctx.calendarEntry?.date || ctx.date || '').slice(5, 10);
    const gap = KNOWN_SOURCE_GAPS[key];

    return [{
      message: gap
        ? `Great Feast Beatitudes render the placeholder — known source gap: ${gap}`
        : `Great Feast Beatitudes render the placeholder and ${key} is not a known source gap.`,
      hint:
        'Author the missing canon odes into variable-sources/feast-canons/, register the date '
        + 'in FEAST_BEATITUDES_OVERRIDES, and let the !isSunday guard in beatitudes.js build '
        + 'from the override. Reserve any still-missing troparia as `missing: N` slots — the '
        + 'renderer right-aligns into 12 slots, so a short list mis-slots everything before it.',
    }];
  },
};
