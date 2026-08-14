'use strict';

// Translation of the Image "Not-Made-by-Hands" of our Lord Jesus Christ from
// Edessa to Constantinople (fixed feast, Aug 16 / M-D '8-16'), the third
// "Feast of the Savior in August". It falls inside the Afterfeast of the
// Dormition and, when Aug 16 is a Sunday (2026), co-celebrates with the
// resurrectional Octoechos cycle. The OCA order gives it its OWN second set of
// Divine Liturgy propers layered on the Sunday cycle: troparion, kontakion,
// prokeimenon (Tone 4), alleluia (Tone 4), Gospel, koinonikon, and Beatitude
// troparia from Ode 6 of the Image canon.
//
// State of the wiring (see variable-sources/cocelebrated-overlays.json '8-16'):
//   RENDERS TODAY  — troparion (Tone 2), kontakion (Tone 2), koinonikon.
//   SOURCE GAP     — the second prokeimenon (Tone 4) and alleluia (Tone 4) are
//                    named by INCIPIT ONLY in the OCA order ("Sing to the Lord
//                    a new song…"); no authoritative OCA verse text is on hand,
//                    so they were deliberately NOT authored (fabricating them
//                    would be worse than the gap). Likewise the Beatitude
//                    troparia of the 2nd Dormition canon (Ode 1, Tone 4) and of
//                    the Image canon (Ode 6, Tone 4) are unauthored.
//
// This rule was added 2026-08-14 after the weekend judge sweep for 2026-08-16
// re-reported the missing second prokeimenon / alleluia / Beatitude troparia.
// It does two jobs, matching the KNOWN_SOURCE_GAPS discipline of D13/D15:
//   1. REGRESSION-GUARD the co-celebrated propers that DO render — so a future
//      change that silently drops the Image troparion/kontakion/koinonikon is
//      caught structurally, no LLM needed.
//   2. TRACK the unauthored second propers in KNOWN_SOURCE_GAPS so they stay
//      documented (and are never "fixed" by inventing text) until an
//      authoritative OCA source is on hand. The gapped assertions are skipped
//      while their gap entry exists, keeping audit:date green without hiding
//      the gap.
//
// The second prokeimenon/alleluia attach the moment the overlay '8-16' gains
// `prokeimenon` / `alleluia` blocks (liturgy-from-orthocal.js already attaches
// overlay.prokeimenon / overlay.alleluia as `.secondary`). To CLOSE a gap:
// author the block into the overlay from a cited OCA source, then delete the
// corresponding KNOWN_SOURCE_GAPS entry so this rule begins asserting ≥2.

const IMAGE_RE = /Image\s+Not-Made-by-Hands/i;

// Second-propers that the OCA order appoints but which have no authoritative
// OCA verse text on hand. Each entry justifies itself and points at the fix
// site, mirroring D13/D15. Deleting an entry re-arms its assertion below.
const KNOWN_SOURCE_GAPS = {
  prokeimenon:
    'Image prokeimenon (Tone 4, "Sing to the Lord a new song…") given by incipit ' +
    'only in the OCA order; no authoritative verse text on hand. Author into ' +
    'variable-sources/cocelebrated-overlays.json "8-16".prokeimenon (rubric + ' +
    'refrain only, per OCA co-celebrated layout), then remove this entry.',
  alleluia:
    'Image alleluia (Tone 4) given by incipit only in the OCA order; no ' +
    'authoritative verse text on hand. Author into cocelebrated-overlays.json ' +
    '"8-16".alleluia, then remove this entry.',
  beatitudes:
    'Beatitude troparia of the 2nd Dormition canon (Ode 1, Tone 4 — 2 troparia) ' +
    'and of the Image canon (Ode 6, Tone 4 — 4 troparia) are unauthored; only ' +
    'the 1st Dormition canon exists (feast-canons/dormition.json). Author an ' +
    'image canon file + register 8-16 in beatitudes.js FEAST_BEATITUDES_OVERRIDES, ' +
    'then remove this entry.',
};

module.exports = {
  id:             'L40-image-cocelebrated-second-propers',
  family:         'structure',
  severity:       'high',
  description:    'Translation of the Image "Not-Made-by-Hands" (8-16) renders its co-celebrated Divine Liturgy propers (troparion / kontakion / koinonikon) alongside the Sunday cycle; its second prokeimenon / alleluia / Beatitude troparia are tracked in KNOWN_SOURCE_GAPS pending authoritative OCA text. Regression class re-surfaced by the weekend judge sweep 2026-08-14.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy' && (ctx.date || '').slice(5) === '08-16',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const findings = [];

    // --- 1. Regression guard: the co-celebrated propers that DO render. ---

    // Troparion of the Image at the Troparia block.
    const imageTroparion = blocks.some(b =>
      b.section === 'Troparia' && IMAGE_RE.test(`${b.label || ''} ${b.text || ''}`));
    if (!imageTroparion) {
      findings.push({
        message: 'Image (8-16) co-celebration is missing its Troparion at the Troparia block.',
        hint:    'Check cocelebrated-overlays.json "8-16".troparion and its consumption in liturgy-from-orthocal.js (feastCycle branch).',
      });
    }

    // Kontakion of the Image at the Kontakia block.
    const imageKontakion = blocks.some(b =>
      b.section === 'Kontakia' && IMAGE_RE.test(`${b.label || ''} ${b.text || ''}`));
    if (!imageKontakion) {
      findings.push({
        message: 'Image (8-16) co-celebration is missing its Kontakion at the Kontakia block.',
        hint:    'Check cocelebrated-overlays.json "8-16".kontakion.',
      });
    }

    // Koinonikon of the Image at the Communion Hymn block (≥2 distinct texts:
    // the Sunday/afterfeast one plus the Image "…walk in the light…").
    const commTexts = new Set(
      blocks.filter(b => b.section === 'Communion Hymn' && b.speaker === 'choir' && b.text)
            .map(b => b.text));
    if (commTexts.size < 2) {
      findings.push({
        message: `Image (8-16) Communion Hymn has ${commTexts.size} distinct hymn(s); expected ≥2 (Sunday/afterfeast + Image koinonikon).`,
        hint:    'Check cocelebrated-overlays.json "8-16".communionHymn.',
      });
    }

    // --- 2. Gapped assertions: only fire once the gap has been closed. ---

    // Second prokeimenon (Tone 4). Assert ≥2 only when no source gap remains.
    if (!KNOWN_SOURCE_GAPS.prokeimenon) {
      const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
      if (prokHymns.length < 2) {
        findings.push({
          message: `Image (8-16) Prokeimenon has ${prokHymns.length} hymn block(s); expected ≥2 (Sunday Tone 2 + Image Tone 4).`,
          hint:    'Attach cocelebrated-overlays.json "8-16".prokeimenon as .secondary.',
        });
      }
    }

    // Second alleluia (Tone 4). Assert ≥2 only when no source gap remains.
    if (!KNOWN_SOURCE_GAPS.alleluia) {
      const allHymns = blocks.filter(b => b.section === 'Alleluia' && b.type === 'hymn');
      if (allHymns.length < 2) {
        findings.push({
          message: `Image (8-16) Alleluia has ${allHymns.length} hymn block(s); expected ≥2 (Sunday Tone 2 + Image Tone 4).`,
          hint:    'Attach cocelebrated-overlays.json "8-16".alleluia as .secondary.',
        });
      }
    }

    // Image Beatitude troparia (Ode 6). Assert only when no source gap remains.
    if (!KNOWN_SOURCE_GAPS.beatitudes) {
      const feastBeat = blocks.filter(b =>
        b.section === 'Third Antiphon' && b.type === 'hymn' && b.source === 'feast');
      if (feastBeat.length < 6) {
        findings.push({
          message: `Image (8-16) Beatitudes has ${feastBeat.length} feast/image troparion/troparia; expected 6 (2 Dormition Ode 1 Tone 4 + 4 Image Ode 6 Tone 4).`,
          hint:    'Register 8-16 in beatitudes.js FEAST_BEATITUDES_OVERRIDES with the authored image canon.',
        });
      }
    }

    return findings;
  },
};
