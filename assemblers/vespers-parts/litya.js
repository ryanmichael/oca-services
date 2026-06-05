'use strict';

const makeBlock                  = require('../_shared/make-block');
const { resolveSource, deepGet } = require('../_shared/resolve');

function assembleLitya(lityaSpec, fixedTexts, sources) {
  const section = 'The Litya';
  const blocks = [];

  // Variable stichera (from Menaion/Triodion/Pentecostarion when available)
  // Slots may use source='db' (Pentecostarion DB blocks) or source='fixed'
  // (texts hand-loaded into fixed-texts/vespers-fixed.json — used for the
  // Pentecost + Ascension Litya stichera that aren't fully scraped into the
  // DB yet; see fixed-texts/vespers-fixed.json:pentecostarionLitya).
  const resolveLityaSlot = (slot) => {
    if (slot.source === 'fixed') {
      const data = deepGet(fixedTexts, slot.key);
      if (!data) return null;
      // Fixed-text values may be a raw string or a {text, tone, label} object.
      if (typeof data === 'string') return { text: data, tone: slot.tone, label: slot.label };
      return {
        text:  data.text,
        tone:  data.tone  || slot.tone,
        label: data.label || slot.label,
      };
    }
    return resolveSource(slot.source, slot.key, sources);
  };

  if (lityaSpec && lityaSpec.slots && lityaSpec.slots.length > 0) {
    let hymnIdx = 0;
    for (const slot of lityaSpec.slots) {
      const sourceTexts = resolveLityaSlot(slot);
      if (!sourceTexts) continue;
      const hymns = sourceTexts.hymns || (sourceTexts.text ? [sourceTexts] : []);
      for (const hymn of hymns) {
        blocks.push(makeBlock(
          `litya-hymn-${hymnIdx}`, section, 'hymn', 'choir', hymn.text,
          { tone: slot.tone || hymn.tone, source: slot.source, label: slot.label || hymn.label }
        ));
        hymnIdx++;
      }
    }
  }

  // Glory doxastichon
  if (lityaSpec && lityaSpec.glory) {
    const glorySource = resolveLityaSlot(lityaSpec.glory);
    if (glorySource) {
      blocks.push(makeBlock('litya-glory-label', section, 'doxology', null,
        fixedTexts.doxology.gloryOnly));
      blocks.push(makeBlock('litya-glory-hymn', section, 'hymn', 'choir',
        glorySource.text, { tone: lityaSpec.glory.tone || glorySource.tone, source: lityaSpec.glory.source, label: lityaSpec.glory.label || glorySource.label }));
    }
  }

  // Now theotokion (or combined Glory/Both-now doxastichon)
  if (lityaSpec && lityaSpec.now) {
    const nowSource = resolveLityaSlot(lityaSpec.now);
    if (nowSource) {
      blocks.push(makeBlock('litya-now-label', section, 'doxology', null,
        lityaSpec.now.combinesGloryNow ? fixedTexts.doxology.gloryNow : fixedTexts.doxology.nowOnly));
      blocks.push(makeBlock('litya-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: lityaSpec.now.tone || nowSource.tone, source: lityaSpec.now.source, label: lityaSpec.now.label || nowSource.label }));
    }
  }

  // Litya litany (fixed text)
  const lit = fixedTexts.litanies.litya;
  if (lit) {
    blocks.push(makeBlock('litya-lit-opening', section, 'prayer', 'deacon', lit.opening));
    lit.petitions.forEach((p, i) => {
      blocks.push(makeBlock(`litya-lit-petition-${i}`, section, 'prayer', 'deacon', p));
      blocks.push(makeBlock(`litya-lit-response-${i}`, section, 'response', 'choir', lit.tripleResponse));
    });
    blocks.push(makeBlock('litya-lit-forty', section, 'response', 'choir', lit.fortyResponse));
    blocks.push(makeBlock('litya-lit-final', section, 'prayer', 'deacon', lit.finalPetition));
    blocks.push(makeBlock('litya-lit-exclamation', section, 'prayer', 'priest', lit.exclamation));
    blocks.push(makeBlock('litya-lit-amen', section, 'response', 'choir', 'Amen.'));
    blocks.push(makeBlock('litya-lit-peace', section, 'prayer', 'priest', lit.peace));
    blocks.push(makeBlock('litya-lit-peace-r', section, 'response', 'choir',
      fixedTexts.responses.andToThySpirit));
    blocks.push(makeBlock('litya-lit-bow', section, 'prayer', 'deacon', lit.bowHeadsIntro));
    blocks.push(makeBlock('litya-lit-bow-r', section, 'response', 'choir',
      fixedTexts.responses.bowHeads));
    blocks.push(makeBlock('litya-lit-bow-prayer', section, 'prayer', 'priest', lit.bowHeadsPrayer));
    blocks.push(makeBlock('litya-lit-bow-amen', section, 'response', 'choir', 'Amen.'));
  }

  return blocks;
}

function assembleBlessingOfBread(fixedTexts, opts = {}) {
  const section = 'Blessing of Bread';
  const blocks = [];

  // At a Great-Feast / Vigil, "Rejoice O Virgin" is omitted — the feast
  // troparion has already been sung thrice in section 14 (Troparia) and the
  // Blessing of Bread follows directly. On Sundays without a feast,
  // "Rejoice O Virgin" is sung thrice here per the typikon.
  if (!opts.skipRejoiceOVirgin) {
    const troparion = fixedTexts.prayers.blessingTroparion;
    if (troparion) {
      blocks.push(makeBlock('bob-troparion-rubric', section, 'rubric', null,
        'The Troparion is sung thrice:'));
      blocks.push(makeBlock('bob-troparion', section, 'hymn', 'choir', troparion));
    }
  }

  // Priest's blessing prayer over the five loaves
  const prayer = fixedTexts.prayers.blessingOfBread;
  if (prayer) {
    blocks.push(makeBlock('bob-prayer', section, 'prayer', 'priest', prayer));
    blocks.push(makeBlock('bob-amen', section, 'response', 'choir', 'Amen.'));
  }

  // "Blessed be the Name of the Lord" (Psalm 112:2, thrice)
  const blessedName = fixedTexts.responses.blessedBeTheName;
  if (blessedName) {
    blocks.push(makeBlock('bob-blessed-name', section, 'hymn', 'choir', blessedName));
  }

  // Psalm 33 (34) — verses 1-10
  const psalm33 = fixedTexts.psalm33;
  if (psalm33) {
    blocks.push(makeBlock('bob-psalm33', section, 'prayer', 'reader', psalm33.body));
  }

  return blocks;
}

module.exports = { assembleLitya, assembleBlessingOfBread };
