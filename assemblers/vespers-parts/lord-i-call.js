'use strict';

const makeBlock          = require('../_shared/make-block');
const { resolveSource }  = require('../_shared/resolve');

/**
 * Assembles Lord I Call stichera from the calendar day's lordICall spec.
 * Interleaves psalm verses and hymns.
 */
function assembleLordICall(lordICallSpec, fixedTexts, sources) {
  const section = 'Lord, I Have Cried';
  const blocks = [
    makeBlock('lic-refrain', section, 'prayer', 'choir', fixedTexts.lordICall.refrain),
  ];

  // Read psalm bodies (Ps 140, 141)
  const psalmVerses = fixedTexts.lordICall.psalmVerses;
  blocks.push(makeBlock('ps140', section, 'prayer', 'reader', psalmVerses.psalm140.text));
  blocks.push(makeBlock('ps141', section, 'prayer', 'reader', psalmVerses.psalm141.text));

  // Assemble stichera slots in verse order (verse numbers descend: 10 → 1)
  // Build a flat map of verse → hymn across all slots
  const verseMap = {};
  for (const slot of lordICallSpec.slots) {
    const sourceTexts = resolveSource(slot.source, slot.key, sources);
    if (!sourceTexts) continue;
    slot.verses.forEach((verseNum, i) => {
      // When the slot specifies a category, filter the source's hymns to just
      // the matching ones (robust against data ordering / index drift).
      const allHymns = sourceTexts.hymns || [];
      const hymns = slot.category
        ? allHymns.filter(h => h && h.category === slot.category)
        : allHymns;
      // When more slots than hymns (e.g. 7 resurrectional from 6 unique),
      // the first hymn is doubled (standard typikon practice: sing first sticheron twice).
      const extra = slot.count - hymns.length;
      const hymnIdx = extra > 0 && i < extra ? 0 : i - Math.max(0, extra);
      const hymn = hymns[hymnIdx] || null;
      if (hymn) {
        verseMap[verseNum] = { hymn, slot };
      }
    });
  }

  // Add psalm verses with stichera interleaved
  // "On 10": include Psalm 141 verses 10–9 before Psalm 129 (8–3) and Psalm 116 (2–1)
  const totalStichera = lordICallSpec.totalStichera || 8;
  const allVerses = [
    ...(totalStichera > 8 ? (psalmVerses.psalm141.verses || []) : []),
    ...psalmVerses.psalm129.verses,
    ...psalmVerses.psalm116.verses,
  ];
  for (const verse of allVerses) {
    if (verse.number > totalStichera) continue;
    blocks.push(makeBlock(
      `lic-verse-${verse.number}`, section, 'verse', 'reader',
      `V. (${verse.number}) ${verse.text}`
    ));
    if (verseMap[verse.number]) {
      const { hymn, slot } = verseMap[verse.number];
      blocks.push(makeBlock(
        `lic-hymn-v${verse.number}`, section, 'hymn', 'choir', hymn.text,
        { tone: hymn.tone ?? slot.tone, source: slot.source, label: slot.label, provenance: slot.provenance || hymn.provenance }
      ));
    }
  }

  // Glory (and Now, when combinesGloryNow is set)
  const glorySpec = lordICallSpec.glory ?? null;
  const glorySource = glorySpec
    ? resolveSource(glorySpec.source, glorySpec.key, sources)
    : null;

  if (glorySpec && glorySource) {
    if (glorySpec.combinesGloryNow) {
      blocks.push(makeBlock('lic-glory-now-label', section, 'doxology', null,
        fixedTexts.doxology.gloryNow));
    } else {
      blocks.push(makeBlock('lic-glory-label', section, 'doxology', null,
        fixedTexts.doxology.gloryOnly));
    }
    blocks.push(makeBlock('lic-glory-hymn', section, 'hymn', 'choir', glorySource.text,
      { tone: glorySpec.tone, source: glorySpec.source, label: glorySpec.label, provenance: glorySpec.provenance || glorySource.provenance }
    ));
  }

  // Now and ever — Dogmatikon or Theotokion
  // Skipped when glory already combined Glory+Now.
  // If a glory slot was configured but resolved to nothing, combine Glory+Now into one label.
  if (lordICallSpec.now && !glorySpec?.combinesGloryNow) {
    const nowSource = resolveSource(
      lordICallSpec.now.source, lordICallSpec.now.key, sources
    );
    const noGloryHymn = glorySpec && !glorySource;
    const nowLabel = noGloryHymn
      ? fixedTexts.doxology.gloryNow
      : fixedTexts.doxology.nowOnly;
    blocks.push(makeBlock('lic-now-label', section, 'doxology', null, nowLabel));
    if (nowSource) {
      blocks.push(makeBlock('lic-now-hymn', section, 'hymn', 'choir', nowSource.text,
        { tone: lordICallSpec.now.tone, source: lordICallSpec.now.source, label: lordICallSpec.now.label, provenance: lordICallSpec.now.provenance || nowSource.provenance }
      ));
    }
  }

  return blocks;
}

module.exports = assembleLordICall;
