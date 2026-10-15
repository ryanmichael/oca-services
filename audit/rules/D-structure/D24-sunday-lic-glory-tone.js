'use strict';

// Sunday Great Vespers "Lord, I Call" — the Glory (doxastikon) must be sung in
// the tone the OCA Order of Services appoints for it.
//
// Discovered 2026-10-15 reviewing the choir packet for 2026-10-17/10-25. Two
// separate defects, one slot:
//
//   10-18 (St Luke)  order: "Glory… St. Luke, Tone 6"
//                    ours:  St Peter of Cetinje, no tone at all.
//     St Luke had no `lordICall` order=0 row, so the multi-commemoration merge
//     in server-lib/assemble/for-date.js (~line 172) took the Glory from
//     "whichever saint supplies one" — a Lambertsen set for a minor
//     co-commemoration the order does not sing at all. Luke's own Glory was
//     simply absent from the DB.
//
//   10-25 (Martyrs Marcian and Martyrius)  order: "Glory… Martyrs, Tone 1"
//                    ours:  "I weep and I lament when I contemplate death", Tone 8.
//     A movable memorial Saturday (Demetrius Saturday, 2026-10-24) had been
//     scraped onto the fixed date, so the Glory was a funeral idiomelon. See
//     validateDepartedTextMiskey in server-lib/overlays/drift.js.
//
// WHY TONE AND NOT IDENTITY: the order names the saint in prose ("St. Luke",
// "Martyrs", "Ven. Theodosius") and matching that against a rendered label is
// the string-comparison trap that feedback_assert_structure_not_labels exists
// to warn about. The TONE is a number the order states outright, it differs
// from the surrounding slots often enough to be discriminating (10-18 wants 6
// where the stichera are 8 and the Dogmatikon 3), and it caught both defects
// above. 242 of 242 order files expose it.
//
// WHY NOT D21: D21 asserts the resurrectional/Menaion COUNT. Both dates above
// had a correct count — 10-18 rendered exactly 4+6 — and D21 passed clean on
// both while the Glory was a different saint's funeral hymn.

const { orderLicGloryTone } = require('../../../server-lib/sources/order-of-services');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The tone of the hymn filling the Lord-I-Call Glory slot.
 *
 * Found by STRUCTURE, not by label: the Glory is the hymn block that follows
 * the "Glory to the Father…" doxology and precedes the "Now and ever…" one.
 * Reading a label would have missed 10-18 entirely, where the offending block
 * was labelled with a real saint's name and looked perfectly well-formed.
 */
function renderedGloryTone(blocks) {
  const lic = blocks.filter(b => (b.section || '') === 'Lord, I Have Cried');
  for (let i = 0; i < lic.length; i++) {
    const b = lic[i];
    if (b.type !== 'doxology') continue;
    const text = String(b.text || '');
    if (!/^Glory to the Father/i.test(text)) continue;
    // A COMBINED "Glory… now and ever…" block means the day has no distinct
    // Glory slot at all — the saint's or feast's doxastikon is missing and the
    // Dogmatikon has slid up into its place. That is a real defect (2026-01-04
    // loses "Glory… Forefeast, Tone 3") but it is a MISSING-HYMN defect, and
    // reporting it here as a tone mismatch would describe it wrongly and
    // duplicate D6/D7. Leave it to them.
    if (/now and ever/i.test(text)) return null;
    // The next hymn block before the "Now and ever" doxology is the Glory.
    for (let j = i + 1; j < lic.length; j++) {
      const n = lic[j];
      if (n.type === 'doxology') break;
      if (n.type === 'hymn') return { tone: n.tone ?? null, label: n.label || '' };
    }
  }
  return null;
}

// The Glory slot is filled from the Triodion or Pentecostarion on the movable
// cycle's Sundays, and those hymns carry the WEEK's tone rather than the tone
// the order prints for them — 2026-03-01 renders the correct Sunday-of-
// Orthodoxy doxastikon ("Grace and truth have shone forth") tagged Tone 5, the
// week's tone, where the order appoints Tone 2. Six Sundays in 2026 do this.
// It is a real provenance/tone-carrying defect in the Triodion source, not the
// Menaion-attribution defect this rule exists to catch, and it needs its own
// fix in the Triodion loader. Measured 2026-10-15; do not fold it in here.
const MOVABLE_CYCLE_GLORY = /triodion|pentecostarion/i;
const THEOTOKION_LABEL    = /theotokion|dogmatik/i;

module.exports = {
  id:             'D24-sunday-lic-glory-tone',
  family:         'structure',
  // MEDIUM ONLY BECAUSE OF AN OPEN BURN-DOWN, not because a wrong Glory is a
  // small thing — it is the single most audible hymn in the section. On the
  // day this rule was written it found eight Sundays in 2026 beyond the two it
  // was built for, and `--strict` exits 2 on `high`, so shipping it high would
  // have failed every push until all eight were sourced:
  //
  //   2026-02-15  renders Tone 3, order appoints 8
  //   2026-04-26  renders Tone 2, order appoints 6
  //   2026-05-03  renders Tone 3, order appoints 5
  //   2026-05-10  renders Tone 4, order appoints 6
  //   2026-06-07  renders Tone 8 "(for the Departed…)", order appoints 6
  //               ← comm 1135, also on KNOWN_DEPARTED_MISKEYS: F3's class again
  //   2026-07-19  renders Tone 8 (Ven. Seraphim relics), order appoints 6
  //   2026-08-23  renders Tone 6 (Leavetaking of the Dormition), order appoints 1
  //   2026-09-27  renders Tone 4 (Martyr Callistratus), order appoints 6
  //
  // Each needs the saint's own doxastikon sourced, the way 10-18 and 10-25
  // were. RAISE TO HIGH once that list is empty — it is a burn-down, and the
  // alternative (a suppression map) is what `knownFailures` being empty is
  // project policy against.
  severity:       'medium',
  description:    'Sunday Great Vespers Lord-I-Call Glory is sung in the tone the OCA Order of Services appoints. Added 2026-10-15 after 2026-10-18 sang a co-commemoration\'s doxastikon and 2026-10-25 sang a funeral idiomelon, both with D21 passing clean.',
  needsAssembled: true,

  appliesTo: (ctx) => {
    if (ctx.service !== 'vespers') return false;
    // Vespers is date-shifted: a Saturday-evening service belongs to Sunday.
    const d = new Date(`${ctx.date}T12:00:00Z`);
    if (d.getUTCDay() !== 6) return false;
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    return orderLicGloryTone(sunday) !== null;
  },

  check: (ctx) => {
    const d      = new Date(`${ctx.date}T12:00:00Z`);
    const sunday = new Date(d.getTime() + DAY_MS).toISOString().slice(0, 10);
    const want   = orderLicGloryTone(sunday);
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    const got = renderedGloryTone(blocks);
    // No Glory slot rendered at all is D7's finding, not this rule's.
    if (!got) return [];
    // The Dogmatikon occupying the Glory slot means the slot is empty, not
    // mis-toned — same reasoning as the combined-doxology case above.
    if (THEOTOKION_LABEL.test(got.label)) return [];
    if (MOVABLE_CYCLE_GLORY.test(got.label)) return [];

    // A Great Feast on a Sunday replaces the whole Lord-I-Call set and the
    // order prints the feast's own appointments; the slot is still a Glory but
    // the comparison stops meaning what it means on an ordinary Sunday.
    if (ctx.calendarEntry?.liturgicalContext?.greatFeast) return [];

    if (got.tone === want) return [];

    // A TONELESS Glory is the sharper signal, not a softer one: every properly
    // sourced doxastikon carries its tone, so a null means the slot was filled
    // from a set that was never appointed here. 10-18 rendered exactly this.
    const describe = got.tone === null ? 'no tone at all' : `Tone ${got.tone}`;
    return [{
      message: `Sunday ${sunday} Lord-I-Call Glory renders ${describe}`
             + `${got.label ? ` (${got.label})` : ''}; the OCA order appoints Tone ${want}.`,
      hint:    `reference/orders/${sunday.slice(0,4)}-${sunday.slice(5,7)}${sunday.slice(8)}-order-services.txt. `
             + `Check (a) that the principal commemoration has its own stichera row at section='lordICall', "order"=0 — `
             + `when it does not, the multi-commemoration merge in server-lib/assemble/for-date.js borrows a `
             + `co-commemoration's doxastikon — and (b) that the row is the saint's own hymn and not a memorial `
             + `text scraped from a movable Saturday (npm run drift:check).`,
    }];
  },
};
