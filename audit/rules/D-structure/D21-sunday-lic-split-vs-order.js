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

const fs   = require('fs');
const path = require('path');

const ORDERS_DIR = path.resolve(__dirname, '..', '..', '..', 'reference', 'orders');

/** `2026-10-04` → the order file's stated Resurrection count, or null. */
function orderResurrectionCount(sundayIso) {
  const [y, m, d] = sundayIso.split('-');
  const file = path.join(ORDERS_DIR, `${y}-${m}${d}-order-services.txt`);
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m2 = txt.match(/(\d+)\s+stichera of the Resurrection/i);
  return m2 ? Number(m2[1]) : null;
}

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

// Sundays whose split cannot be resolved until the principal's Typikon RANK is
// in the data. Same discipline as D13/D15's KNOWN_SOURCE_GAPS: each entry says
// what source would close it.
//
// WHY THESE CANNOT BE FIXED IN THE ASSEMBLER TODAY. The split is a function of
// the saint's rank — a simple-rank saint takes 3 of the 10 slots, a polyeleos+
// saint takes 6. Measured across the 2026 Sundays that have an OCA order, the
// three below and the ~12 that correctly render 4+6 (01-18 Athanasius, 07-12
// Proclus, 07-26 Jacob Netsvetov, 09-20, 10-18 Luke …) are INDISTINGUISHABLE at
// runtime: every one has `commemorations.rank = NULL` and no cocelebrated
// overlay. Capping the Menaion at 3 for that signature would break the twelve
// to fix the three.
//
// TWO CANDIDATE DISCRIMINATORS WERE TESTED AND BOTH FAIL. Do not re-try them:
//
//   1. `commemorations.rank` — NULL for all 2,638 rows. The column is entirely
//      unpopulated and nothing consumes it.
//   2. orthocal's `feast_level` (the oracle scripts/rank-coverage.js uses) —
//      does not separate the two groups. 2026-07-12 (Proclus) is level 0 and
//      correctly renders 4+6; 2026-10-25 (Marcian and Martyrius) is also level
//      0 and should render 7+3. Same level, opposite splits.
//
// Closing these means authoring the appointed sticheron count per commemoration
// from the Typikon/Menaion — liturgical data authoring against a published
// source, not a rule change. See `npm run audit:rank-coverage` and memory
// project_sergius_rank_survey.
const KNOWN_RANK_GAPS = {
  '2026-06-07': 'Synaxis of All Saints — order appoints 6 res + 4; rank NULL, renders 4 + 6.',
  '2026-10-04': 'Hieromartyr Hierotheus — order appoints 7 res + 3; rank NULL, renders 4 + 6. Confirmed against the choir packet 2026-10-01.',
  '2026-10-25': 'Martyrs Marcian and Martyrius — order appoints 7 res + 3; rank NULL, renders 4 + 6.',
};

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
