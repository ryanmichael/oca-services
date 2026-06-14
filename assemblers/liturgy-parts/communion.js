'use strict';

const makeBlock = require('../_shared/make-block');

function _litPreCommunion(isBasil, f, opts = {}) {
  const section = 'Pre-Communion';
  const pc = f['pre-communion'];
  const blocks = [
    makeBlock('pc-peace',      section, 'prayer',   'priest', pc.bowHeads.text),
    makeBlock('pc-peace-r',    section, 'response', 'choir',  pc.bowHeads.response),
    makeBlock('pc-bow',        section, 'prayer',   'deacon', pc.bowHeads.deacon),
    makeBlock('pc-bow-r',      section, 'response', 'choir',  pc.bowHeads.peopleResponse),
    makeBlock('pc-bow-prayer', section, 'prayer',   'priest',
      isBasil ? pc['bow-prayer-basil'] : pc['bow-prayer-chrysostom'],
      { density: 'compact' }),
    makeBlock('pc-elevation-d', section, 'prayer',  'deacon', pc.elevation.deacon),
    makeBlock('pc-elevation-p', section, 'prayer',  'priest', pc.elevation.priest),
    makeBlock('pc-elevation-r', section, 'response','choir',  pc.elevation.people),
  ];
  // Outside the Paschal period: priest's "In the fear of God..." call +
  // choir's "Blessed is He that comes...". In the Paschal period these are
  // replaced by a Paschal antiphonal hymn sung in their place; the text is
  // supplied via opts.paschalAntiphon.
  if (opts.paschal && opts.paschalAntiphon) {
    blocks.push(makeBlock('pc-paschal-antiphon', section, 'hymn', 'choir', opts.paschalAntiphon));
  }
  // Note: 'In the fear of God...' and 'Blessed is He that comes...' now live
  // in the Communion Prayer section (always — order within depends on the
  // `confessFirst` parish rubric). This puts the cycling Communion Hymn
  // section between Pre-Communion (clergy preparation) and Communion Prayer
  // (call to approach the chalice), matching the actual rubrical order.
  return blocks;
}

function _litCommunionPrayer(f, opts = {}) {
  const section = 'Communion Prayer';
  const pc = f['pre-communion'];
  const blocks = [];
  // Paschal period: the priest's exclamation is replaced by a Paschal antiphon
  // (already rendered earlier), and the Communion Prayer stands alone.
  if (opts.paschal) {
    blocks.push(makeBlock('pc-prayer', section, 'prayer', 'all', pc['prayer-chrysostom']));
    return blocks;
  }
  // Parish 'confessFirst' rubric (HTM/Jordanville-style):
  //   "I believe and confess" → "In the fear of God..." → "Blessed is He..."
  // Default (OCA Service Book):
  //   "In the fear of God..." → "Blessed is He..." → "I believe and confess"
  if (opts.confessFirst) {
    blocks.push(makeBlock('pc-prayer',    section, 'prayer',   'all',    pc['prayer-chrysostom']));
    blocks.push(makeBlock('pc-draw-near', section, 'prayer',   'priest', pc.drawNear));
    blocks.push(makeBlock('pc-blessed',   section, 'response', 'choir',  pc.blessedIsHe));
  } else {
    blocks.push(makeBlock('pc-draw-near', section, 'prayer',   'priest', pc.drawNear));
    blocks.push(makeBlock('pc-blessed',   section, 'response', 'choir',  pc.blessedIsHe));
    blocks.push(makeBlock('pc-prayer',    section, 'prayer',   'all',    pc['prayer-chrysostom']));
  }
  return blocks;
}

function _litCommunionHymn(communionHymn, spec) {
  const section = 'Communion Hymn';
  const blocks = [];
  if (communionHymn) {
    if (communionHymn.label)
      blocks.push(makeBlock('ch-label', section, 'rubric', null, communionHymn.label));
    blocks.push(makeBlock('ch-text', section, 'hymn', 'choir', communionHymn.text));
    if (communionHymn.secondary) {
      const sec = communionHymn.secondary;
      if (sec.label)
        blocks.push(makeBlock('ch-2-label', section, 'rubric', null, sec.label));
      blocks.push(makeBlock('ch-2-text', section, 'hymn', 'choir', sec.text));
    }
  }
  // While the clergy commune, the choir cycles through the Troparia and
  // Kontakia of the day. We render label rubrics only (no text bodies) — the
  // full text was printed earlier in the service at the Little Entrance.
  // Choir/reader sings from memory or flips back when needed.
  const hasTrop = spec && Array.isArray(spec.troparia) && spec.troparia.length > 0;
  const hasKont = spec && Array.isArray(spec.kontakia) && spec.kontakia.length > 0;
  if (hasTrop || hasKont) {
    blocks.push(makeBlock('ch-cycle-intro', section, 'rubric', null,
      'The choir continues with the Troparia and Kontakia of the day (see above) as the clergy commune:'));
    if (hasTrop) spec.troparia.forEach((t, i) => {
      if (t.rubric) blocks.push(makeBlock(`ch-cycle-trop-${i}`, section, 'rubric', null, t.rubric));
    });
    if (hasKont) spec.kontakia.forEach((k, i) => {
      if (k.rubric) blocks.push(makeBlock(`ch-cycle-kont-${i}`, section, 'rubric', null, k.rubric));
    });
  }
  return blocks;
}

function _litCommunionOfFaithful(spec, f, isPaschalPeriod) {
  const section = 'Communion of the Faithful';
  const cof = f['communion-of-faithful'];
  if (!cof) return [];
  const blocks = [];

  blocks.push(makeBlock('cof-rubric', section, 'rubric', null, cof.rubric));

  const bocText = isPaschalPeriod && cof['body-of-christ-paschal']
    ? cof['body-of-christ-paschal']
    : cof['body-of-christ'];
  if (bocText) {
    blocks.push(makeBlock('cof-body-of-christ', section, 'hymn', 'choir', bocText));
  }

  return blocks;
}

function _litPostCommunion(spec, f) {
  const section = 'Post-Communion Blessing';
  const pc = f['post-communion-blessing'];
  const isPaschal = spec.weHaveSeen === 'paschal';
  if (isPaschal) {
    // During the Paschal period, "Christ is risen" (sung once) replaces
    // "We have seen the true Light."
    const christIsRisen = 'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life!';
    return [
      makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
      makeBlock('we-have-seen', section, 'hymn',     'choir',  christIsRisen),
    ];
  }
  if (spec.weHaveSeen) {
    // Custom substitution (e.g. Ascension troparion during afterfeast)
    return [
      makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
      makeBlock('we-have-seen', section, 'hymn',     'choir',  spec.weHaveSeen),
    ];
  }
  return [
    makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
    makeBlock('we-have-seen', section, 'hymn',     'choir',  f['we-have-seen']),
  ];
}

module.exports = {
  _litPreCommunion,
  _litCommunionPrayer,
  _litCommunionHymn,
  _litCommunionOfFaithful,
  _litPostCommunion,
};
