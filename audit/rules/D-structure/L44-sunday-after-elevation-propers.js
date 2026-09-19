'use strict';

// The Sunday After the Exaltation of the Cross carries a SECOND complete set of
// Liturgy propers layered on the Sunday cycle:
//
//     Prokeimenon: Resurrection, Tone N  and  Feast, Tone 7
//     Epistle:     Galatians 2:16-20     and  the Sunday-cycle pericope
//     Alleluia:    Resurrection, Tone N  and  Feast, Tone 1
//     Gospel:      Mark 8:34-9:1         and  the Sunday-cycle pericope
//     Instead of "It is truly meet…": the festal megalynarion
//     Communion:   "Praise the Lord from the heavens…"  and
//                  "The light of Thy countenance…"
//
// Measured across four orders — 2023-0917, 2024-0915, 2025-0921, 2026-0920.
// The 2025 order is the one that spells out that BOTH halves are sung; the
// others abbreviate to the feast half, which is what made this look like a
// replacement rather than an addition.
//
// Before 2026-09-19 none of it rendered. Two separate causes:
//   - the propers were simply unwired (prokeimenon / alleluia / koinonikon /
//     megalynarion), and
//   - orthocal tags the FIRST reading "Sunday after Elevation" and leaves the
//     Sunday-cycle reading undescribed, so pickPrimaryAndSecondary — which
//     treats a described first reading as suppressing the rest — dropped BOTH
//     second readings. So even the Epistle, which the second-propers machinery
//     normally emits unconditionally, was missing.
//
// INDEPENDENT SIGNAL: this rule detects the day from the assembled liturgical
// label / commemorations, NOT from the propers wiring it is guarding. A rule
// that keyed off the same detector would pass by construction.

const FEAST_PROK = /Extol the Lord our God/i;
const FEAST_ALL  = /Remember Thy congregation/i;
const MEGALYN    = /most precious Cross of the Lord/i;

function hymnsIn(blocks, section) {
  return blocks.filter(b => b.section === section
    && (b.type === 'hymn' || b.type === 'verse' || b.type === 'rubric'));
}

module.exports = {
  id:             'L44-sunday-after-elevation-propers',
  family:         'structure',
  severity:       'high',
  description:    'The Sunday After the Exaltation sings the feast propers beside the Sunday set — second prokeimenon (Tone 7), second alleluia (Tone 1), second Epistle and Gospel, and the festal megalynarion. Opened 2026-09-19; none of it rendered before.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy' || ctx.dow !== 'sunday') return false;
    // The signal is purely CALENDRICAL: the Sunday After the Exaltation is the
    // Sunday falling Sep 15-21 (the feast is the 14th, its leavetaking the
    // 21st). That is independent of the propers wiring this rule guards, and of
    // the orthocal feast label the wiring keys off — so the rule cannot pass by
    // construction.
    //
    // It deliberately does NOT read ctx.calendarEntry.commemorations: those are
    // EMPTY in the liturgy audit context, which made a first version of this
    // rule silently unable to fire at all (caught by falsifying it — the same
    // dead-rule failure as M30's first draft).
    const d = String(ctx.calendarEntry?.date || ctx.date || '');
    const [, m, day] = d.split('-').map(Number);
    return m === 9 && day >= 15 && day <= 21;
  },
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const issues = [];
    const text = (arr) => arr.map(b => b.text || '').join(' ');

    const prok = hymnsIn(blocks, 'Prokeimenon');
    if (!FEAST_PROK.test(text(prok))) {
      issues.push({
        message: 'Sunday After the Exaltation: the feast prokeimenon ("Extol the Lord our God…", Tone 7) is not sung beside the Sunday one.',
        hint:    'sundayAfterElevation → SUNDAY_AFTER_ELEVATION_PROPER.prokeimenon attaches as .secondary in liturgy-from-orthocal.js.',
      });
    }

    const alle = hymnsIn(blocks, 'Alleluia');
    if (!FEAST_ALL.test(text(alle))) {
      issues.push({
        message: 'Sunday After the Exaltation: the feast alleluia ("Remember Thy congregation…", Tone 1) is not sung beside the Sunday one.',
        hint:    'Attach SUNDAY_AFTER_ELEVATION_PROPER.alleluia as .secondary.',
      });
    }

    for (const [section, label] of [['Epistle Reading', 'Epistle'], ['Gospel Reading', 'Gospel']]) {
      const refs = blocks.filter(b => b.section === section && b.type === 'rubric'
        && /\d/.test(b.text || ''));
      if (refs.length < 2) {
        issues.push({
          message: `Sunday After the Exaltation: only ${refs.length} ${label} pericope(s) rendered; the order reads the feast reading AND the Sunday-cycle one.`,
          hint:    'orthocal describes the FIRST reading, so pickPrimaryAndSecondary suppresses the cycle reading — restore it as .secondary (not `continuation`: these are not "read as one").',
        });
      }
    }

    const meg = text(hymnsIn(blocks, 'Hymn to the Theotokos'));
    if (meg && !MEGALYN.test(meg)) {
      issues.push({
        message: 'Sunday After the Exaltation: "It is truly meet" is sung where the order prints the festal megalynarion ("Magnify, O my soul, the most precious Cross of the Lord!").',
        hint:    'isElevationAfterfeast (Sep 14-21) selects GREAT_FEAST_VARIANTS.elevation.megalynarion, as the Transfiguration and Dormition windows already do.',
      });
    }

    return issues;
  },
};
