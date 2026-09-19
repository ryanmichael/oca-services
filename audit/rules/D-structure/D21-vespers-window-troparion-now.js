'use strict';

// Saturday-eve Great Vespers inside a Great Feast's window (afterfeast /
// forefeast / leavetaking): the Feast's troparion takes "Now and ever…".
//
// Measured across the 30 feast-window Sunday orders in reference/orders/
// (2022-2026): every Great-Feast window sings its troparion at "Now and
// ever…", either after a saint's Glory —
//     Resurrectional Troparion / Glory… St. Dometius / Now… Transfiguration
// — or, when no saint sings, under the combined doxology —
//     Resurrectional Troparion / Glory… now and ever… Troparion of the Feast
// (2022-0814, 2023-0108, 2023-0205, 2024-0114, 2026-0823). The one lesser
// window in the set, the Beheading afterfeast (2026-0830), closes with the
// dismissal Theotokion instead — windowClaimsNowAndEver already encodes that.
//
// We were rendering the window at the GLORY with the Octoechos dismissal
// Theotokion at Now on every one of the five 2026 eves (1-03, 8-15, 8-22,
// 9-19, 11-21). Counts and membership were fine; the position was wrong.
// Found 2026-09-13 while wiring the 9-13 Founding of the Church.
//
// WHICH saint takes the Glory on the other dates is not derivable from the
// orders (Micah is dropped on 2022-0814; Dometius, Eudocimus and Thaddaeus
// sing) — so the three 2026 eves whose order names a saint at the Glory are
// tracked at `low` in KNOWN_GLORY_GAPS rather than guessed.
//
// 09-19 was resolved 2026-09-19: the choir packet and the OCA order both
// name St. Eustathius at the Glory, so he is now wired through
// FEAST_WINDOW_COCOMMEMORATIONS and no longer a gap.

const WINDOW = /^(?:Afterfeast|Forefeast|Leavetaking|Midfeast|Postfeast)\b/i;
const GREAT = /(Dormition|Elevation of the Cross|Entry (?:of|into) the|Meeting of our Lord|Nativity of our Lord|Nativity of the (?:Mother of God|Theotokos)|Theophany|Transfiguration|Annunciation|Pentecost)/i;

// MM-DD of the Vespers (civil) date → who the OCA order puts at the Glory.
const KNOWN_GLORY_GAPS = {
  '01-03': 'Troparion of the Apostles (Synaxis of the Seventy), Tone 3 — order 2026-0104.',
  '08-15': 'Troparion of the Image Not-Made-by-Hands, Tone 2 — order 2026-0816.',
};

module.exports = {
  id:             'D21-vespers-window-troparion-now',
  family:         'structure',
  severity:       'high',
  description:    'On a Saturday-eve Great Vespers inside a Great Feast’s window, the Feast troparion sits at "Now and ever…" (combined with the Glory when no saint sings), never at the Glory with a Theotokion after it. Measured across 30 OCA orders; opened 2026-09-13.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers' && ctx.dow === 'sunday',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const trop = blocks.filter(b => b.section === 'Troparia' && (b.type === 'hymn' || b.type === 'doxology'));
    const winIdx = trop.findIndex(b => b.type === 'hymn' && WINDOW.test(b.label || '') && GREAT.test(b.label || ''));
    if (winIdx < 0) return [];

    const findings = [];
    const before = trop[winIdx - 1];
    const after  = trop.slice(winIdx + 1);
    // The doxology immediately before the window must be a Now-and-ever
    // (plain or combined), and nothing may follow the window.
    const nowBefore = before && before.type === 'doxology' && /now and ever/i.test(before.text || '');
    if (!nowBefore || after.length) {
      findings.push({
        message: `Feast-window troparion "${(trop[winIdx].label || '').slice(0, 40)}" is not at "Now and ever…" — preceded by "${(before?.text || '').slice(0, 30)}", followed by ${after.length} block(s).`,
        hint:    'Check the window-principal branch of the Vespers troparia in server-lib/assemble/for-date.js (autoSlot.feastTroparion / windowCombinesGloryNow).',
      });
    }

    // Tracked half: the order names a saint at the Glory and we sing none.
    const key = String(ctx.date || '').slice(5, 10);
    const gap = KNOWN_GLORY_GAPS[key];
    const hasGlory = trop.some(b => b.type === 'doxology' && /^Glory to the Father, and to the Son, and to the Holy Spirit\.$/.test((b.text || '').trim()));
    if (gap && !hasGlory) {
      findings.push({
        severity: 'low',
        message:  `No saint sings at the Glory before the Feast troparion; the OCA order appoints ${gap}`,
        hint:     'Not derivable as a rank rule (Micah is dropped on 2022-0814 while Dometius sings on 2022-0807). Add a FEAST_WINDOW_COCOMMEMORATIONS entry with the order as evidence, or a picker rule once measured.',
      });
    }
    return findings;
  },
};
