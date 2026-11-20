'use strict';

// A Sunday inside the afterfeast of a Theotokos feast (Meeting, Dormition,
// Nativity of the Theotokos, Entry, Annunciation) or of the Transfiguration
// sings the feast's Liturgy propers beside the Sunday's:
//
//     Prokeimenon: Resurrection, Tone N  and  Feast
//     Alleluia:    Resurrection, Tone N  and  Feast
//     Instead of "It is truly meet…": the festal megalynarion
//     Communion:   "Praise the Lord from the heavens…"  and  the feast's
//
// Every order in reference/orders/ for such a Sunday prints this (2022-0206,
// 2022-0807, 2022-0821, 2022-0911, 2023-0205, 2023-0326, 2023-0820,
// 2023-0910, 2025-0817, 2026-1122). A polyeleos saint inside the window takes
// the second set instead (2026-0809, St. Herman) — still two of each.
//
// Before 2026-11-20 none of the feast half rendered on these Sundays, and the
// Entry/Meeting/Nativity-of-the-Theotokos Sundays sang "It is truly meet".
// Found reviewing the Tyler choir packet for 2026-11-22; audit:date was clean.
//
// INDEPENDENT SIGNAL: the window is detected from the rendered Troparia rubric
// (the menaion DB's commemoration title, via the troparia path), not from the
// AFTERFEAST_SUNDAY_FEASTS detector in liturgy-from-orthocal.js that this rule
// guards.

const WINDOW = /Troparion of (?:Afterfeast|Leavetaking) of the (?:Meeting of our Lord|Transfiguration|Dormition|Nativity of the (?:Mother of God|Theotokos)|Entry of the Most Holy|Annunciation)/i;

module.exports = {
  id:             'L46-afterfeast-sunday-feast-propers',
  family:         'structure',
  severity:       'high',
  description:    'A Sunday inside a Theotokos-feast or Transfiguration afterfeast renders a second prokeimenon, alleluia and koinonikon and the festal megalynarion. Regression class discovered 2026-11-19.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy' && ctx.dow === 'sunday',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const inWindow = blocks.some(b => b.section === 'Troparia' && WINDOW.test(b.text || ''));
    if (!inWindow) return [];

    const findings = [];
    const ids = blocks.map(b => b.id);
    const at = (id) => ids.indexOf(id);

    // Second prokeimenon, in position: after the Sunday one, before the Epistle.
    const p2 = at('prok-2-refrain');
    if (p2 < 0 || p2 < at('prok-refrain')) {
      findings.push({
        message: 'Afterfeast Sunday has no second prokeimenon after the Sunday one (expected Feast, or a polyeleos saint).',
        hint:    'Check the afterfeastSundayFeast prokeimenon attach in liturgy-from-orthocal.js.',
      });
    }
    if (!ids.some(id => id.startsWith('all-2-'))) {
      findings.push({
        message: 'Afterfeast Sunday has no second alleluia.',
        hint:    'Check the afterfeastSundayFeast alleluia attach.',
      });
    }
    const meg = blocks.find(b => b.id === 'megalynarion');
    if (meg && /^It is truly meet/.test(meg.text || '')) {
      findings.push({
        message: 'Afterfeast Sunday sings "It is truly meet"; the order prints the festal megalynarion in its place.',
        hint:    'Check the megalynarion chain (afterfeastSundayFeast / is*Afterfeast).',
      });
    }
    const comm = new Set(blocks
      .filter(b => b.section === 'Communion Hymn' && /^ch-(?:2-)?text$/.test(b.id))
      .map(b => b.text));
    if (comm.size < 2) {
      findings.push({
        message: `Afterfeast Sunday has ${comm.size} koinonikon; expected 2 ("Praise the Lord…" and the feast's).`,
        hint:    'Check the afterfeastSundayFeast communionHymn attach (prescribed past the parish toggle).',
      });
    }
    return findings;
  },
};
