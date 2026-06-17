'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');

function _litMegalynarion(megalynarionSpec, isBasil, f) {
  const section = 'Hymn to the Theotokos';
  let text;
  if (typeof megalynarionSpec === 'object' && megalynarionSpec?.text) {
    // Feast-specific megalynarion (irmos of the 9th ode)
    text = megalynarionSpec.text;
  } else if (megalynarionSpec === 'basil-liturgy' || isBasil) {
    text = mustGet(f, 'megalynarion-basil', { scope: section });
  } else {
    text = mustGet(f, 'it-is-truly-meet', { scope: section });
  }
  if (!text) return [];
  return [makeBlock('megalynarion', section, 'hymn', 'choir', text)];
}

function _litAnaphora(isBasil, f, megalynarionSpec) {
  const section  = 'Anaphora';
  const key      = isBasil ? 'anaphora-basil' : 'anaphora-chrysostom';
  const anaphora = mustGet(f, key, { scope: section });
  if (!anaphora) return [];
  const blocks   = [];

  // Deacon's call before Sursum Corda
  const opening = f['anaphora-opening'];
  if (opening) {
    blocks.push(makeBlock('anaphora-call', section, 'prayer',   'deacon', opening.deaconCall));
    blocks.push(makeBlock('anaphora-resp', section, 'response', 'choir',  opening.response));
  }

  // Sursum Corda
  (anaphora['sursum-corda'] || []).forEach((line, i) => {
    const speaker = line.speaker === 'people' ? 'choir' : 'priest';
    const type    = line.speaker === 'people' ? 'response' : 'prayer';
    blocks.push(makeBlock(`sc-${i}`, section, type, speaker, line.text));
  });

  // Preface — full prayer (or incipit if full text not yet sourced)
  const prefaceText = anaphora['preface'] || anaphora['preface-incipit'];
  if (prefaceText) {
    blocks.push(makeBlock('preface', section, 'prayer', 'priest', prefaceText, { density: 'compact' }));
  }
  // Audible cue introducing the Sanctus
  blocks.push(makeBlock('preface-cue', section, 'prayer', 'priest',
    anaphora['sanctus-introduction']));

  // Sanctus
  blocks.push(makeBlock('sanctus', section, 'hymn', 'choir', anaphora['sanctus']));

  // Institution narrative — the post-Sanctus prayer flows directly into the
  // Words of Institution for the bread ("...saying: Take, eat..."). Combine
  // into one priest block so the prayer renders as a single continuous utterance.
  const bodyText = anaphora['post-sanctus']
    ? `${anaphora['post-sanctus']} ${anaphora['institution-body']}`
    : anaphora['institution-body'];
  blocks.push(makeBlock('inst-body',   section, 'prayer',   'priest', bodyText, { density: 'compact' }));
  blocks.push(makeBlock('inst-body-r', section, 'response', 'choir',  anaphora['institution-response']));
  blocks.push(makeBlock('inst-cup',    section, 'prayer',   'priest', anaphora['institution-cup']));
  blocks.push(makeBlock('inst-cup-r',  section, 'response', 'choir',  anaphora['institution-response']));

  // Anamnesis prayer — priest's prayer of remembrance after the Words of
  // Institution, leading into the aloud Oblation ("Thine own of Thine own…").
  if (anaphora['anamnesis-prayer']) {
    blocks.push(makeBlock('anamnesis-prayer', section, 'prayer', 'priest',
      anaphora['anamnesis-prayer'], { density: 'compact' }));
  }
  // Oblation + choir response
  blocks.push(makeBlock('anamnesis', section, 'prayer', 'priest', anaphora['anamnesis']));
  blocks.push(makeBlock('anamnesis-r', section, 'response', 'choir', anaphora['anamnesis-response']));

  // Epiclesis — invocation of the Holy Spirit upon the gifts
  const epiclesis = anaphora['epiclesis'];
  if (epiclesis) {
    blocks.push(makeBlock('epi-invocation', section, 'prayer', 'priest',
      epiclesis.invocation, { density: 'compact' }));
    (epiclesis.exchanges || []).forEach((ex, i) => {
      const speaker = ex.speaker;
      const type = (ex.text === 'Amen.' && speaker === 'deacon') ? 'response' : 'prayer';
      blocks.push(makeBlock(`epi-x${i}`, section, type, speaker, ex.text));
    });
    blocks.push(makeBlock('epi-amen', section, 'response', 'choir', epiclesis.tripleAmen));
    if (epiclesis.fruits) {
      blocks.push(makeBlock('epi-fruits', section, 'prayer', 'priest',
        epiclesis.fruits, { density: 'compact' }));
    }
  }

  // Commemoration of the saints — leads directly into the megalynarion cue
  if (anaphora['commemoration-saints']) {
    blocks.push(makeBlock('comm-saints', section, 'prayer', 'priest',
      anaphora['commemoration-saints'], { density: 'compact' }));
  }

  // Megalynarion cue + the choir's Hymn to the Theotokos
  blocks.push(makeBlock('meg-cue', section, 'prayer', 'priest', anaphora['megalynarion-cue']));
  if (megalynarionSpec !== undefined) {
    blocks.push(..._litMegalynarion(megalynarionSpec, isBasil, f));
  }

  // Commemoration of the hierarchy
  if (anaphora['commemoration-hierarchs']) {
    blocks.push(makeBlock('comm-hierarchs', section, 'prayer', 'priest',
      anaphora['commemoration-hierarchs'], { density: 'compact' }));
    blocks.push(makeBlock('comm-hierarchs-r', section, 'response', 'choir',
      anaphora['commemoration-hierarchs-response']));
  }

  // Intercessions exclamation + Final blessing
  blocks.push(makeBlock('interc-excl', section, 'prayer', 'priest', anaphora['intercessions-exclamation']));
  blocks.push(makeBlock('interc-resp', section, 'response', 'choir', anaphora['intercessions-response']));
  blocks.push(makeBlock('anaphora-blessing', section, 'prayer', 'priest', anaphora['final-blessing']));
  blocks.push(makeBlock('anaphora-blessing-r', section, 'response', 'choir', anaphora['final-response']));

  return blocks;
}

function _litLordsPrayer(isBasil, f) {
  const section = 'The Lord\'s Prayer';
  const lit = mustGet(f, 'litany-lords-prayer', { scope: section });
  const lp  = mustGet(f, 'lords-prayer', { scope: section });
  if (!lit || !lp) return [];
  const blocks = [
    makeBlock('lp-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('lp-response', section, 'response', 'choir',  lit.response),
  ];
  (lit.petitions || []).forEach((p, i) => {
    const isAskPetition = p.includes('ask of the Lord') || p.includes('let us ask');
    const resp = isAskPetition
      ? (lit.petitionResponse || 'Grant this, O Lord.')
      : 'Lord, have mercy.';
    blocks.push(makeBlock(`lp-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`lp-pr${i}`, section, 'response', 'choir', resp));
  });
  blocks.push(
    makeBlock('lp-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('lp-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('lp-excl',      section, 'prayer',   'priest',
      isBasil ? lit['exclamation-basil'] : lit['exclamation-chrysostom']),
    makeBlock('lords-prayer', section, 'prayer',   'all',    lp.text),
    makeBlock('lp-doxology',  section, 'prayer',   'priest', lp.doxology),
    makeBlock('lp-dox-resp',  section, 'response', 'choir',  lp.response),
  );
  return blocks;
}

module.exports = { _litAnaphora, _litMegalynarion, _litLordsPrayer };
