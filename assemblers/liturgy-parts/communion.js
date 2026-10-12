'use strict';

const makeBlock = require('../_shared/make-block');
const mustGet   = require('../_shared/must-get');

function _litPreCommunion(isBasil, f, opts = {}) {
  const section = 'Pre-Communion';
  const pc = mustGet(f, 'pre-communion', { scope: section });
  if (!pc || !pc.bowHeads || !pc.elevation) return [];
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
  const pc = mustGet(f, 'pre-communion', { scope: section });
  if (!pc) return [];
  // The pre-Communion prayer text is traditionally three distinct prayers:
  //   1. "I believe, O Lord, and I confess..."           (Symeon Metaphrastes)
  //   2. "Of Thy Mystical Supper, O Son of God..."       (kiss-prayer)
  //   3. "May the communion of Thy holy Mysteries..."    (closing)
  // Split on blank lines so each prayer is its own block. Overlays that keep
  // the prayer monolithic (no \n\n separators) render as a single block.
  const prayerParts = String(pc['prayer-chrysostom'] || '')
    .split(/\n\s*\n+/)
    .map(s => s.trim())
    .filter(Boolean);
  const prayerBlocks = prayerParts.length > 0
    ? prayerParts.map((text, i) => makeBlock(`pc-prayer-${i + 1}`, section, 'prayer', 'all', text))
    : [makeBlock('pc-prayer', section, 'prayer', 'all', pc['prayer-chrysostom'])];

  const blocks = [];
  // Paschal period: the priest's exclamation is replaced by a Paschal antiphon
  // (already rendered earlier), and the Communion Prayer stands alone.
  if (opts.paschal) return blocks.concat(prayerBlocks);
  // Parish 'confessFirst' rubric (HTM/Jordanville-style):
  //   "I believe and confess" → "In the fear of God..." → "Blessed is He..."
  // Default (OCA Service Book):
  //   "In the fear of God..." → "Blessed is He..." → "I believe and confess"
  if (opts.confessFirst) {
    blocks.push(...prayerBlocks);
    blocks.push(makeBlock('pc-draw-near', section, 'prayer',   'priest', pc.drawNear));
    blocks.push(makeBlock('pc-blessed',   section, 'response', 'choir',  pc.blessedIsHe));
  } else {
    blocks.push(makeBlock('pc-draw-near', section, 'prayer',   'priest', pc.drawNear));
    blocks.push(makeBlock('pc-blessed',   section, 'response', 'choir',  pc.blessedIsHe));
    blocks.push(...prayerBlocks);
  }
  return blocks;
}

/**
 * Communion Hymn — the appointed Koinonikon, then what fills the several
 * minutes while the clergy commune behind the curtain.
 *
 * Two ways to fill them, and a parish picks one:
 *
 *   default  cue rubrics naming the Troparia and Kontakia of the day, label
 *            only — the full texts were printed earlier at the Little
 *            Entrance, and the choir flips back or sings from memory.
 *
 *   rubric   `liturgy.silentCommunionPrayers` — the prayer of St. John
 *            Chrysostom from the rule before Holy Communion, for the faithful
 *            to pray SILENTLY. The cue rubrics are dropped, because for anyone
 *            not in the choir they are seven lines of dead space at exactly
 *            the moment there is nothing to read. Requested by St John of
 *            Damascus, Tyler (2026-10-12), whose choir sings from its own
 *            printouts.
 *
 * Off by default: dropping the cues unprompted would strip the choir's cue
 * sheet in any parish that does read it from this app.
 *
 * @param {object} communionHymn  the appointed Koinonikon (+ optional secondary)
 * @param {object} spec           service spec; supplies troparia/kontakia cues
 * @param {object} f              liturgy fixed texts (for the prayer)
 * @param {object} rubrics        overlay rubrics, dotted as `liturgy.*`
 */
function _litCommunionHymn(communionHymn, spec, f, rubrics = {}) {
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
  // Parish opted into the silent prayer: it takes the place of the cue
  // rubrics, and we return before emitting them.
  const silent = (rubrics.liturgy || {}).silentCommunionPrayers
    ? (f || {})['prayers-before-communion']
    : null;
  if (silent && Array.isArray(silent.prayers) && silent.prayers.length > 0) {
    blocks.push(makeBlock('ch-silent-rubric', section, 'rubric', null, silent.rubric));
    silent.prayers.forEach((pr) => {
      if (!pr || !pr.text) return;
      // The attribution goes in its OWN rubric block: renderer.js renders
      // `label` for a hymn only, so a label on a prayer block is silently
      // dropped. Same shape as _litPrayersOfThanksgiving.
      if (pr.label) {
        blocks.push(makeBlock(`ch-silent-${pr.id}-label`, section, 'rubric', null, `${pr.label}:`));
      }
      // One block per prayer, paragraphs kept inside it on blank lines (esc()
      // turns them into breaks). Splitting into a block per paragraph the way
      // _litCommunionPrayer does would stamp a speaker on all ten of them; the
      // Creed is already one multi-paragraph block, so this is the shape.
      blocks.push(makeBlock(`ch-silent-${pr.id}`, section, 'prayer', 'all', pr.text,
        { density: 'compact' }));
    });
    return blocks;
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
      // The Theotokion-Kontakion ("Protection of Christians...") closes the
      // Kontakia section at the Little Entrance ("Now and ever..."). It is
      // not typically repeated while the clergy commune — exclude from the
      // cycling labels. Identified by an explicit `theotokion: true` flag set
      // when the kontakia list is built (see routes/api-liturgy.js).
      if (k.rubric && !k.theotokion) {
        blocks.push(makeBlock(`ch-cycle-kont-${i}`, section, 'rubric', null, k.rubric));
      }
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
  const pc = mustGet(f, 'post-communion-blessing', { scope: section });
  if (!pc) return [];
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
