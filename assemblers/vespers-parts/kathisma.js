'use strict';

// NOTE: this file is `assemblers/vespers-parts/kathisma.js`. The repo-root
// `kathisma.js` (which exports getVespersKathisma + getMatinsKathismata) is a
// separate calendar-rules utility module. Require it explicitly via the
// repo-root path to avoid confusion with this file's own name.

const makeBlock                   = require('../_shared/make-block');
const { getKathismata }           = require('../_shared/fixed-text-loader');
const { getPsalter, psalmBody }   = require('../../oca-psalter');
const { getVespersKathisma }      = require('../../kathisma');

/**
 * The heading that names WHICH kathisma of the Psalter follows.
 *
 * There were three spellings of this one label: a hardcoded Roman numeral on
 * the "Blessed is the Man" path, `label.toUpperCase()` (spelled-out) on the
 * read path, and an Arabic numeral on the missing-data path — three forms for
 * the same thing. They were also the ONLY all-caps rubrics in the corpus:
 * measured 2026-10-31, 10 of 107 distinct rubric texts, against "Ode 1 —
 * First Canon", "Psalm 134 (135)", "Katavasia" and every other structural
 * label, all of which are title case.
 *
 * The Psalter data already carries the right string ("Kathisma Seven"), so
 * this stops shouting it and gives all three paths one source.
 */
function kathismaHeading(kathNum) {
  const entry = getKathismata()[String(kathNum)];
  return (entry && entry.label) || `Kathisma ${kathNum}`;
}

function assembleKathisma(calendarDay, fixedTexts, rubrics) {
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

  // Parish practice: many parishes omit the read kathisma. The sung "Blessed
  // is the Man" above is kept; an empty result also drops the Little Litany.
  if (rubrics?.vespers?.omitReadKathisma) return [];

  // All other cases: kathisma is read (not sung).
  return assembleKathismaReading(kathNum, section);
}

function assembleBlessedIsTheMan(fixedTexts) {
  const section = 'Kathisma';
  const blocks  = [];
  const k       = fixedTexts.kathisma.blessedIsTheMan;

  // "Blessed is the Man" is the first stasis of Kathisma 1.
  blocks.push(makeBlock('kathisma-heading', section, 'rubric', null,
    kathismaHeading(1)));

  // `k.refrain` is the antiphon BETWEEN verses — "Alleluia, alleluia,
  // alleluia.", invariant, eight times in a row. It is the same thing as
  // "Lord, have mercy." between petitions and gets the same `cue` step, or
  // the booklet sets two words of filler at the size of a sticheron eight
  // times. The post-doxology `alleluiaThrice` below is a different, longer
  // text that closes the section, and stays at body size.
  const CUE = { density: 'cue' };
  k.verses.forEach((verse, i) => {
    blocks.push(makeBlock(`kathisma-v${i}`, section, 'prayer', 'choir', verse));
    blocks.push(makeBlock(`kathisma-r${i}`, section, 'response', 'choir', k.refrain, CUE));
  });

  // HTM/Jordanville-family practice splits the doxology: "Glory…" + Alleluia
  // ×3, then "Both now…" + Alleluia ×3. Overlay supplies `gloryOnly`/`nowOnly`
  // to opt in; otherwise the combined Glory+Now form is used (single refrain).
  if (k.gloryOnly && k.nowOnly) {
    blocks.push(makeBlock('kathisma-glory', section, 'doxology', null, k.gloryOnly));
    blocks.push(makeBlock('kathisma-glory-refrain', section, 'response', 'choir', k.refrain, CUE));
    blocks.push(makeBlock('kathisma-now', section, 'doxology', null, k.nowOnly));
    blocks.push(makeBlock('kathisma-now-refrain', section, 'response', 'choir', k.refrain, CUE));
  } else {
    blocks.push(makeBlock('kathisma-glory-now', section, 'doxology', null,
      k.gloryNow || 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
  }

  // The closing "Alleluia… glory to Thee, O God" (thrice) ends the Kathisma in
  // BOTH doxology forms, and is the last thing before the Little Litany.
  //
  // It used to live inside the `else` above, so any parish whose overlay
  // supplies gloryOnly/nowOnly — HTM-Boston and Jordanville, which is St John
  // of Damascus (Tyler) — lost it silently. The split-doxology overlay was
  // authored to ADD the split form and took this block away with it: the
  // fourth-plus instance of a variant REPLACING where it meant to select.
  // A parishioner reported it missing before the Little Litany on 2026-11-07.
  //
  // It is NOT the same text as `k.refrain`. That is the short antiphon
  // ("Alleluia, alleluia, alleluia.") sung between verses and after each half
  // of a split doxology; this is the longer closing form, sung three times.
  // Printing both in succession is correct and is what the books print:
  // OCA Vigil Appendix p.38 (First Kathisma, abbreviated), the read-kathisma
  // path in assembleKathismaReading below, and docs/vespers-walkthrough-2026-06-27.md.
  blocks.push(makeBlock('kathisma-final-alleluia', section, 'response', 'choir',
    fixedTexts.responses?.alleluiaThrice
      || 'Alleluia, alleluia, alleluia, glory to Thee, O God.\nAlleluia, alleluia, alleluia, glory to Thee, O God.\nAlleluia, alleluia, alleluia, glory to Thee, O God.'));

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
    return [makeBlock(`${pre}-rubric`, section, 'rubric', null, kathismaHeading(kathNum))];
  }

  const blocks = [];
  blocks.push(makeBlock(`${pre}-rubric`, section, 'rubric', null,
    kathismaHeading(kathNum)));

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
