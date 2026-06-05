'use strict';

const makeBlock = require('../_shared/make-block');

function _litProkeimenon(prok) {
  const section = 'Prokeimenon';
  if (!prok) return [];
  const blocks = [
    makeBlock('prok-rubric', section, 'prayer', 'deacon',
      `The prokeimenon in Tone ${prok.tone}: ${prok.label || ''}`),
    makeBlock('prok-refrain',  section, 'hymn',  'choir',  prok.refrain, { tone: prok.tone }),
    makeBlock('prok-verse',    section, 'verse',  'reader', `V. ${prok.verse}`),
    makeBlock('prok-refrain2', section, 'hymn',  'choir',  prok.refrain, { tone: prok.tone }),
  ];
  // Co-celebrated saint's prokeimenon: rubric + refrain (no verse, per OCA layout).
  if (prok.secondary) {
    const sec = prok.secondary;
    blocks.push(makeBlock('prok-2-rubric', section, 'rubric', null,
      `Tone ${sec.tone} Prokeimenon (${sec.label || ''}):`));
    blocks.push(makeBlock('prok-2-refrain', section, 'hymn', 'choir', sec.refrain, { tone: sec.tone }));
  }
  return blocks;
}

function _litEpistle(epistle) {
  const section = 'Epistle Reading';
  if (!epistle) return [];
  const blocks = [
    makeBlock('ep-wisdom',  section, 'prayer',  'deacon', 'Wisdom!'),
    makeBlock('ep-reader',  section, 'prayer',  'reader',
      `The reading from the ${epistle.book || 'Epistle'}.`),
    makeBlock('ep-attend',  section, 'prayer',  'deacon', 'Let us attend.'),
  ];
  if (epistle.text) {
    blocks.push(makeBlock('ep-ref', section, 'rubric', null, epistle.display || `${epistle.book} ${epistle.pericope}`));
    blocks.push(makeBlock('ep-text', section, 'prayer', 'reader', epistle.text, { density: 'compact' }));
  } else {
    blocks.push(makeBlock('ep-text', section, 'prayer', 'reader',
      `[${epistle.display || `${epistle.book} ${epistle.pericope}`}]`));
  }
  // Co-celebrated saint's epistle, read immediately after the first.
  if (epistle.secondary) {
    const sec = epistle.secondary;
    blocks.push(makeBlock('ep-2-reader', section, 'prayer', 'reader',
      `The reading from the ${sec.book || 'Epistle'}.`));
    if (sec.text) {
      blocks.push(makeBlock('ep-2-ref', section, 'rubric', null, sec.display));
      blocks.push(makeBlock('ep-2-text', section, 'prayer', 'reader', sec.text, { density: 'compact' }));
    } else {
      blocks.push(makeBlock('ep-2-text', section, 'prayer', 'reader', `[${sec.display}]`));
    }
  }
  blocks.push(
    makeBlock('ep-peace',   section, 'prayer',  'priest', 'Peace be unto thee.'),
    makeBlock('ep-peace-r', section, 'response', 'choir',  'And to thy spirit.'),
  );
  return blocks;
}

function _litAlleluia(alleluia) {
  const section = 'Alleluia';
  if (!alleluia) return [];
  const blocks = [
    makeBlock('all-rubric', section, 'rubric', null,
      `Alleluia in Tone ${alleluia.tone}: ${alleluia.label || ''}`),
    makeBlock('all-text',   section, 'hymn',  'choir', `Alleluia! Alleluia! Alleluia!`,
      { tone: alleluia.tone }),
  ];
  (alleluia.verses || []).forEach((v, i) => {
    blocks.push(makeBlock(`all-v${i}`, section, 'verse', 'reader', `V. ${v}`));
    blocks.push(makeBlock(`all-r${i}`, section, 'hymn',  'choir', 'Alleluia!'));
  });
  // Co-celebrated saint's alleluia verse(s) follow in the saint's tone.
  if (alleluia.secondary) {
    const sec = alleluia.secondary;
    blocks.push(makeBlock('all-2-rubric', section, 'rubric', null,
      `Tone ${sec.tone}${sec.label ? ` (${sec.label})` : ''}:`));
    (sec.verses || []).forEach((v, i) => {
      blocks.push(makeBlock(`all-2-v${i}`, section, 'verse', 'reader', `V. ${v}`));
      blocks.push(makeBlock(`all-2-r${i}`, section, 'hymn', 'choir', 'Alleluia!'));
    });
  }
  return blocks;
}

function _litGospel(gospel) {
  const section = 'Gospel Reading';
  if (!gospel) return [];
  const blocks = [
    makeBlock('gos-deacon',  section, 'prayer',  'deacon', 'Wisdom! Arise! Let us hear the Holy Gospel.'),
    makeBlock('gos-peace',   section, 'prayer',  'priest', 'Peace be unto all.'),
    makeBlock('gos-peace-r', section, 'response', 'choir', 'And to thy spirit.'),
    makeBlock('gos-rubric',  section, 'prayer',  'priest',
      `The reading of the Holy Gospel according to ${gospel.book}.`),
    makeBlock('gos-attend',  section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'),
  ];
  if (gospel.text) {
    blocks.push(makeBlock('gos-ref', section, 'rubric', null, gospel.display || `${gospel.book} ${gospel.pericope}`));
    blocks.push(makeBlock('gos-text', section, 'prayer', 'reader', gospel.text, { density: 'compact' }));
  } else {
    blocks.push(makeBlock('gos-text', section, 'prayer', 'reader',
      `[${gospel.display || `${gospel.book} ${gospel.pericope}`}]`));
  }
  // Co-celebrated saint's gospel, read immediately after the first.
  if (gospel.secondary) {
    const sec = gospel.secondary;
    blocks.push(makeBlock('gos-2-rubric', section, 'prayer', 'priest',
      `The reading of the Holy Gospel according to ${sec.book}.`));
    if (sec.text) {
      blocks.push(makeBlock('gos-2-ref', section, 'rubric', null, sec.display));
      blocks.push(makeBlock('gos-2-text', section, 'prayer', 'reader', sec.text, { density: 'compact' }));
    } else {
      blocks.push(makeBlock('gos-2-text', section, 'prayer', 'reader', `[${sec.display}]`));
    }
  }
  blocks.push(makeBlock('gos-end', section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'));
  return blocks;
}

module.exports = {
  _litProkeimenon,
  _litEpistle,
  _litAlleluia,
  _litGospel,
};
