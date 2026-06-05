'use strict';

const makeBlock = require('../_shared/make-block');

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
    const text = trisagionSpec.text || f['trisagion-cross'];
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      'The substitution "Before Thy Cross…" is sung in place of "Holy God…" (×3):'));
    blocks.push(makeBlock('tris-cross', section, 'hymn', 'choir', text));
    blocks.push(makeBlock('tris-cross-2', section, 'hymn', 'choir', text));
    blocks.push(makeBlock('tris-cross-3', section, 'hymn', 'choir', text));
  } else if (trisagionSpec.substitution === 'baptismal') {
    const text = trisagionSpec.text || f['trisagion-baptismal'];
    blocks.push(makeBlock('tris-bapt', section, 'hymn', 'choir', text));
  }

  // Priestly blessing after the Trisagion, before the Prokeimenon
  blocks.push(makeBlock('tris-peace', section, 'prayer', 'priest',
    'Peace be unto all.'));
  blocks.push(makeBlock('tris-peace-resp', section, 'response', 'choir',
    'And to thy spirit.'));

  return blocks;
}

module.exports = { _litTrisagion };
