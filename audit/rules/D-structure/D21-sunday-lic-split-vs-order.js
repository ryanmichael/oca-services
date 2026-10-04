'use strict';

// Sunday Great Vespers "Lord, I Call" — the resurrectional/Menaion split must
// match the count the OCA Order of Services publishes for that Sunday.
//
// Discovered 2026-10-01 reviewing the choir packet for 2026-10-04 (Hieromartyr
// Hierotheus). The order reads:
//
//     7 stichera of the Resurrection, Tone 1
//     3 stichera of St. Hierotheus, Tone 4
//
// We rendered 4 + 6: three of Hierotheus, a fourth of his that the order does
// not appoint, and two of Ven. Paul the Simple — a co-commemoration the order
// does not sing at all. Three Resurrection stichera were pushed off the end.
//
// Root cause is the multi-commemoration merge in server-lib/assemble/for-date.js
// (~line 150): when more than one commemoration on the day carries lordICall
// stichera it concatenates them, renumbers, and caps at `maxLicStichera` (6 on
// a Sunday). On a simple-rank Sunday the OCA split is 7 + 3, so the cap never
// bites and the Menaion takes six slots.
//
// WHY THIS RULE AND NOT D15: D15 is a SOURCE-completeness check — it asserts
// variable-sources/octoechos.json ships ≥7 hymns per tone, runs on a single
// date (2026-01-01), and every tone sits in its KNOWN_SOURCE_GAPS, so it never
// fires. Nothing asserted the RENDERED split. `audit:date` passed 2026-10-03
// clean at 0/0/0 while the service was three stichera short.
//
// The oracle is `reference/orders/YYYY-MMDD-order-services.txt`, which states
// the count in prose ("7 stichera of the Resurrection"). 224 of the 241 order
// files carry it. Sundays with no order file are skipped — silently, because a
// missing oracle is not a finding.

// The parser lives with the assembler that now CONSULTS it, so this rule and
// the code it audits can never disagree about what the order says.
const { orderResurrectionCount } = require('../../../server-lib/sources/order-of-services');

/**
 * Count the numbered RESURRECTIONAL stichera actually rendered at Lord I Call.
 *
 * Counts by label rather than by `source`: on a Lenten Sunday the resurrectional
 * hymns come from the Triodion, not the Octoechos, and a source-based count
 * reported zero for nine consecutive Sundays while measuring this — a probe
 * artifact that would have become nine phantom findings.
 *
 * The Dogmatikon/Theotokion closes the section at "Now and ever" and is never a
 * numbered sticheron, so it is excluded.
 */
function renderedResurrectionCount(blocks) {
  let n = 0;
  for (const b of blocks) {
    if ((b.section || '') !== 'Lord, I Have Cried') continue;
    if (b.type !== 'hymn') continue;
    const label = b.label || '';
    if (/theotokion|dogmatik/i.test(label)) continue;
    if (/resurrection/i.test(label)) n++;
  }
  return n;
}

// 2026-10-02/03 UPDATE — these gaps are CLOSED and the map is deliberately empty.
//
// This rule previously suppressed 2026-06-07, 2026-10-04 and 2026-10-25 on the
// grounds that the split needed the principal's Typikon rank, which we do not
// have. That reasoning was wrong, and 2026-10-04 was sung from a wrong sheet at
// Great Vespers on 2026-10-03 before anyone noticed: six of the ten stichera.
//
// Rank is indeed useless here — `commemorations.rank` is NULL for all 2,638
// rows, and orthocal's `feast_level` gives 07-12 Proclus (correctly 4+6) and
// 10-25 Marcian (should be 7+3) the same level 0. Do not re-try either.
//
// But the ORDER FILE states the count per date, and it separates the cases
// cleanly: the Sundays that correctly render 4+6 (01-18, 07-12, 07-26, 09-20,
// 10-18 …) all read "4 stichera of the Resurrection", while 10-04 and 10-25
// read 7 and 06-07/11-01 read 6. The oracle this rule already parsed to DETECT
// the bug was sufficient to FIX it; for-date.js now appoints the Menaion count
// from it directly.
//
// Keep this empty. A new entry here means a Sunday is being suppressed rather
// than fixed — the mistake this comment exists to prevent.
const KNOWN_RANK_GAPS = {};

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  id:             'D21-sunday-lic-split-vs-order',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Great Vespers Lord-I-Call resurrectional count matches the OCA Order of Services for that Sunday. Added 2026-10-01 after 2026-10-04 rendered 4+6 where the order appoints 7+3.',
  needsAssembled: true,

  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    // Vespers is date-shifted: a Saturday-evening service belongs to Sunday.
    const d = new Date(`${ctx.date}T12:00:00Z`);
    if (d.getUTCDay() !== 6) return false;
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    return orderResurrectionCount(sunday) !== null;
  },

  check: (ctx) => {
    const d      = new Date(`${ctx.date}T12:00:00Z`);
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    const want   = orderResurrectionCount(sunday);
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const got = renderedResurrectionCount(blocks);
    // A Great Feast falling on a Sunday replaces the resurrectional set
    // entirely; the order then prints the feast's own count and this
    // comparison is meaningless.
    if (got === 0) return [];
    if (got === want) return [];

    // DEFICIT ONLY, for now. An EXCESS (we render more resurrectional stichera
    // than the order appoints) is a separate, known class: the Octoechos source
    // ships 6 per tone where the canon wants 7, so the runtime doubles
    // sticheron #1 to fill the slot — see D15's KNOWN_SOURCE_GAPS and
    // project_sunday_great_vespers_ordinary_time. Eight Sundays in 2026 are +1
    // for that reason, and flagging them here would re-report a documented
    // source gap as a structural defect.
    //
    // A DEFICIT is different in kind: the Menaion has taken slots the order
    // gives to the Resurrection, so the parish sings fewer resurrectional
    // hymns and extra saint hymns. That is what 2026-10-04 did.
    if (got > want) return [];
    if (KNOWN_RANK_GAPS[sunday]) return [];

    return [{
      message: `Sunday ${sunday} Lord-I-Call renders ${got} resurrectional stichera; the OCA order appoints ${want}.`,
      hint:    `reference/orders/${sunday.slice(0,4)}-${sunday.slice(5,7)}${sunday.slice(8)}-order-services.txt. `
             + `A deficit usually means the Menaion took extra slots — check whether a second commemoration's `
             + `stichera were merged in (server-lib/assemble/for-date.js multi-commemoration branch).`,
    }];
  },
};
