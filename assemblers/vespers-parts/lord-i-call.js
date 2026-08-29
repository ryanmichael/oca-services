'use strict';

const { labelSubject, preferRowLabel } = require('../_shared/hymn-label');
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
      // `appendHymns` carries the resurrectional doxastichon displaced by a
      // Menaion Glory, which the typikon sings as the last numbered sticheron.
      const allHymns = [...(sourceTexts.hymns || []), ...(slot.appendHymns || [])];
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

  // Which slots hold stichera from MORE THAN ONE commemoration. Only those may
  // let a per-sticheron label override the slot's.
  //
  // Most labelled rows in the menaion DB carry a generic category incipit —
  // "the holy martyrs", "the venerable one", "the feast" — which is strictly
  // less informative on a choir sheet than the commemoration title the slot
  // already supplies. 2390 of 3246 lordICall rows are labelled that way, so a
  // blanket "row label wins" is a downgrade almost everywhere.
  //
  // It is an UPGRADE in exactly the mixed case, where one slot carries two
  // commemorations' stichera and a single title is wrong for some of them. On
  // 2026-08-16 the Afterfeast of the Dormition's six stichera are labelled
  // "(for the Dormition)" ×3 and "(for the Image)" ×3, because three belong to
  // the Translation of the Image Not-Made-by-Hands; all six printed as
  // "Afterfeast of the Dormition".
  //
  // The test is two distinct SUBJECTS in one slot, not two distinct label
  // strings. Comparing raw strings gets Nativity wrong: 12-25's stichera are
  // labelled "(for the Feast, by Germanus)" and "(for the Feast)", which differ
  // only in the composer attribution — all of them are the Feast's, and
  // "The Nativity of Christ" is the better thing to print. So the subject is
  // read out of the "(for X)" / "from X" form and everything after a comma —
  // the attribution — is dropped, along with any trailing melody incipit in a
  // second parenthetical ("(With what crowns)", "(Joseph of Arimathea)").
  // Label choice — which of the row's own label and the slot's to print — is
  // shared with aposticha.js. See assemblers/_shared/hymn-label.js for why a
  // bare descriptor only wins when it describes someone other than the slot's
  // own commemoration.
  const mixedSlots = new Set();
  for (const slot of new Set(Object.values(verseMap).map(v => v.slot))) {
    const subjects = new Set(
      Object.values(verseMap)
        .filter(v => v.slot === slot)
        .map(v => labelSubject(v.hymn.label))
        .filter(Boolean)
    );
    if (subjects.size > 1) mixedSlots.add(slot);
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
        // Mixed slot (see mixedSlots above) → the sticheron's own label; every
        // other slot renders exactly as before.
        { tone: hymn.tone ?? slot.tone, source: slot.source,
          label: mixedSlots.has(slot) ? preferRowLabel(hymn.label, slot.label) : slot.label,
          provenance: slot.provenance || hymn.provenance }
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
      // Same mixed-slot rule as the numbered stichera. On a day whose stichera
      // come from two commemorations the doxastikon belongs to one of them and
      // saying which is the whole point — 2026-08-16's Tone-8 Glory is labelled
      // "(for the Image)" in the DB and is exactly what the OCA order calls for
      // ("Glory… Image, Tone 8"), but printed as "Afterfeast of the Dormition".
      // A bare "Glory" label (129 rows carry it) names nothing, so it never wins.
      { tone: glorySpec.tone, source: glorySpec.source,
        label: (mixedSlots.size > 0 && glorySource.label && !/^glory$/i.test(glorySource.label))
          ? glorySource.label : glorySpec.label,
        provenance: glorySpec.provenance || glorySource.provenance }
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
