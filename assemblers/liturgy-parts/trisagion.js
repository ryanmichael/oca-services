'use strict';

const makeBlock = require('../_shared/make-block');

// Accepts either the legacy string form ("Before Thy Cross…") or the object
// form ({text, repetitions, glory, final}). Spec overrides win when present.
function _normalizeTrisagionData(base, spec) {
  if (typeof base === 'string') base = { text: base, repetitions: 3 };
  return {
    text:        spec.text   || base.text,
    repetitions: base.repetitions || 3,
    glory:       base.glory  || null,
    final:       base.final  || null,
  };
}

function _emitTrisagionPattern(blocks, section, idPrefix, data) {
  for (let i = 1; i <= data.repetitions; i++) {
    blocks.push(makeBlock(`${idPrefix}-${i}`, section, 'hymn', 'choir', data.text));
  }
  if (data.glory) {
    blocks.push(makeBlock(`${idPrefix}-glory`, section, 'doxology', null, data.glory));
  }
  if (data.final) {
    blocks.push(makeBlock(`${idPrefix}-final`, section, 'hymn', 'choir', data.final));
  }
}

function _litTrisagion(trisagionSpec, f) {
  const section = 'Trisagion';
  const blocks  = [];

  if (!trisagionSpec || trisagionSpec.substitution === 'typical') {
    const tr = f['trisagion'];
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      `Sung three times:`));
    if (Array.isArray(tr.variants) && tr.variants.length > 0) {
      // Multi-language parish customization: emit one hymn block per variant,
      // no labels (the visual sequence is the cue). Base `text` is unused.
      tr.variants.forEach((v, i) => {
        // Only the first variant carries the "choir" speaker chip — the
        // following variants render as continuations of the same chant.
        blocks.push(makeBlock(`tris-text-${i + 1}`, section, 'hymn', i === 0 ? 'choir' : null, v.text));
      });
    } else {
      blocks.push(makeBlock('tris-text', section, 'hymn', 'choir', tr.text));
    }
    blocks.push(makeBlock('tris-glory', section, 'doxology', null, tr.glory));
    blocks.push(makeBlock('tris-final', section, 'hymn', 'choir', tr.final));
  } else if (trisagionSpec.substitution === 'cross') {
    const data = _normalizeTrisagionData(f['trisagion-cross'], trisagionSpec);
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      'The substitution "Before Thy Cross…" is sung in place of "Holy God…":'));
    _emitTrisagionPattern(blocks, section, 'tris-cross', data);
  } else if (trisagionSpec.substitution === 'baptismal') {
    const data = _normalizeTrisagionData(f['trisagion-baptismal'], trisagionSpec);
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      'The substitution "As many as have been baptized…" is sung in place of "Holy God…":'));
    _emitTrisagionPattern(blocks, section, 'tris-bapt', data);
  }

  // Priestly blessing after the Trisagion, before the Prokeimenon
  blocks.push(makeBlock('tris-peace', section, 'prayer', 'priest',
    'Peace be unto all.'));
  blocks.push(makeBlock('tris-peace-resp', section, 'response', 'choir',
    'And to thy spirit.'));

  return blocks;
}

module.exports = { _litTrisagion };
