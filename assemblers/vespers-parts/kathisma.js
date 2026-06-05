'use strict';

// NOTE: this file is `assemblers/vespers-parts/kathisma.js`. The repo-root
// `kathisma.js` (which exports getVespersKathisma + getMatinsKathismata) is a
// separate calendar-rules utility module. Require it explicitly via the
// repo-root path to avoid confusion with this file's own name.

const makeBlock                   = require('../_shared/make-block');
const { getKathismata }           = require('../_shared/fixed-text-loader');
const { getPsalter, psalmBody }   = require('../../oca-psalter');
const { getVespersKathisma }      = require('../../kathisma');

function assembleKathisma(calendarDay, fixedTexts) {
  const { dayOfWeek, liturgicalContext, vespers } = calendarDay;
  const season      = liturgicalContext?.season ?? 'ordinaryTime';
  const kathNum     = getVespersKathisma(dayOfWeek, season);
  const section     = 'Kathisma';

  // Kathisma omitted for this occasion (Holy Week, Bright Week, etc.)
  if (kathNum === null) return [];

  // Saturday Great Vespers (= Sunday Vespers, sung Saturday evening): sing
  // Kathisma 1, Section 1 — the "Blessed Is The Man" antiphon. After the
  // Vespers date-shift, the calendar entry is for Sunday so dayOfWeek is
  // 'sunday'; older entries used 'saturday'. Match either.
  if ((vespers.serviceType === 'greatVespers' || vespers.serviceType === 'all-night-vigil') &&
      (dayOfWeek === 'sunday' || dayOfWeek === 'saturday')) {
    return assembleBlessedIsTheMan(fixedTexts);
  }

  // All other cases: kathisma is read (not sung).
  return assembleKathismaReading(kathNum, section);
}

function assembleBlessedIsTheMan(fixedTexts) {
  const section = 'Kathisma';
  const blocks  = [];
  const k       = fixedTexts.kathisma.blessedIsTheMan;

  blocks.push(makeBlock('kathisma-heading', section, 'rubric', null,
    'KATHISMA I'));

  k.verses.forEach((verse, i) => {
    blocks.push(makeBlock(`kathisma-v${i}`, section, 'prayer', 'choir', verse));
    blocks.push(makeBlock(`kathisma-r${i}`, section, 'response', 'choir', k.refrain));
  });

  // HTM/Jordanville-family practice splits the doxology: "Glory…" + Alleluia
  // ×3, then "Both now…" + Alleluia ×3. Overlay supplies `gloryOnly`/`nowOnly`
  // to opt in; otherwise the combined Glory+Now form is used (single refrain).
  if (k.gloryOnly && k.nowOnly) {
    blocks.push(makeBlock('kathisma-glory', section, 'doxology', null, k.gloryOnly));
    blocks.push(makeBlock('kathisma-glory-refrain', section, 'response', 'choir', k.refrain));
    blocks.push(makeBlock('kathisma-now', section, 'doxology', null, k.nowOnly));
    blocks.push(makeBlock('kathisma-now-refrain', section, 'response', 'choir', k.refrain));
  } else {
    blocks.push(makeBlock('kathisma-glory-now', section, 'doxology', null,
      k.gloryNow || 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(makeBlock('kathisma-final-alleluia', section, 'response', 'choir', k.refrain));
  }

  return blocks;
}

/**
 * Renders a full kathisma reading (used at Daily Vespers on weekdays).
 * Outputs each psalm as a labelled prayer block, with a Glory/Alleluia
 * doxology after the first and second stases. No doxology after the third
 * stasis — the Little Litany follows immediately in the assembler.
 */
function assembleKathismaReading(kathNum, section) {
  const kathismata = getKathismata();
  const psalter    = getPsalter();
  const kathisma   = kathismata[String(kathNum)];
  // Include the kathisma number in every id so multi-kathisma services
  // (e.g. Matins reading both Kathisma 2 and Kathisma 3) don't collide.
  const pre = `k${kathNum}`;
  if (!kathisma) {
    return [makeBlock(`${pre}-rubric`, section, 'rubric', null, `KATHISMA ${kathNum}`)];
  }

  const blocks = [];
  blocks.push(makeBlock(`${pre}-rubric`, section, 'rubric', null,
    kathisma.label.toUpperCase()));

  const GLORY_ALLELUIA = [
    makeBlock(`${pre}-glory`, section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'),
    makeBlock(`${pre}-alleluia`, section, 'response', 'reader',
      'Alleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'),
  ];

  kathisma.stases.forEach((stasis, stasisIdx) => {
    // Each stasis is either an array of psalm numbers, or an object with
    // { psalm, fromVerse, toVerse } for the special case of Psalm 118.
    if (Array.isArray(stasis)) {
      stasis.forEach(psalmNum => {
        const psalm = psalter[psalmNum];
        if (!psalm) return;
        const psSection = `Psalm ${psalmNum}`;
        // Skip superscription (title) verse — psalm number is the section title
        const verses = psalmBody(psalm);
        const text = verses.join('\n\n');
        blocks.push(makeBlock(`${pre}-ps${psalmNum}`, psSection, 'prayer', 'reader', text));
      });
    } else {
      // Psalm 118 verse-range stasis
      const { psalm: psalmNum, fromVerse, toVerse } = stasis;
      const psalm = psalter[psalmNum];
      if (psalm) {
        const psSection = `Psalm ${psalmNum}:${fromVerse}–${toVerse}`;
        const verses = psalm.verses.slice(fromVerse - 1, toVerse);
        blocks.push(makeBlock(`${pre}-ps${psalmNum}-${fromVerse}`, psSection, 'prayer', 'reader',
          verses.join('\n\n')));
      }
    }

    // Glory + Alleluia after stases 1 and 2 (not after the last stasis)
    if (stasisIdx < kathisma.stases.length - 1) {
      GLORY_ALLELUIA.forEach((b, i) => {
        blocks.push({ ...b, id: `${pre}-s${stasisIdx}-sep${i}` });
      });
    }
  });

  return blocks;
}

module.exports = {
  assembleKathisma,
  assembleBlessedIsTheMan,
  assembleKathismaReading,
};
