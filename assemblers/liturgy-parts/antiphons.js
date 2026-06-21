'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');
const warnings  = require('../_shared/warnings');

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function _litFeastAntiphon(antiphon, sectionName, prefix) {
  const blocks = [];
  if (!antiphon) return blocks;
  if (!antiphon.verses && !antiphon.glory) {
    warnings.push({ source: 'spec', key: `liturgy.${prefix}`, scope: sectionName,
      detail: 'antiphon present but has neither `verses` nor `glory` — nothing to render' });
    return blocks;
  }
  if (antiphon.verses) {
    antiphon.verses.forEach((v, i) => {
      blocks.push(makeBlock(`${prefix}-v${i}`, sectionName, 'verse', 'choir', v));
      blocks.push(makeBlock(`${prefix}-r${i}`, sectionName, 'response', 'choir', antiphon.refrain));
    });
  }
  if (antiphon.glory) {
    blocks.push(makeBlock(`${prefix}-glory`, sectionName, 'doxology', 'choir', antiphon.glory));
    blocks.push(makeBlock(`${prefix}-grefrain`, sectionName, 'response', 'choir',
      antiphon.gloryRefrain || antiphon.refrain));
  }
  return blocks;
}

function _litTypicalAntiphon1(f) {
  const section = 'First Antiphon';
  const a = mustGet(f, 'typical-antiphon-1', { scope: section });
  if (!a || !a.verses) return [];
  const blocks = [];
  a.verses.forEach((v, i) => {
    blocks.push(makeBlock(`a1-v${i}`, section, 'verse', 'choir', v));
  });
  if (a.glory) {
    blocks.push(makeBlock('a1-glory', section, 'doxology', 'choir', a.glory));
    blocks.push(makeBlock('a1-grefrain', section, 'response', 'choir',
      a.gloryRefrain || a.refrain));
  }
  return blocks;
}

function _litTypicalAntiphon2(f) {
  const section = 'Second Antiphon';
  const a  = mustGet(f, 'typical-antiphon-2', { scope: section });
  if (!a || !a.verses) return [];
  const blocks = [];
  a.verses.forEach((v, i) => {
    blocks.push(makeBlock(`a2-v${i}`, section, 'verse', 'choir', v));
  });
  if (a.glory) {
    blocks.push(makeBlock('a2-glory', section, 'doxology', 'choir', a.glory));
    blocks.push(makeBlock('a2-grefrain', section, 'response', 'choir',
      a.gloryRefrain || a.refrain));
  }
  return blocks;
}

function _litLittleLitany(f, exclamationKey, prefix) {
  const section = 'Little Litany';
  const lit = mustGet(f, 'little-litany', { scope: section });
  if (!lit) return [];
  return [
    makeBlock(`${prefix}-ll-opening`,    section, 'prayer',   'deacon', lit.opening),
    makeBlock(`${prefix}-ll-response`,   section, 'response', 'choir',  lit.response),
    makeBlock(`${prefix}-ll-petition`,   section, 'prayer',   'deacon', lit.petition),
    makeBlock(`${prefix}-ll-comm`,       section, 'prayer',   'deacon', lit.commemoration),
    makeBlock(`${prefix}-ll-comm-resp`,  section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock(`${prefix}-ll-excl`,       section, 'prayer',   'priest', lit[exclamationKey]),
    makeBlock(`${prefix}-ll-amen`,       section, 'response', 'choir',  lit.amen),
  ];
}

function _litBeatitudes(beatitudesSpec, f, opts = {}) {
  const section = 'Third Antiphon';
  const beat = mustGet(f, 'beatitudes', { scope: section });
  if (!beat || !beat.verses) return [];
  const verses  = beat.verses;
  const blocks  = [];

  // Parish rubric: in some Slavic/Sluzhebnik parishes the canon troparia
  // interpolated between Beatitude verses are recited by the Reader rather
  // than sung by the choir. Beatitude verses themselves are always choir.
  const tropSpeaker = opts.rubrics?.antiphons?.beatitudesTropariaReaderLed
    ? 'reader' : 'choir';

  // Opening verse sung three times (choir)
  blocks.push(makeBlock('beat-open', section, 'prayer', 'choir', verses[0]));

  if (!beatitudesSpec || !beatitudesSpec.troparia || beatitudesSpec.troparia.length === 0) {
    blocks.push(makeBlock('beat-rubric', section, 'rubric', null,
      'Beatitudes troparia for this day are not yet in the system. Verses continue without interspersed troparia.'));
    verses.slice(1).forEach((v, i) =>
      blocks.push(makeBlock(`beat-v${i + 1}`, section, 'verse', 'choir', v)));
    return blocks;
  }

  const tropList = [];
  for (const group of beatitudesSpec.troparia) {
    if (group.text) {
      tropList.push({
        tone:   group.tone,
        label:  group.label || '',
        source: group.source || '',
        text:   group.text,
      });
    } else {
      // Group declares a count but no text — flag once for surfacing in
      // `blocks._warnings`. In production the placeholder text is suppressed
      // (entry kept with text=null so the slot is skipped silently when
      // rendered); in dev the indexed placeholder is emitted to make the gap
      // obvious to the author.
      warnings.push({ source: 'spec', key: 'liturgy.beatitudes', scope: section,
        detail: `troparion group "${group.label || ''}" has count=${group.count} but no text` });
      for (let n = 0; n < (group.count || 1); n++) {
        tropList.push({
          tone:   group.tone,
          label:  group.label || '',
          source: group.source || '',
          text:   IS_PRODUCTION ? null
                  : `[${group.label} — troparion ${n + 1} of ${group.count}. Text to be sourced.]`,
        });
      }
    }
  }

  // 12 total slots: 10 paired beatitude verses + Glory + Now and ever.
  // "On N" means N troparia, right-aligned into these 12 slots.
  const totalSlots = 12;
  const startSlot = totalSlots - tropList.length;

  const pairedVerses = verses.slice(1, 11);
  pairedVerses.forEach((verse, i) => {
    blocks.push(makeBlock(`beat-v${i + 1}`, section, 'verse', 'choir', verse));
    const tropIdx = i - startSlot;
    if (tropIdx >= 0 && tropIdx < tropList.length) {
      const t = tropList[tropIdx];
      if (t.text) {
        blocks.push(makeBlock(`beat-t${i + 1}`, section, 'hymn', tropSpeaker, t.text,
          { tone: t.tone, label: t.label }));
      }
    }
  });

  blocks.push(makeBlock('beat-glory', section, 'doxology', null, verses[11]));
  const gloryIdx = 10 - startSlot;
  if (gloryIdx >= 0 && gloryIdx < tropList.length) {
    const g = tropList[gloryIdx];
    if (g.text) {
      blocks.push(makeBlock('beat-glory-t', section, 'hymn', tropSpeaker, g.text,
        { tone: g.tone, label: g.label }));
    }
  }

  blocks.push(makeBlock('beat-now', section, 'doxology', null, verses[12]));
  const nowIdx = 11 - startSlot;
  if (nowIdx >= 0 && nowIdx < tropList.length) {
    const t = tropList[nowIdx];
    if (t.text) {
      blocks.push(makeBlock('beat-theos', section, 'hymn', tropSpeaker, t.text,
        { tone: t.tone, label: t.label }));
    }
  }

  return blocks;
}

module.exports = {
  _litFeastAntiphon,
  _litTypicalAntiphon1,
  _litTypicalAntiphon2,
  _litLittleLitany,
  _litBeatitudes,
};
