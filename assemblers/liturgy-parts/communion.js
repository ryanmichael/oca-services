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
  if (opts.paschal) {
    if (opts.paschalAntiphon) {
      blocks.push(makeBlock('pc-paschal-antiphon', section, 'hymn', 'choir', opts.paschalAntiphon));
    }
  } else {
    blocks.push(makeBlock('pc-draw-near', section, 'prayer',   'priest', pc.drawNear));
    blocks.push(makeBlock('pc-blessed',   section, 'response', 'choir',  pc.blessedIsHe));
  }
  return blocks;
}

function _litCommunionPrayer(f) {
  const pc = f['pre-communion'];
  return [
    makeBlock('pc-prayer', 'Communion Prayer', 'prayer', 'all', pc['prayer-chrysostom']),
  ];
}

function _litCommunionHymn(communionHymn) {
  const section = 'Communion Hymn';
  if (!communionHymn) return [];
  const blocks = [];
  if (communionHymn.label)
    blocks.push(makeBlock('ch-label', section, 'rubric', null, communionHymn.label));
  blocks.push(makeBlock('ch-text', section, 'hymn', 'choir', communionHymn.text));
  // Co-celebrated saint's communion hymn follows.
  if (communionHymn.secondary) {
    const sec = communionHymn.secondary;
    if (sec.label)
      blocks.push(makeBlock('ch-2-label', section, 'rubric', null, sec.label));
    blocks.push(makeBlock('ch-2-text', section, 'hymn', 'choir', sec.text));
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

  // Repeat troparia and kontakia of the day, framed as choir-discretion. The
  // texts are duplicated here (rather than referenced) so a choir using this
  // page during communion has the words in front of them.
  const hasTroparia  = Array.isArray(spec.troparia)  && spec.troparia.length > 0;
  const hasKontakia  = Array.isArray(spec.kontakia)  && spec.kontakia.length > 0;
  if (hasTroparia || hasKontakia) {
    blocks.push(makeBlock('cof-tk-rubric', section, 'rubric', null, cof['troparia-rubric']));
    if (hasTroparia) {
      spec.troparia.forEach((t, i) => {
        if (t.rubric) blocks.push(makeBlock(`cof-trop-rubric-${i}`, section, 'rubric', null, t.rubric));
        blocks.push(makeBlock(`cof-trop-${i}`, section, 'hymn', 'choir', t.text, { tone: t.tone }));
      });
    }
    if (hasKontakia) {
      spec.kontakia.forEach((k, i) => {
        if (k.rubric) blocks.push(makeBlock(`cof-kont-rubric-${i}`, section, 'rubric', null, k.rubric));
        blocks.push(makeBlock(`cof-kont-${i}`, section, 'hymn', 'choir', k.text, { tone: k.tone }));
      });
    }
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
