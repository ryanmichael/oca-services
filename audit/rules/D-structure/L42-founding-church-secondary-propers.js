'use strict';

// 9-13, Commemoration of the Founding of the Church of the Resurrection (Holy
// Sepulchre) at Jerusalem. Doxology rank, with its own complete Liturgy set:
//   Troparion, Tone 4 / Kontakion, Tone 4      (DB comm 1881, OCA text)
//   Prokeimenon, Tone 4: "Holiness befits Thy house, O Lord, forevermore."
//   Alleluia, Tone 2:    "Thy foundations are in the holy mountains…"
//   Epistle Hebrews 3:1-4 / Gospel Matthew 16:13-18 (orthocal, "Church")
//   Koinonikon: "I have loved the beauty of Thy house, O Lord…"
// (OCA order 2026-0913; DLMT text 2024-09-13.)
//
// Surfaced 2026-09-13: the Forefeast of the Cross held the principal slot, so
// the Founding's troparion and kontakion never rendered, and only the Epistle
// (which orthocal supplies) of the second set came through. Every rule passed.
//
// Detection is independent of the wiring: the Hebrews 3.1-4 reference comes
// from orthocal. The assertions are positional where position matters:
//   - Founding troparion sits AFTER the Resurrection troparion (Sundays) and
//     BEFORE the Forefeast troparion (OCA order: Resurrection / Founding /
//     Forefeast)
//   - the Founding prokeimenon / alleluia follow the day's, never lead
// The kontakia SHAPE (which hymn takes Glory / Now) is deliberately NOT
// asserted — see memory feedback_kontakia_shape_needs_measured_evidence.

const FOUNDING = /Founding of the Church of the Resurrection/i;

module.exports = {
  id:             'L42-founding-church-secondary-propers',
  family:         'structure',
  severity:       'high',
  description:    '9-13 Founding of the Church of the Resurrection renders its troparion/kontakion in order and its second set of propers (prokeimenon Tone 4 / alleluia Tone 2 / koinonikon) after the day’s. Regression class discovered 2026-09-13.',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy' && (ctx.date || '').slice(5) === '09-13',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    const hasHebrews = blocks.some(b => b.section === 'Epistle Reading' && b.type === 'rubric' && /^Hebrews 3\.1-4/.test(b.text || ''));
    if (!hasHebrews) return [];

    const findings = [];

    // Troparion: present, and in order.
    const trops = blocks.filter(b => b.section === 'Troparia' && b.type === 'rubric');
    const tRes  = trops.findIndex(b => /Resurrection/i.test(b.text));
    const tFnd  = trops.findIndex(b => FOUNDING.test(b.text));
    const tFore = trops.findIndex(b => /Forefeast/i.test(b.text));
    if (tFnd < 0) {
      findings.push({
        message: 'Founding of the Church troparion (Tone 4) is not rendered in the Troparia.',
        hint:    'Check FEAST_WINDOW_COCOMMEMORATIONS 9-13 in liturgy-from-orthocal.js — the Forefeast holds the principal slot.',
      });
    } else {
      if (ctx.dow === 'sunday' && tRes >= 0 && tFnd < tRes) {
        findings.push({ message: 'Founding troparion precedes the Resurrection troparion; expected Resurrection first.' });
      }
      if (tFore >= 0 && tFore < tFnd) {
        findings.push({ message: 'Forefeast troparion precedes the Founding troparion; OCA order sings Founding, then Forefeast.' });
      }
    }

    // Kontakion: present (shape not asserted).
    if (!blocks.some(b => b.section === 'Kontakia' && b.type === 'rubric' && FOUNDING.test(b.text))) {
      findings.push({
        message: 'Founding of the Church kontakion (Tone 4) is not rendered in the Kontakia.',
        hint:    'Same co-commemoration path as the troparion.',
      });
    }

    // Prokeimenon: the Founding refrain follows the day's.
    const prokHymns = blocks.filter(b => b.section === 'Prokeimenon' && b.type === 'hymn');
    const pFnd = prokHymns.findIndex(b => /^Holiness befits Thy house/i.test(b.text || ''));
    if (pFnd < 1) {
      findings.push({
        message: pFnd < 0
          ? 'Founding prokeimenon "Holiness befits Thy house…" (Tone 4) is missing.'
          : 'Founding prokeimenon leads; expected after the day’s prokeimenon.',
        hint:    'Check the foundingChurchDay secondary attachment in liturgy-from-orthocal.js.',
      });
    }

    // Alleluia: the Founding verse follows the day's verses.
    const allVerses = blocks.filter(b => b.section === 'Alleluia' && b.type === 'verse');
    const aFnd = allVerses.findIndex(b => /^V\. Thy foundations are in the holy mountains/i.test(b.text || ''));
    if (aFnd < 1) {
      findings.push({
        message: aFnd < 0
          ? 'Founding alleluia "Thy foundations are in the holy mountains…" (Tone 2) is missing.'
          : 'Founding alleluia verse leads; expected after the day’s verses.',
        hint:    'Check the foundingChurchDay secondary alleluia attachment.',
      });
    }

    // Koinonikon: present after the day's.
    const comm = blocks.filter(b => b.section === 'Communion Hymn' && b.type === 'hymn' && b.speaker === 'choir');
    const cFnd = comm.findIndex(b => /^I have loved the beauty of Thy house/i.test(b.text || ''));
    if (cFnd < 1) {
      findings.push({
        message: cFnd < 0
          ? 'Founding koinonikon "I have loved the beauty of Thy house…" is missing.'
          : 'Founding koinonikon leads; expected after the day’s.',
        hint:    'Check the foundingChurchDay secondary communionHymn attachment.',
      });
    }

    return findings;
  },
};
