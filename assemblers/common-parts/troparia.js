'use strict';

const makeBlock         = require('../_shared/make-block');
const { resolveSource } = require('../_shared/resolve');

/**
 * Cross-family helper: renders a troparia stack (vespers / matins / liturgy /
 * presanctified / etc.). Honors `opts.repeatThrice` for Great-Feast / Vigil
 * rubric (the feast troparion is sung thrice and the Now-position is dropped).
 */
function assembleTroparia(tropariaSpec, sources, opts = {}) {
  const section = 'Troparia';
  const blocks = [];
  // Great-Feast / Vigil rubric: only the feast troparion is sung, thrice
  // ("Rejoice O Virgin" is omitted at Blessing of Bread). Drop any
  // dismissal-theotokion / Now-position slot so the troparion stands alone.
  const slots = opts.repeatThrice
    ? tropariaSpec.slots.filter(s => s.position !== 'now' && s.position !== 'glory')
    : tropariaSpec.slots;
  if (opts.repeatThrice && slots.length >= 1) {
    blocks.push(makeBlock('trop-thrice-rubric', section, 'rubric', null,
      'The Troparion is sung thrice:'));
  }
  for (const slot of slots) {
    const sourceObj = resolveSource(slot.source || tropariaSpec.source, slot.key, sources);
    if (!sourceObj) continue;

    // Position-aware text selection: when the resolved object is a structured
    // section (DB-style with glory/now sub-objects), pick the matching
    // sub-object — and skip the slot if it isn't present (avoids duplicating
    // the top-level Resurrection troparion at the Glory or Now position).
    // Flat sources (Octoechos dismissalTheotokion etc.) fall through.
    const isStructured = sourceObj.glory != null || sourceObj.now != null;
    let entry = sourceObj;
    if (slot.position === 'glory' && isStructured) {
      if (!sourceObj.glory) continue;
      entry = sourceObj.glory;
    } else if (slot.position === 'now' && isStructured) {
      if (!sourceObj.now) continue;
      entry = sourceObj.now;
    }

    if (slot.position === 'glory') {
      blocks.push(makeBlock('trop-glory-label', section, 'doxology', null, 'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    } else if (slot.position === 'now') {
      blocks.push(makeBlock('trop-now-label', section, 'doxology', null, 'Now and ever and unto ages of ages. Amen.'));
    }

    const repeats = opts.repeatThrice ? 3 : 1;
    for (let r = 0; r < repeats; r++) {
      blocks.push(makeBlock(
        `troparion-${slot.position || slot.order || 1}${repeats > 1 ? `-${r + 1}` : ''}`,
        section, 'hymn', 'choir', entry.text,
        { tone: entry.tone || slot.tone, source: slot.source || tropariaSpec.source, label: entry.label || slot.label, provenance: slot.provenance || entry.provenance }
      ));
    }
  }
  return blocks;
}

module.exports = assembleTroparia;
