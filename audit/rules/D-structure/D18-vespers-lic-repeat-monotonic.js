'use strict';

// "Lord, I Call" stichera must never go backwards.
//
// When a feast publishes fewer unique idiomela than the service has stichoi,
// the extra slots are filled by repeating some of them. WHICH ones repeat is
// printed in the book and lives in variable-sources/lic-repeat-patterns.json;
// what is invariant regardless of feast is that a repeat sits ADJACENT to the
// hymn it repeats. Read down the stichera, the sequence of distinct hymns only
// ever holds or advances — 1,2,3,3,4,4,5,6. It never returns to an earlier
// hymn after moving past it.
//
// The assembler used to fill the slots with `licStichera[i % length]`, which
// appends repeats of stichera 1 and 2 at the TAIL: 1,2,3,4,5,6,1,2. Every
// count is right, every hymn is present, and the Glory is correct — so a rule
// that asserted counts or membership passed clean. What is actually wrong is
// the POSITION: from stichos 5 down, every hymn is sung against the wrong
// psalm verse. Found 2026-09-07 reviewing the 9-08 Nativity of the Theotokos
// vigil against OCA 2025-0908-texts-tt.docx, where stichoi 5 and 3 must repeat
// "Although by God's will…" and "Today the gates of barrenness…".
//
// This is the fourth member of the class the memory file
// feedback_assert_structure_not_labels.md tracks: assert the position, not the
// label. The rule therefore checks the SEQUENCE, not the roster.

const SECTION = 'Lord, I Have Cried';

// Dates where the inversion is real and understood, but the fix belongs to the
// CO-CELEBRATION path (two commemorations sharing the stichoi), which
// lic-repeat-patterns.json cannot express — its patterns index into a single
// commemoration's stichera. Reported at `low` so the backlog stays visible
// without gating the push on a fix that needs its own design.
const KNOWN_SOURCE_GAPS = {
  // Verified against reference/scrape/2024-01-01.docx. OCA sings, from stichos 8:
  //   Circumcision 1, Circumcision 1 (repeat), Circumcision 2, Circumcision 2
  //   (repeat), Basil 1, Basil 1 (repeat), Basil 2, Basil 3.
  // We render the Circumcision half correctly — the in-place doubling fallback
  // handles it — then drop Basil's repeat and wrap slot 8 back to Circumcision 1.
  // Fixing it needs a per-GROUP repeat pattern so each commemoration's share is
  // filled independently. Opened 2026-09-07.
  '01-01': 'Circumcision + St. Basil co-celebration — Basil\'s group loses its repeat and '
         + 'slot 8 wraps to the feast\'s first sticheron. Needs per-group repeat patterns; '
         + 'correct order recorded in reference/scrape/2024-01-01.docx.',
};

module.exports = {
  id:             'D18-vespers-lic-repeat-monotonic',
  family:         'structure',
  severity:       'high',
  description:    'Lord-I-Call stichera must not revisit an earlier hymn after moving past it — a repeat sits adjacent to its original, so the distinct-hymn sequence is non-decreasing. Regression found 2026-09-07 (9-08 vigil).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    // Only the NUMBERED stichera participate. The Glory/Now doxastichon that
    // closes the section is frequently a repeat of sticheron 1 (9-08 is exactly
    // that) and is legitimately out of sequence, so stop at the doxology.
    const sec = blocks.filter(b => b.section === SECTION);
    const end = sec.findIndex(b => b.type === 'doxology');
    const numbered = (end === -1 ? sec : sec.slice(0, end)).filter(b => b.type === 'hymn');
    if (numbered.length < 2) return [];

    const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // Map each hymn to the index of its FIRST appearance, then require that
    // index sequence to be non-decreasing.
    const firstSeen = new Map();
    const seq = numbered.map((b) => {
      const k = norm(b.text);
      if (!firstSeen.has(k)) firstSeen.set(k, firstSeen.size);
      return firstSeen.get(k);
    });

    const issues = [];
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] < seq[i - 1]) {
        const key = String(ctx.calendarEntry?.date || ctx.date || '').slice(5, 10);
        const gap = KNOWN_SOURCE_GAPS[key];
        issues.push({
          severity: gap ? 'low' : 'high',
          message: gap
            ? `${SECTION}: sticheron ${i + 1} returns to distinct hymn #${seq[i] + 1} ` +
              `(sequence ${seq.map(n => n + 1).join(',')}) — known gap: ${gap}`
            :
            `${SECTION}: sticheron ${i + 1} returns to distinct hymn #${seq[i] + 1} after ` +
            `sticheron ${i} had reached #${seq[i - 1] + 1} (sequence ${seq.map(n => n + 1).join(',')}). ` +
            `A repeat must sit next to the hymn it repeats, not at the tail — ` +
            `every hymn from this point on is sung against the wrong psalm verse.`,
          hint:
            'The repeat-fill is appending repeats at the end instead of doubling in ' +
            'place. Author the feast\'s printed pattern in ' +
            'variable-sources/lic-repeat-patterns.json (keyed MM-DD of the CONTENT day), ' +
            'or check the fallback in server-lib/assemble/for-date.js.',
        });
        break;   // one report per service; the first inversion explains the rest
      }
    }
    return issues;
  },
};
