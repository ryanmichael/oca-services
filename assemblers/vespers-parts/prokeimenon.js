'use strict';

const makeBlock         = require('../_shared/make-block');
const { resolveSource } = require('../_shared/resolve');

function assembleProkeimenon(prokeimenonSpec, fixedTexts, sources) {
  const section = 'Evening Prokeimenon';
  const blocks = [
    makeBlock('prok-intro', section, 'prayer', 'priest', 'Let us attend. Peace be unto all.'),
    makeBlock('prok-response', section, 'response', 'choir', 'And to thy spirit.'),
  ];

  if (prokeimenonSpec.pattern === 'great') {
    // Great prokeimenon — used on Thomas Sunday, Ascension, Pentecost, and major feasts.
    // Source: prokeimena.json `great` section, keyed by prokeimenonSpec.key.
    const prokText = sources.prokeimena?.great?.[prokeimenonSpec.key];
    if (prokText) {
      blocks.push(makeBlock('prok-announce', section, 'rubric', 'deacon',
        `The great prokeimenon in Tone ${prokText.tone}.`));
      blocks.push(makeBlock('prok-refrain', section, 'hymn', 'choir',
        prokText.refrain, { tone: prokText.tone }));
      prokText.verses.forEach((verse, i) => {
        blocks.push(makeBlock(`prok-v${i}`, section, 'verse', 'deacon', verse.text));
        blocks.push(makeBlock(`prok-refrain-rep-${i}`, section, 'hymn', 'choir',
          prokText.refrain, { tone: prokText.tone }));
      });
      // Great prokeimenon ends with a final full repetition of the refrain
      blocks.push(makeBlock('prok-refrain-final', section, 'hymn', 'choir',
        prokText.refrain, { tone: prokText.tone }));
    }
  } else if (prokeimenonSpec.pattern === 'lentenWithReadings') {
    for (const entry of prokeimenonSpec.entries) {
      const prokText = resolveSource(entry.source, entry.key, sources);
      if (prokText) {
        const tone = entry.tone ?? prokText.tone;
        blocks.push(makeBlock(
          `prok-announce-${entry.order}`, section, 'rubric', 'deacon',
          `The prokeimenon in Tone ${tone}.`
        ));
        blocks.push(makeBlock(
          `prok-refrain-${entry.order}`, section, 'hymn', 'choir', prokText.refrain,
          { tone }
        ));
        prokText.verses.forEach((verse, i) => {
          blocks.push(makeBlock(`prok-${entry.order}-v${i}`, section, 'verse', 'deacon', verse.text));
          blocks.push(makeBlock(`prok-${entry.order}-refrain-rep-${i}`, section, 'hymn', 'choir',
            prokText.refrain, { tone }));
        });
        if (entry.reading) {
          const pericope = prokText.pericope || entry.reading.pericope;
          blocks.push(makeBlock(
            `lesson-announce-${entry.order}`, section, 'rubric', 'deacon', 'Wisdom.'
          ));
          blocks.push(makeBlock(
            `lesson-reader-${entry.order}`, section, 'rubric', 'reader',
            `The reading from ${entry.reading.book}.`
          ));
          blocks.push(makeBlock(
            `lesson-attend-${entry.order}`, section, 'rubric', 'deacon', 'Let us attend.'
          ));
          blocks.push(makeBlock(
            `lesson-text-${entry.order}`, section, 'prayer', 'reader',
            `[${entry.reading.book} ${pericope}]`
          ));
        }
      } else if (entry.reading?.pericope) {
        // No prokeimenon text in source data, but pericope was injected from API —
        // render just the reading announcement blocks without the versicle.
        blocks.push(makeBlock(
          `lesson-announce-${entry.order}`, section, 'rubric', 'deacon', 'Wisdom.'
        ));
        blocks.push(makeBlock(
          `lesson-reader-${entry.order}`, section, 'rubric', 'reader',
          `The reading from ${entry.reading.book}.`
        ));
        blocks.push(makeBlock(
          `lesson-attend-${entry.order}`, section, 'rubric', 'deacon', 'Let us attend.'
        ));
        blocks.push(makeBlock(
          `lesson-text-${entry.order}`, section, 'prayer', 'reader',
          `[${entry.reading.book} ${entry.reading.pericope}]`
        ));
      }
    }
  } else if (prokeimenonSpec.pattern === 'burialVespers') {
    // Holy Friday Burial Vespers: Prokeimenon → OT Reading (×3) → Epistle Prokeimenon → Epistle → Alleluia → Gospel
    // 1. OT Readings with prokeimena interspersed (readings 1 & 2 have prokeimena; reading 3 does not)
    for (const rdg of prokeimenonSpec.readings) {
      if (rdg.prokeimenon) {
        const rp = rdg.prokeimenon;
        blocks.push(makeBlock(`prok-${rdg.order}-announce`, section, 'rubric', 'deacon',
          `The prokeimenon in Tone ${rp.tone}.`));
        blocks.push(makeBlock(`prok-${rdg.order}-refrain`, section, 'hymn', 'choir', rp.refrain,
          { tone: rp.tone }));
        rp.verses.forEach((v, i) => {
          blocks.push(makeBlock(`prok-${rdg.order}-v${i}`, section, 'verse', 'deacon', v.text));
          blocks.push(makeBlock(`prok-${rdg.order}-refrain-rep-${i}`, section, 'hymn', 'choir', rp.refrain,
            { tone: rp.tone }));
        });
      }
      blocks.push(makeBlock(`lesson-announce-${rdg.order}`, section, 'rubric', 'deacon', 'Wisdom.'));
      blocks.push(makeBlock(`lesson-reader-${rdg.order}`, section, 'rubric', 'reader',
        `The reading from ${rdg.book}.`));
      blocks.push(makeBlock(`lesson-attend-${rdg.order}`, section, 'rubric', 'deacon', 'Let us attend.'));
      blocks.push(makeBlock(`lesson-text-${rdg.order}`, section, 'prayer', 'reader',
        `[${rdg.book} ${rdg.pericope}]`));
    }
    // 2. Epistle with prokeimenon + alleluia
    const ep = prokeimenonSpec.epistle;
    if (ep) {
      const epProk = ep.prokeimenon;
      blocks.push(makeBlock('ep-prok-announce', section, 'rubric', 'deacon',
        `The prokeimenon in Tone ${epProk.tone}.`));
      blocks.push(makeBlock('ep-prok-refrain', section, 'hymn', 'choir', epProk.refrain,
        { tone: epProk.tone }));
      epProk.verses.forEach((v, i) => {
        blocks.push(makeBlock(`ep-prok-v${i}`, section, 'verse', 'deacon', v.text));
        blocks.push(makeBlock(`ep-prok-refrain-rep-${i}`, section, 'hymn', 'choir', epProk.refrain,
          { tone: epProk.tone }));
      });
      blocks.push(makeBlock('ep-announce', section, 'rubric', 'deacon', 'Wisdom.'));
      blocks.push(makeBlock('ep-reader', section, 'rubric', 'reader',
        `The reading from ${ep.book}.`));
      blocks.push(makeBlock('ep-attend', section, 'rubric', 'deacon', 'Let us attend.'));
      blocks.push(makeBlock('ep-text', section, 'prayer', 'reader',
        `[${ep.book} ${ep.pericope}]`));
      // Alleluia
      const al = ep.alleluia;
      blocks.push(makeBlock('alleluia-announce', section, 'rubric', 'deacon',
        `Alleluia in Tone ${al.tone}.`));
      blocks.push(makeBlock('alleluia-refrain', section, 'hymn', 'choir',
        'Alleluia, alleluia, alleluia!', { tone: al.tone }));
      al.verses.forEach((v, i) => {
        blocks.push(makeBlock(`alleluia-v${i}`, section, 'verse', 'deacon', v.text));
        blocks.push(makeBlock(`alleluia-refrain-rep-${i}`, section, 'hymn', 'choir',
          'Alleluia, alleluia, alleluia!', { tone: al.tone }));
      });
    }
    // 3. Gospel
    const gos = prokeimenonSpec.gospel;
    if (gos) {
      const preResp = gos.preGospelResponse || 'Glory to Thee, O Lord, glory to Thee!';
      const postResp = gos.postGospelResponse || 'Glory to Thee, O Lord, glory to Thee!';
      blocks.push(makeBlock('gos-wisdom', section, 'rubric', 'deacon', 'Wisdom. Let us attend.'));
      blocks.push(makeBlock('gos-announce', section, 'rubric', 'deacon',
        `The reading of the Holy Gospel according to ${gos.book}.`));
      blocks.push(makeBlock('gos-glory', section, 'response', 'choir', preResp));
      blocks.push(makeBlock('gos-attend', section, 'rubric', 'deacon', 'Let us attend.'));
      blocks.push(makeBlock('gos-text', section, 'prayer', 'reader',
        `[${gos.label}: ${gos.pericope}]`));
      blocks.push(makeBlock('gos-glory-end', section, 'response', 'choir', postResp));
    }

  } else if (prokeimenonSpec.pattern === 'soulSaturday') {
    // Soul Saturday: Alleluia with two verses in place of the prokeimenon
    const alleluia = sources.prokeimena?.soulSaturday;
    if (alleluia) {
      blocks.push(makeBlock('prok-alleluia', section, 'hymn', 'choir', alleluia.refrain, { tone: alleluia.tone }));
      alleluia.verses.forEach((verse, i) => {
        blocks.push(makeBlock(`prok-v${i}`, section, 'verse', 'deacon', verse.text));
        blocks.push(makeBlock(`prok-alleluia-rep-${i}`, section, 'hymn', 'choir', alleluia.refrain, { tone: alleluia.tone }));
      });
    }
  } else {
    // Standard single prokeimenon — resolved from prokeimena.json by weekday
    const weekday = prokeimenonSpec.weekday;
    const prokText = sources.prokeimena?.weekday?.[weekday];
    if (prokText) {
      blocks.push(makeBlock('prok-announce', section, 'rubric', 'deacon',
        `The prokeimenon in Tone ${prokText.tone}.`));
      blocks.push(makeBlock('prok-refrain', section, 'hymn', 'choir', prokText.refrain,
        { tone: prokText.tone }));
      prokText.verses.forEach((verse, i) => {
        blocks.push(makeBlock(`prok-v${i}`, section, 'verse', 'deacon', verse.text));
        blocks.push(makeBlock(`prok-refrain-rep-${i}`, section, 'hymn', 'choir', prokText.refrain));
      });
    }
  }

  return blocks;
}

module.exports = assembleProkeimenon;
