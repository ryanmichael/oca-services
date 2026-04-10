/**
 * Orthodox Vespers Service Assembler
 *
 * Takes a calendar day entry and assembles an ordered array of rendered blocks
 * suitable for display or API delivery.
 *
 * assembleVespers(calendarDay, fixedTexts, sources) → ServiceBlock[]
 */

// ─── Shared data (loaded once) ───────────────────────────────────────────────
let _psalter      = null;
let _kathismata   = null;
let _vespersFixed = null;
let _matinsFixed  = null;
function getPsalter() {
  if (!_psalter) _psalter = require('./fixed-texts/psalter.json');
  return _psalter;
}
function getKathismata() {
  if (!_kathismata) _kathismata = require('./fixed-texts/kathismata.json');
  return _kathismata;
}
function getVespersFixed() {
  if (!_vespersFixed) _vespersFixed = require('./fixed-texts/vespers-fixed.json');
  return _vespersFixed;
}
function getMatinsFixed() {
  if (!_matinsFixed) _matinsFixed = require('./fixed-texts/matins-fixed.json');
  return _matinsFixed;
}

/**
 * Returns psalm verses with superscription (title) lines removed.
 * The title may span one or more leading verses.
 */
function psalmBody(psalm) {
  if (!psalm.title) return psalm.verses;
  // Find how many leading verses the title covers
  let skip = 0;
  let accumulated = '';
  for (let i = 0; i < psalm.verses.length; i++) {
    accumulated += (i > 0 ? ' ' : '') + psalm.verses[i];
    skip++;
    if (accumulated.length >= psalm.title.length) break;
  }
  return psalm.verses.slice(skip);
}

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * A single rendered block in the service output.
 * @typedef {Object} ServiceBlock
 * @property {string}  id        - Unique identifier
 * @property {string}  section   - Parent section label (e.g. "Lord, I Have Cried")
 * @property {string}  type      - "rubric" | "prayer" | "hymn" | "verse" | "response" | "doxology"
 * @property {string}  speaker   - "priest" | "deacon" | "reader" | "choir" | "all" | null
 * @property {string}  text      - The rendered text
 * @property {string}  [tone]    - Tone number if applicable
 * @property {string}  [source]  - Which liturgical book this came from
 * @property {string}  [label]   - Optional display label (e.g. "Dogmatikon", "For the Martyrs")
 */

// ─── Main Assembler ───────────────────────────────────────────────────────────

/**
 * Assembles the complete Vespers service for a given calendar day.
 * 
 * @param {Object} calendarDay  - Parsed calendar/YYYY-MM-DD.json
 * @param {Object} fixedTexts   - Parsed fixed-texts/vespers-fixed.json
 * @param {Object} sources      - { triodion, menaion, octoechos, prokeimena }
 * @returns {ServiceBlock[]}
 */
// Module-level warnings collector — reset at the start of each assembly
let _warnings = [];

function assembleVespers(calendarDay, fixedTexts, sources) {
  _warnings = [];
  const blocks = [];
  const vespers = calendarDay.vespers;
  const isVigil = vespers.serviceType === 'all-night-vigil';
  const isGreatVespers = isVigil || vespers.serviceType === 'greatVespers';

  // ── 1. Opening ──────────────────────────────────────────────────────────────
  blocks.push(...assembleOpening(fixedTexts, isGreatVespers));

  // ── 2. Psalm 103 ────────────────────────────────────────────────────────────
  blocks.push(...assemblePsalm103(fixedTexts));

  // ── 3. Great Litany ─────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(fixedTexts));

  // ── 4. Kathisma ─────────────────────────────────────────────────────────────
  const kathismaBlocks = assembleKathisma(calendarDay, fixedTexts);
  blocks.push(...kathismaBlocks);
  // Little Litany follows kathisma (omitted only when kathisma itself is omitted)
  if (kathismaBlocks.length > 0) {
    blocks.push(...assembleLittleLitany(fixedTexts));
  }

  // ── 5. Lord, I Call ─────────────────────────────────────────────────────────
  blocks.push(...assembleLordICall(vespers.lordICall, fixedTexts, sources));

  // ── 6. Entrance (Great Vespers only) ────────────────────────────────────────
  if (isGreatVespers) {
    blocks.push(makeBlock('entrance-wisdom', 'The Entrance', 'prayer', 'deacon',
      fixedTexts.entrance.wisdom));
  }

  // ── 7. Gladsome Light ───────────────────────────────────────────────────────
  blocks.push(makeBlock('gladsome-light', 'Gladsome Light', 'hymn', 'choir',
    fixedTexts['gladsome-light']));

  // ── 8. Prokeimenon(a) + Lessons ─────────────────────────────────────────────
  blocks.push(...assembleProkeimenon(vespers.prokeimenon, fixedTexts, sources));

  // ── 9. Augmented Litany (Great Vespers) ─────────────────────────────────────
  if (isGreatVespers) {
    blocks.push(...assembleAugmentedLitany(fixedTexts));
  }

  // ── 10. Vouchsafe, O Lord ───────────────────────────────────────────────────
  blocks.push(makeBlock('vouchsafe', 'Vouchsafe, O Lord', 'prayer', 'reader',
    fixedTexts.prayers.vouchsafe));

  // ── 11. Evening Litany ──────────────────────────────────────────────────────
  blocks.push(...assembleEveningLitany(fixedTexts));

  // ── 11b. Litya (All-Night Vigil only) ────────────────────────────────────
  if (isVigil) {
    blocks.push(...assembleLitya(vespers.litya, fixedTexts, sources));
  }

  // ── 12. Aposticha ───────────────────────────────────────────────────────────
  blocks.push(...assembleAposticha(vespers.aposticha, calendarDay, fixedTexts, sources));

  // ── 13. Nunc Dimittis ───────────────────────────────────────────────────────
  blocks.push(...assembleNuncDimittis(fixedTexts));

  // ── 14. Troparia ────────────────────────────────────────────────────────────
  blocks.push(...assembleTroparia(vespers.troparia, sources));

  // ── 15. Augmented Litany (Daily Vespers — after troparia) ───────────────────
  if (!isGreatVespers) {
    blocks.push(...assembleAugmentedLitany(fixedTexts));
  }

  // ── 15b. Blessing of Bread (All-Night Vigil only) ────────────────────────
  if (isVigil) {
    blocks.push(...assembleBlessingOfBread(fixedTexts));
  }

  // ── 16. Dismissal ───────────────────────────────────────────────────────────
  blocks.push(...assembleDismissal(fixedTexts, vespers.dismissal));

  // ── 17. Epitaphion Procession (Burial Vespers only) ─────────────────────────
  if (vespers.epitaphion) {
    blocks.push(...assembleEpitaphion(vespers.epitaphion, sources));
  }

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Section Assemblers ───────────────────────────────────────────────────────

function assembleOpening(fixedTexts, isGreatVespers) {
  const section = 'Opening';
  return [
    makeBlock('opening-exclamation', section, 'prayer', 'priest', fixedTexts.opening.exclamation),
    makeBlock('opening-amen', section, 'response', 'reader', fixedTexts.opening.amen),
    makeBlock('heavenly-king', section, 'prayer', 'reader', fixedTexts.prayers.heavenlyKing),
    makeBlock('trisagion', section, 'prayer', 'reader', fixedTexts.prayers.trisagion),
    makeBlock('glory-now-1', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('most-holy-trinity', section, 'prayer', 'reader', fixedTexts.prayers.mostHolyTrinity),
    makeBlock('lhm-3', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyThrice),
    makeBlock('glory-now-2', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('our-father', section, 'prayer', 'reader', fixedTexts.prayers.ourFather),
    makeBlock('kingdom-doxology', section, 'prayer', 'priest', fixedTexts.prayers['ourFather.doxology']),
    makeBlock('lhm-12', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyTwelve),
    makeBlock('glory-now-3', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
  ];
}

function assemblePsalm103(fixedTexts) {
  const section = 'Psalm 103';
  const p = fixedTexts.psalm103;
  return [
    makeBlock('ps103-intro', section, 'prayer', 'reader', p.intro),
    makeBlock('ps103-body', section, 'prayer', 'reader', p.body),
    makeBlock('ps103-refrain', section, 'rubric', 'reader', p.refrain),
    makeBlock('ps103-close', section, 'doxology', 'reader', p.close),
    makeBlock('alleluia-3', section, 'response', 'reader', fixedTexts.responses.alleluiaThrice),
  ];
}

function assembleGreatLitany(fixedTexts) {
  const section = 'The Peace Litany';
  const lit = fixedTexts.litanies.great;
  const blocks = [
    makeBlock('gl-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('gl-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((petition, i) => {
    blocks.push(makeBlock(`gl-petition-${i + 1}`, section, 'prayer', 'deacon', petition));
    blocks.push(makeBlock(`gl-petition-${i + 1}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('gl-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('gl-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('gl-amen', section, 'response', 'choir', fixedTexts.responses.amen),
  );
  return blocks;
}

function assembleLittleLitany(fixedTexts) {
  const section = 'Little Litany';
  const lit = fixedTexts.litanies.little;
  return [
    makeBlock('ll-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('ll-response', section, 'response', 'choir', lit.response),
    makeBlock('ll-petition', section, 'prayer', 'deacon', lit.petition),
    makeBlock('ll-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('ll-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('ll-exclamation', section, 'prayer', 'priest', lit.exclamation1),
    makeBlock('ll-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

function assembleKathisma(calendarDay, fixedTexts) {
  const { getVespersKathisma } = require('./kathisma');
  const { dayOfWeek, liturgicalContext, vespers } = calendarDay;
  const season      = liturgicalContext?.season ?? 'ordinaryTime';
  const kathNum     = getVespersKathisma(dayOfWeek, season);
  const section     = 'Kathisma';

  // Kathisma omitted for this occasion (Holy Week, Bright Week, etc.)
  if (kathNum === null) return [];

  // Saturday Great Vespers: sing Kathisma 1, Section 1 — "Blessed Is The Man"
  if (vespers.serviceType === 'greatVespers' && dayOfWeek === 'saturday') {
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

  blocks.push(makeBlock('kathisma-glory-now', section, 'doxology', null,
    'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
  blocks.push(makeBlock('kathisma-final-alleluia', section, 'response', 'choir', k.refrain));

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
  if (!kathisma) {
    return [makeBlock('kathisma-rubric', section, 'rubric', null, `KATHISMA ${kathNum}`)];
  }

  const blocks = [];
  blocks.push(makeBlock('kathisma-rubric', section, 'rubric', null,
    kathisma.label.toUpperCase()));

  const GLORY_ALLELUIA = [
    makeBlock('k-glory', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'),
    makeBlock('k-alleluia', section, 'response', 'reader',
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
        blocks.push(makeBlock(`k-ps${psalmNum}`, psSection, 'prayer', 'reader', text));
      });
    } else {
      // Psalm 118 verse-range stasis
      const { psalm: psalmNum, fromVerse, toVerse } = stasis;
      const psalm = psalter[psalmNum];
      if (psalm) {
        const psSection = `Psalm ${psalmNum}:${fromVerse}–${toVerse}`;
        const verses = psalm.verses.slice(fromVerse - 1, toVerse);
        blocks.push(makeBlock(`k-ps${psalmNum}-${fromVerse}`, psSection, 'prayer', 'reader',
          verses.join('\n\n')));
      }
    }

    // Glory + Alleluia after stases 1 and 2 (not after the last stasis)
    if (stasisIdx < kathisma.stases.length - 1) {
      GLORY_ALLELUIA.forEach((b, i) => {
        blocks.push({ ...b, id: `k-s${stasisIdx}-sep${i}` });
      });
    }
  });

  return blocks;
}

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
      const hymn = sourceTexts.hymns ? sourceTexts.hymns[i] : null;
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

/**
 * Resolves a text object from sources using dot-notation key path.
 * e.g. resolveSource("triodion", "lent.soulSaturday2.lordICall.glory", sources)
 */
function resolveSource(sourceName, keyPath, sources) {
  const source = sources[sourceName];
  if (!source) {
    console.warn(`Source not found: ${sourceName}`);
    _warnings.push({ source: sourceName, key: keyPath });
    return null;
  }
  const result = deepGet(source, keyPath);
  if (result == null) {
    console.warn(`Key not found: ${sourceName}.${keyPath}`);
    _warnings.push({ source: sourceName, key: keyPath });
  }
  return result;
}

function deepGet(obj, path) {
  return path.split('.').reduce((curr, key) => curr?.[key], obj);
}

/**
 * Assembles prokeimena. Handles both single (non-Lenten) and double (Lenten with readings).
 */
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

function assembleAugmentedLitany(fixedTexts) {
  const section = 'Litany of Fervent Supplication';
  const lit = fixedTexts.litanies.augmented;
  const blocks = [
    makeBlock('al-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('al-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-petition-${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`al-petition-${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.triplePetitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-triple-${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`al-triple-response-${i}`, section, 'response', 'choir', lit.tripleResponse));
  });
  blocks.push(
    makeBlock('al-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('al-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

function assembleEveningLitany(fixedTexts) {
  const section = 'Litany of Completion';
  const lit = fixedTexts.litanies.evening;
  const blocks = [
    makeBlock('el-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('el-response', section, 'response', 'choir', lit.response),
    makeBlock('el-petition1', section, 'prayer', 'deacon', lit.petition1),
    makeBlock('el-p1-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`el-petition-${i + 2}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`el-petition-${i + 2}-response`, section, 'response', 'choir',
      lit.petitionResponse));
  });
  blocks.push(
    makeBlock('el-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('el-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('el-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('el-amen', section, 'response', 'choir', 'Amen.'),
    makeBlock('el-peace', section, 'prayer', 'priest', fixedTexts.responses.peaceToAll),
    makeBlock('el-peace-response', section, 'response', 'choir', fixedTexts.responses.andToThySpirit),
    makeBlock('el-bow', section, 'prayer', 'deacon', 'Let us bow our heads unto the Lord.'),
    makeBlock('el-bow-response', section, 'response', 'choir', fixedTexts.responses.bowHeads),
    makeBlock('el-bow-prayer', section, 'prayer', 'priest', fixedTexts.prayers.bowHeads),
    makeBlock('el-bow-exclamation', section, 'prayer', 'priest',
      'Blessed and glorified be the might of Thy Kingdom: of the Father, and of the Son, and of the Holy Spirit, now and ever and unto ages of ages.'),
    makeBlock('el-bow-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

function assembleAposticha(apostichaSpec, calendarDay, fixedTexts, sources) {
  const section = 'Aposticha';
  const blocks = [];

  // Determine which aposticha psalm verses to use.
  // Lenten Saturdays use Ps. 122 (defaultVerses), not the ordinary Ps. 92 saturdayVerses.
  const isGreatVespersSaturday =
    calendarDay.vespers.serviceType === 'greatVespers' &&
    calendarDay.dayOfWeek === 'saturday';
  const isLentenSaturday = isGreatVespersSaturday &&
    calendarDay.liturgicalContext?.season === 'greatLent';
  const isPaschalVespers = calendarDay.liturgicalContext?.season === 'brightWeek' &&
    calendarDay.dayOfWeek === 'sunday';
  const verseTexts = isPaschalVespers
    ? fixedTexts.aposticha.paschalVerses
    : (isGreatVespersSaturday && !isLentenSaturday)
      ? fixedTexts.aposticha.saturdayVerses
      : fixedTexts.aposticha.defaultVerses;

  let idiomelon = null;

  for (let i = 0; i < apostichaSpec.slots.length; i++) {
    const slot = apostichaSpec.slots[i];

    if (slot.repeatPrevious) {
      // Insert psalm verse then repeat previous idiomelon
      if (verseTexts[i - 1]) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseTexts[i - 1]}`));
      }
      if (idiomelon) {
        blocks.push(makeBlock(`apost-repeat-${i}`, section, 'hymn', 'choir',
          idiomelon.text, { tone: idiomelon.tone, source: idiomelon.source, provenance: idiomelon.provenance }));
      }
      continue;
    }

    const sourceObj = resolveSource(slot.source, slot.key, sources);
    if (!sourceObj) continue;

    const prov = slot.provenance || sourceObj.provenance;
    if (slot.position === 1) {
      // First sticheron — no preceding verse, just the hymn
      blocks.push(makeBlock(`apost-idiomelon`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label, provenance: prov }));
      idiomelon = { text: sourceObj.text, tone: slot.tone, source: slot.source, provenance: prov };
    } else {
      // Subsequent stichera — verse then hymn
      // Prefer explicit verse from slot spec (e.g. Holy Friday), fall back to fixed verse table
      const verseIndex = slot.position - 2;
      const verseText = slot.verse || verseTexts[verseIndex];
      if (verseText) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseText}`));
      }
      blocks.push(makeBlock(`apost-hymn-${i}`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label, provenance: prov }));
    }
  }

  // Glory + Now
  if (apostichaSpec.glory) {
    const glorySource = resolveSource(apostichaSpec.glory.source, apostichaSpec.glory.key, sources);
    if (apostichaSpec.glory.combinesGloryNow) {
      blocks.push(makeBlock('apost-glory-now-label', section, 'doxology', null,
        fixedTexts.doxology.gloryNow));
    } else {
      blocks.push(makeBlock('apost-glory-label', section, 'doxology', null,
        fixedTexts.doxology.gloryOnly));
    }
    if (glorySource) {
      blocks.push(makeBlock('apost-glory-hymn', section, 'hymn', 'choir',
        glorySource.text, { tone: apostichaSpec.glory.tone, source: apostichaSpec.glory.source, label: apostichaSpec.glory.label, provenance: apostichaSpec.glory.provenance || glorySource.provenance }));
    }
  }

  if (apostichaSpec.now) {
    const nowSource = resolveSource(apostichaSpec.now.source, apostichaSpec.now.key, sources);
    blocks.push(makeBlock('apost-now-label', section, 'doxology', null,
      fixedTexts.doxology.nowOnly));
    if (nowSource) {
      blocks.push(makeBlock('apost-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: apostichaSpec.now.tone, source: apostichaSpec.now.source, label: apostichaSpec.now.label, provenance: apostichaSpec.now.provenance || nowSource.provenance }));
    }
  }

  return blocks;
}

function assembleNuncDimittis(fixedTexts) {
  const section = 'Nunc Dimittis';
  return [
    makeBlock('nunc-dimittis', section, 'prayer', 'reader', fixedTexts.prayers.nuncDimittis),
    makeBlock('trisagion-2', section, 'prayer', 'reader', fixedTexts.prayers.trisagion),
    makeBlock('glory-now-nd', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('most-holy-trinity-2', section, 'prayer', 'reader', fixedTexts.prayers.mostHolyTrinity),
    makeBlock('lhm-3-2', section, 'response', 'reader', fixedTexts.responses.lordHaveMercyThrice),
    makeBlock('glory-now-nd-2', section, 'doxology', 'reader', fixedTexts.doxology.gloryNow),
    makeBlock('our-father-2', section, 'prayer', 'reader', fixedTexts.prayers.ourFather),
    makeBlock('kingdom-doxology-2', section, 'prayer', 'priest', fixedTexts.prayers['ourFather.doxology']),
    makeBlock('nd-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

function assembleTroparia(tropariaSpec, sources) {
  const section = 'Troparia';
  const blocks = [];
  for (const slot of tropariaSpec.slots) {
    const key = slot.key.split('.').slice(-1)[0]; // last segment as display key
    const sourceObj = resolveSource(slot.source || tropariaSpec.source, slot.key, sources);
    if (!sourceObj) continue;

    if (slot.position === 'glory') {
      blocks.push(makeBlock('trop-glory-label', section, 'doxology', null, 'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    } else if (slot.position === 'now') {
      blocks.push(makeBlock('trop-now-label', section, 'doxology', null, 'Now and ever and unto ages of ages. Amen.'));
    }

    blocks.push(makeBlock(
      `troparion-${slot.position || slot.order || 1}`,
      section, 'hymn', 'choir', sourceObj.text,
      { tone: slot.tone, source: slot.source || tropariaSpec.source, label: sourceObj.label, provenance: slot.provenance || sourceObj.provenance }
    ));
  }
  return blocks;
}

function assembleLitya(lityaSpec, fixedTexts, sources) {
  const section = 'The Litya';
  const blocks = [];

  // Variable stichera (from Menaion/Triodion/Pentecostarion when available)
  if (lityaSpec && lityaSpec.slots && lityaSpec.slots.length > 0) {
    for (const slot of lityaSpec.slots) {
      const sourceTexts = resolveSource(slot.source, slot.key, sources);
      if (!sourceTexts) continue;
      const hymns = sourceTexts.hymns || (sourceTexts.text ? [sourceTexts] : []);
      hymns.forEach((hymn, i) => {
        blocks.push(makeBlock(
          `litya-hymn-${i}`, section, 'hymn', 'choir', hymn.text,
          { tone: slot.tone, source: slot.source, label: slot.label }
        ));
      });
    }
  }

  // Glory doxastichon
  if (lityaSpec && lityaSpec.glory) {
    const glorySource = resolveSource(lityaSpec.glory.source, lityaSpec.glory.key, sources);
    if (glorySource) {
      blocks.push(makeBlock('litya-glory-label', section, 'doxology', null,
        fixedTexts.doxology.gloryOnly));
      blocks.push(makeBlock('litya-glory-hymn', section, 'hymn', 'choir',
        glorySource.text, { tone: lityaSpec.glory.tone, source: lityaSpec.glory.source }));
    }
  }

  // Now theotokion
  if (lityaSpec && lityaSpec.now) {
    const nowSource = resolveSource(lityaSpec.now.source, lityaSpec.now.key, sources);
    if (nowSource) {
      blocks.push(makeBlock('litya-now-label', section, 'doxology', null,
        fixedTexts.doxology.nowOnly));
      blocks.push(makeBlock('litya-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: lityaSpec.now.tone, source: lityaSpec.now.source }));
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

function assembleBlessingOfBread(fixedTexts) {
  const section = 'Blessing of Bread';
  const blocks = [];

  // Troparion "Rejoice, O Virgin Theotokos" — sung thrice
  const troparion = fixedTexts.prayers.blessingTroparion;
  if (troparion) {
    blocks.push(makeBlock('bob-troparion-rubric', section, 'rubric', null,
      'The Troparion is sung thrice:'));
    blocks.push(makeBlock('bob-troparion', section, 'hymn', 'choir', troparion));
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

function assembleDismissal(fixedTexts, dismissalSpec) {
  const section = 'Dismissal';
  const d = fixedTexts.dismissal;

  // Build proper dismissal text
  let properText = '[Proper Dismissal for the day]';
  if (dismissalSpec) {
    if (dismissalSpec.opening === 'holyFriday') {
      properText = 'May He Who for us men and for our salvation endured in the flesh the dread passion, the life-giving Cross and voluntary burial, Christ our true God, through the prayers of His most pure Mother, and of all the saints, have mercy on us and save us, for He is good and loves mankind.';
    } else {
      let opening;
      if (dismissalSpec.opening === 'feast' && dismissalSpec.feastLabel) {
        opening = 'May Christ our true God,';
      } else if (dismissalSpec.opening === 'sunday') {
        opening = 'May He Who rose from the dead, Christ our true God,';
      } else {
        opening = 'May Christ our true God,';
      }

      const parts = ['through the prayers of His most pure Mother'];
      if (dismissalSpec.dayPatron) parts.push(`of ${dismissalSpec.dayPatron}`);
      const saints = dismissalSpec.saints || [];
      if (saints.length > 0) parts.push(`of ${saints.join('; ')}`);
      const closing = `${parts.join('; ')}; and of all the saints, have mercy on us and save us, forasmuch as He is good and loveth mankind.`;
      properText = `${opening} ${closing}`;
    }
  }

  return [
    makeBlock('dis-wisdom', section, 'prayer', 'deacon', d.wisdom),
    makeBlock('dis-father-bless', section, 'response', 'choir', d.fatherBless),
    makeBlock('dis-blessed', section, 'prayer', 'priest', d.blessedHeWhoIs),
    makeBlock('dis-confirm', section, 'response', 'choir', d.confirm),
    makeBlock('dis-theotokos', section, 'prayer', 'priest', d.mostHolyTheotokos),
    makeBlock('dis-magnification', section, 'response', 'choir', d.magnification),
    makeBlock('dis-glory-christ', section, 'prayer', 'priest', d.gloryChrist),
    makeBlock('dis-final', section, 'response', 'choir', d.finalResponse),
    makeBlock('dis-proper', section, 'prayer', 'priest', properText),
    makeBlock('dis-amen', section, 'response', 'choir', 'Amen.'),
  ];
}

function assembleEpitaphion(epitaphionSpec, sources) {
  const section = 'Epitaphion Procession';
  const blocks = [];
  const ep = resolveSource(epitaphionSpec.source, epitaphionSpec.key, sources);
  if (!ep) return blocks;

  blocks.push(makeBlock('epi-rubric', section, 'rubric', null, ep.processionRubric));

  if (ep.venerationHymn) {
    blocks.push(makeBlock('epi-hymn', section, 'hymn', 'choir', ep.venerationHymn.text,
      { tone: ep.venerationHymn.tone, label: ep.venerationHymn.label }));
  }

  if (ep.venerationRefrains) {
    ep.venerationRefrains.forEach((r, i) => {
      blocks.push(makeBlock(`epi-refrain-${i}`, section, 'response', 'all', r));
    });
  }

  return blocks;
}

// ─── Divine Liturgy Assembler ─────────────────────────────────────────────────

/**
 * Assembles the complete Divine Liturgy for a given calendar day.
 *
 * @param {Object} calendarDay    - Parsed calendar/YYYY-MM-DD.json
 * @param {Object} liturgyFixed   - Parsed fixed-texts/liturgy-fixed.json
 * @param {Object} sources        - { octoechos, triodion, menaion, … }
 * @returns {ServiceBlock[]}
 */
function assembleLiturgy(calendarDay, liturgyFixed, sources) {
  _warnings = [];
  const spec    = calendarDay.liturgy || {};
  const variant = spec.variant || 'chrysostom';
  const isBasil = variant === 'basil';
  const blocks  = [];

  // ── LITURGY OF THE CATECHUMENS ─────────────────────────────────────────────

  // 1. Opening Doxology
  blocks.push(..._litOpeningDoxology(liturgyFixed));

  // 2. Great Litany
  blocks.push(..._litGreatLitany(liturgyFixed));

  // 3–5. Antiphons (feast-specific or typical)
  if (spec.feastAntiphons) {
    // Great Feasts of the Lord: special antiphons replace typical psalms + beatitudes
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.first, 'First Antiphon', 'a1'));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.second, 'Second Antiphon', 'a2'));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.third, 'Third Antiphon', 'a3'));
  } else {
    blocks.push(..._litTypicalAntiphon1(liturgyFixed));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litTypicalAntiphon2(liturgyFixed));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed));
  }

  // 6. Small Entrance
  blocks.push(..._litSmallEntrance(liturgyFixed));

  // 7. Entrance Hymn
  blocks.push(..._litEntranceHymn(spec.entranceHymn));

  // 8. Troparia
  blocks.push(..._litTroparia(spec.troparia));

  // 9. Kontakia
  blocks.push(..._litKontakia(spec.kontakia));

  // 9b. Pre-Trisagion exclamation
  blocks.push(makeBlock('pre-tris-excl', 'Kontakia', 'prayer', 'priest',
    'For Holy art Thou, O our God, and unto Thee we ascribe glory: to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages.'));
  blocks.push(makeBlock('pre-tris-amen', 'Kontakia', 'response', 'choir', 'Amen.'));

  // 10. Trisagion
  blocks.push(..._litTrisagion(spec.trisagion, liturgyFixed));

  // 11. Prokeimenon
  blocks.push(..._litProkeimenon(spec.prokeimenon));

  // 12. Epistle
  blocks.push(..._litEpistle(spec.epistle));

  // 13. Alleluia
  blocks.push(..._litAlleluia(spec.alleluia));

  // 14. Gospel
  blocks.push(..._litGospel(spec.gospel));

  // 15. Homily (rubric only — no fixed text)
  blocks.push(makeBlock('homily', 'Homily', 'rubric', null,
    'The sermon is delivered at this time.'));

  // 16. Augmented Litany
  blocks.push(..._litAugmentedLitany(liturgyFixed));

  // 16b. Litany for the Departed (optional — Soul Saturdays, memorial services)
  if (spec.includeDepartedLitany) {
    blocks.push(..._litDeparted(liturgyFixed));
  }

  // 17. Litany for the Catechumens
  blocks.push(..._litCatechumens(liturgyFixed));

  // 18–19. Litanies of the Faithful
  blocks.push(..._litLitaniesFaithful(liturgyFixed));

  // ── LITURGY OF THE FAITHFUL ────────────────────────────────────────────────

  // 19. Cherubic Hymn (Great Thursday / Great Saturday have substitutions)
  if (spec.cherubicOverride) {
    // Special hymns (Great Thursday / Great Saturday) are sung as a single block
    const cherubicKey = `cherubic-${spec.cherubicOverride}`;
    const cherubicLabel = spec.cherubicOverride === 'great-thursday' ? 'Mystical Supper Hymn'
      : 'Let All Mortal Flesh Keep Silence';
    blocks.push(makeBlock('cherubic-hymn', cherubicLabel, 'hymn', 'choir',
      liturgyFixed[cherubicKey]));
  } else {
    // Standard Cherubic Hymn — Part 1 before the Great Entrance, Part 2 after
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    blocks.push(makeBlock('cherubic-rubric', section, 'rubric', null,
      'Sung slowly and softly:'));
    blocks.push(makeBlock('cherubic-part1', section, 'hymn', 'choir', ch.part1));
    blocks.push(makeBlock('cherubic-amen', section, 'response', 'choir', ch.amen));
  }

  // 20. Great Entrance
  blocks.push(..._litGreatEntrance(liturgyFixed));

  // 19b. Cherubic Hymn — Part 2 (after the Great Entrance)
  if (!spec.cherubicOverride) {
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    blocks.push(makeBlock('cherubic-rubric2', section, 'rubric', null,
      'The choir completes the hymn:'));
    blocks.push(makeBlock('cherubic-part2', section, 'hymn', 'choir', ch.part2));
    blocks.push(makeBlock('cherubic-alleluia', section, 'hymn', 'choir', ch.alleluia));
  }

  // 21. Litany of Supplication
  blocks.push(..._litSupplication(liturgyFixed));

  // 22. Creed
  blocks.push(makeBlock('creed', 'The Creed', 'prayer', 'all',
    liturgyFixed['creed']));

  // 23. Anaphora
  blocks.push(..._litAnaphora(isBasil, liturgyFixed));

  // 24. Megalynarion / Hymn to the Theotokos
  blocks.push(..._litMegalynarion(spec.megalynarion, isBasil, liturgyFixed));

  // 25. Litany before Lord's Prayer + Lord's Prayer
  blocks.push(..._litLordsPrayer(isBasil, liturgyFixed));

  // 26. Pre-Communion (Bow prayer + Elevation)
  blocks.push(..._litPreCommunion(isBasil, liturgyFixed));

  // 27. Communion Hymn
  blocks.push(..._litCommunionHymn(spec.communionHymn));

  // 28. Communion Prayer ("I believe, O Lord...")
  blocks.push(..._litCommunionPrayer(liturgyFixed));

  // 29. Post-Communion Blessing
  blocks.push(..._litPostCommunion(spec, liturgyFixed));

  // 30. Hymn of Thanksgiving
  blocks.push(makeBlock('let-our-mouths', 'Hymn of Thanksgiving', 'hymn', 'choir',
    liturgyFixed['let-our-mouths']));

  // 31. Litany of Thanksgiving
  blocks.push(..._litThanksgiving(isBasil, liturgyFixed));

  // 32. Prayer behind the Ambon
  const ambonKey = isBasil ? 'prayer-ambon-basil' : 'prayer-ambon-chrysostom';
  blocks.push(makeBlock('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    liturgyFixed[ambonKey]));

  // 33. Blessed be the Name
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 34. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 35. Dismissal Troparia
  blocks.push(..._litDismissalTroparia(isBasil, liturgyFixed, spec.dismissalTroparia));

  // 36. Dismissal
  blocks.push(..._litDismissal(spec.dismissal, isBasil));

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Liturgy Section Assemblers ───────────────────────────────────────────────

function _litOpeningDoxology(f) {
  const section = 'Opening Doxology';
  const d = f['opening-doxology'];
  return [
    makeBlock('od-exclamation', section, 'prayer', 'priest', d.exclamation),
    makeBlock('od-response',    section, 'response', 'choir', d.response),
  ];
}

function _litGreatLitany(f) {
  const section = 'Great Litany';
  const lit = f['great-litany'];
  const blocks = [
    makeBlock('gl-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('gl-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`gl-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`gl-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('gl-comm-resp',     section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('gl-exclamation',   section, 'prayer',   'priest', lit.exclamation),
    makeBlock('gl-amen',          section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litFeastAntiphon(antiphon, sectionName, prefix) {
  const blocks = [];
  if (!antiphon) return blocks;
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
  const a = f['typical-antiphon-1'];
  const blocks = [];
  a.verses.forEach((v, i) => {
    blocks.push(makeBlock(`a1-v${i}`, section, 'verse', 'choir', v));
    blocks.push(makeBlock(`a1-r${i}`, section, 'response', 'choir', a.refrain));
  });
  blocks.push(makeBlock('a1-glory',  section, 'doxology', 'choir', a.glory));
  blocks.push(makeBlock('a1-grefrain', section, 'response', 'choir', a.gloryRefrain));
  return blocks;
}

function _litTypicalAntiphon2(f) {
  const section = 'Second Antiphon';
  const a = f['typical-antiphon-2'];
  const blocks = [];
  a.verses.forEach((v, i) => {
    blocks.push(makeBlock(`a2-v${i}`, section, 'verse', 'choir', v));
    blocks.push(makeBlock(`a2-r${i}`, section, 'response', 'choir', a.refrain));
  });
  blocks.push(makeBlock('a2-glory', section, 'doxology', 'choir', a.glory));
  return blocks;
}

function _litLittleLitany(f, exclamationKey, prefix) {
  const section = 'Little Litany';
  const lit = f['little-litany'];
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

function _litBeatitudes(beatitudesSpec, f) {
  const section = 'Third Antiphon';
  const verses  = f['beatitudes'].verses;
  const blocks  = [];

  // Opening verse sung three times (choir)
  blocks.push(makeBlock('beat-open', section, 'prayer', 'choir', verses[0]));

  if (!beatitudesSpec || !beatitudesSpec.troparia || beatitudesSpec.troparia.length === 0) {
    // No troparia assigned — output remaining verses as prayer (rubric note)
    blocks.push(makeBlock('beat-rubric', section, 'rubric', null,
      'Beatitudes troparia for this day are not yet in the system. Verses continue without interspersed troparia.'));
    verses.slice(1).forEach((v, i) =>
      blocks.push(makeBlock(`beat-v${i + 1}`, section, 'verse', 'choir', v)));
    return blocks;
  }

  // Flatten troparia groups into individual items.
  // Items with `text` are used directly; items with only `count` get placeholder text.
  const tropList = [];
  for (const group of beatitudesSpec.troparia) {
    if (group.text) {
      // Individual troparion with actual text
      tropList.push({
        tone:   group.tone,
        label:  group.label || '',
        source: group.source || '',
        text:   group.text,
      });
    } else {
      // Legacy group-count format: generate placeholders
      for (let n = 0; n < (group.count || 1); n++) {
        tropList.push({
          tone:   group.tone,
          label:  group.label || '',
          source: group.source || '',
          text:   `[${group.label} — troparion ${n + 1} of ${group.count}. Text to be sourced.]`,
        });
      }
    }
  }

  // 12 total slots: 10 paired beatitude verses + Glory + Now and ever.
  // "On N" means N troparia, right-aligned into these 12 slots.
  // E.g. "On 8" → first 4 verses sung alone, then 6 verse-paired + Glory + Now.
  const totalSlots = 12;
  const startSlot = totalSlots - tropList.length; // first slot that gets a troparion

  // Verses 1–10 (indices 1–10 in the array) are the paired beatitude verses
  const pairedVerses = verses.slice(1, 11); // "Blessed are the poor..." through "Rejoice and be glad..."
  pairedVerses.forEach((verse, i) => {
    blocks.push(makeBlock(`beat-v${i + 1}`, section, 'verse', 'choir', verse));
    const tropIdx = i - startSlot;
    if (tropIdx >= 0 && tropIdx < tropList.length) {
      const t = tropList[tropIdx];
      blocks.push(makeBlock(`beat-t${i + 1}`, section, 'hymn', 'choir', t.text,
        { tone: t.tone, label: t.label }));
    }
  });

  // Glory doxology (slot 10)
  blocks.push(makeBlock('beat-glory', section, 'doxology', null, verses[11]));
  const gloryIdx = 10 - startSlot;
  if (gloryIdx >= 0 && gloryIdx < tropList.length) {
    const g = tropList[gloryIdx];
    blocks.push(makeBlock('beat-glory-t', section, 'hymn', 'choir', g.text,
      { tone: g.tone, label: g.label }));
  }

  // Now and ever (slot 11)
  blocks.push(makeBlock('beat-now', section, 'doxology', null, verses[12]));
  const nowIdx = 11 - startSlot;
  if (nowIdx >= 0 && nowIdx < tropList.length) {
    const t = tropList[nowIdx];
    blocks.push(makeBlock('beat-theos', section, 'hymn', 'choir', t.text,
      { tone: t.tone, label: t.label }));
  }

  return blocks;
}

function _litSmallEntrance(f) {
  const section = 'Little Entrance';
  const e = f['small-entrance'];
  return [
    makeBlock('se-rubric', section, 'rubric', null,
      'The clergy make the Little Entrance with the Gospel Book.'),
    makeBlock('se-deacon', section, 'prayer', 'deacon', e.deacon),
  ];
}

function _litEntranceHymn(entranceHymn) {
  const section = 'Entrance Hymn';
  const text = (typeof entranceHymn === 'object' ? entranceHymn.text : null) ||
    'Come, let us worship and fall down before Christ. O Son of God, Who art risen from the dead, save us who sing to Thee: Alleluia!';
  return [makeBlock('entrance-hymn', section, 'hymn', 'choir', text)];
}

function _litTroparia(tropariaSpec) {
  const section = 'Troparia';
  const blocks  = [];
  if (!tropariaSpec || !tropariaSpec.length) return blocks;
  tropariaSpec.forEach((t, i) => {
    // "Glory..." before the last troparion (when there are multiple)
    if (i === tropariaSpec.length - 1 && tropariaSpec.length > 1) {
      blocks.push(makeBlock('trop-glory', section, 'doxology', null,
        'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    }
    if (t.rubric) blocks.push(makeBlock(`trop-rubric-${i}`, section, 'rubric', null, t.rubric));
    blocks.push(makeBlock(`trop-${i}`, section, 'hymn', 'choir', t.text,
      { tone: t.tone }));
  });
  return blocks;
}

function _litKontakia(kontakiaSpec) {
  const section = 'Kontakia';
  const blocks  = [];
  if (!kontakiaSpec || !kontakiaSpec.length) return blocks;
  kontakiaSpec.forEach((k, i) => {
    // "Now and ever..." before the first kontakion (follows the troparia "Glory...")
    if (i === 0 && !k.connector) {
      blocks.push(makeBlock('kont-now-and-ever', section, 'doxology', null,
        'Now and ever, and unto ages of ages. Amen.'));
    } else if (k.connector) {
      blocks.push(makeBlock(`kont-conn-${i}`, section, 'doxology', null, k.connector));
    }
    if (k.rubric)    blocks.push(makeBlock(`kont-rubric-${i}`, section, 'rubric', null, k.rubric));
    blocks.push(makeBlock(`kont-${i}`, section, 'hymn', 'choir', k.text,
      { tone: k.tone }));
  });
  return blocks;
}

function _litTrisagion(trisagionSpec, f) {
  const section = 'Trisagion';
  const blocks  = [];

  if (!trisagionSpec || trisagionSpec.substitution === 'typical') {
    const tr = f['trisagion'];
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      `Sung three times:`));
    blocks.push(makeBlock('tris-text', section, 'hymn', 'choir', tr.text));
    blocks.push(makeBlock('tris-glory', section, 'doxology', null, tr.glory));
    blocks.push(makeBlock('tris-final', section, 'hymn', 'choir', tr.final));
  } else if (trisagionSpec.substitution === 'cross') {
    const text = trisagionSpec.text || f['trisagion-cross'];
    blocks.push(makeBlock('tris-rubric', section, 'rubric', null,
      'The substitution "Before Thy Cross…" is sung in place of "Holy God…" (×3):'));
    blocks.push(makeBlock('tris-cross', section, 'hymn', 'choir', text));
    blocks.push(makeBlock('tris-cross-2', section, 'hymn', 'choir', text));
    blocks.push(makeBlock('tris-cross-3', section, 'hymn', 'choir', text));
  } else if (trisagionSpec.substitution === 'baptismal') {
    const text = trisagionSpec.text || f['trisagion-baptismal'];
    blocks.push(makeBlock('tris-bapt', section, 'hymn', 'choir', text));
  }

  // Priestly blessing after the Trisagion, before the Prokeimenon
  blocks.push(makeBlock('tris-peace', section, 'prayer', 'priest',
    'Peace be unto all.'));
  blocks.push(makeBlock('tris-peace-resp', section, 'response', 'choir',
    'And to thy spirit.'));

  return blocks;
}

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
    blocks.push(makeBlock('ep-text', section, 'prayer', 'reader', epistle.text));
  } else {
    blocks.push(makeBlock('ep-text', section, 'prayer', 'reader',
      `[${epistle.display || `${epistle.book} ${epistle.pericope}`}]`));
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
    blocks.push(makeBlock('gos-text', section, 'prayer', 'reader', gospel.text));
  } else {
    blocks.push(makeBlock('gos-text', section, 'prayer', 'reader',
      `[${gospel.display || `${gospel.book} ${gospel.pericope}`}]`));
  }
  blocks.push(makeBlock('gos-end', section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'));
  return blocks;
}

function _litAugmentedLitany(f) {
  const section = 'Litany of Fervent Supplication';
  const lit = f['augmented-litany'];
  const blocks = [
    makeBlock('al-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('al-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`al-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.triplePetitions.forEach((p, i) => {
    blocks.push(makeBlock(`al-tp${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`al-tr${i}`, section, 'response', 'choir',  lit.tripleResponse));
  });
  blocks.push(
    makeBlock('al-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('al-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('al-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('al-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litDeparted(f) {
  const section = 'Litany for the Departed';
  const lit = f['litany-departed'];
  if (!lit) return [];
  const blocks = [
    makeBlock('dep-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('dep-response', section, 'response', 'choir',  lit.tripleResponse),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`dep-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`dep-r${i}`, section, 'response', 'choir',  lit.tripleResponse));
  });
  blocks.push(
    makeBlock('dep-ask',      section, 'prayer',   'deacon', lit.askPetition),
    makeBlock('dep-ask-resp', section, 'response', 'choir',  lit.askResponse),
    makeBlock('dep-call',     section, 'prayer',   'deacon', lit.deaconCall),
    makeBlock('dep-secret',   section, 'prayer',   'priest', lit.secretPrayer),
    makeBlock('dep-excl',     section, 'prayer',   'priest', lit.exclamation),
    makeBlock('dep-amen',     section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litCatechumens(f) {
  const section = 'Litany for the Catechumens';
  const lit = f['litany-catechumens'];
  const blocks = [
    makeBlock('cat-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('cat-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`cat-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`cat-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  blocks.push(
    makeBlock('cat-p2',        section, 'prayer',   'deacon', lit.petition2),
    makeBlock('cat-bow',       section, 'prayer',   'deacon', lit.bowHeads),
    makeBlock('cat-bow-resp',  section, 'response', 'choir',  lit.bowHeadsResponse),
    makeBlock('cat-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('cat-amen',      section, 'response', 'choir',  lit.amen),
    makeBlock('cat-dismissal', section, 'prayer',   'deacon', lit.dismissal),
  );
  return blocks;
}

function _litLitaniesFaithful(f) {
  const section = 'Litanies of the Faithful';
  const l1 = f['litany-faithful-1'];
  const l2 = f['litany-faithful-2'];
  return [
    makeBlock('lf1-opening',    section, 'prayer',   'deacon', l1.opening),
    makeBlock('lf1-response',   section, 'response', 'choir',  l1.response),
    makeBlock('lf1-petition',   section, 'prayer',   'deacon', l1.petition),
    makeBlock('lf1-comm',       section, 'prayer',   'deacon', l1.commemoration),
    makeBlock('lf1-comm-resp',  section, 'response', 'choir',  l1.commemorationResponse),
    makeBlock('lf1-excl',       section, 'prayer',   'priest', l1.exclamation),
    makeBlock('lf1-amen',       section, 'response', 'choir',  l1.amen),
    makeBlock('lf2-opening',    section, 'prayer',   'deacon', l2.opening),
    makeBlock('lf2-response',   section, 'response', 'choir',  l2.response),
    makeBlock('lf2-petition',   section, 'prayer',   'deacon', l2.petition),
    makeBlock('lf2-comm',       section, 'prayer',   'deacon', l2.commemoration),
    makeBlock('lf2-comm-resp',  section, 'response', 'choir',  l2.commemorationResponse),
    makeBlock('lf2-excl',       section, 'prayer',   'priest', l2.exclamation),
    makeBlock('lf2-amen',       section, 'response', 'choir',  l2.amen),
  ];
}

function _litGreatEntrance(f) {
  const section = 'Great Entrance';
  const e = f['great-entrance'];
  return [
    makeBlock('ge-rubric',   section, 'rubric',   null,     e.rubric),
    makeBlock('ge-comm',     section, 'prayer',   'priest', e.commonCommemoration),
    makeBlock('ge-response', section, 'response', 'choir',  e.response),
  ];
}

function _litSupplication(f) {
  const section = 'Litany of Supplication';
  const lit = f['litany-supplication'];
  const blocks = [
    makeBlock('sup-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('sup-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`sup-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`sup-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.petitions2.forEach((p, i) => {
    blocks.push(makeBlock(`sup-p2-${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`sup-gr-${i}`, section, 'response', 'choir',  lit.petitions2Response));
  });
  blocks.push(
    makeBlock('sup-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('sup-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('sup-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('sup-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litAnaphora(isBasil, f) {
  const section  = 'Anaphora';
  const key      = isBasil ? 'anaphora-basil' : 'anaphora-chrysostom';
  const anaphora = f[key];
  const blocks   = [];

  // Sursum Corda
  anaphora['sursum-corda'].forEach((line, i) => {
    const speaker = line.speaker === 'people' ? 'choir' : 'priest';
    const type    = line.speaker === 'people' ? 'response' : 'prayer';
    blocks.push(makeBlock(`sc-${i}`, section, type, speaker, line.text));
  });

  // Preface (incipit — priest says silently; cue is audible)
  blocks.push(makeBlock('preface-rubric', section, 'rubric', null,
    'The priest reads the Preface prayer (mostly in silence). It concludes:'));
  blocks.push(makeBlock('preface-cue', section, 'prayer', 'priest',
    anaphora['sanctus-introduction']));

  // Sanctus
  blocks.push(makeBlock('sanctus', section, 'hymn', 'choir', anaphora['sanctus']));

  // Institution narrative (priest says; people respond)
  blocks.push(makeBlock('inst-rubric', section, 'rubric', null,
    'The priest continues in silence. At the words of institution, the choir responds:'));
  blocks.push(makeBlock('inst-body', section, 'prayer', 'priest', anaphora['institution-body']));
  blocks.push(makeBlock('inst-body-r', section, 'response', 'choir', anaphora['institution-response']));
  blocks.push(makeBlock('inst-cup', section, 'prayer', 'priest', anaphora['institution-cup']));
  blocks.push(makeBlock('inst-cup-r', section, 'response', 'choir', anaphora['institution-response']));

  // Anamnesis / Oblation
  blocks.push(makeBlock('anamnesis', section, 'prayer', 'priest', anaphora['anamnesis']));
  blocks.push(makeBlock('anamnesis-r', section, 'response', 'choir', anaphora['anamnesis-response']));

  // Megalynarion cue
  blocks.push(makeBlock('meg-cue', section, 'prayer', 'priest', anaphora['megalynarion-cue']));

  // Intercessions exclamation + Final blessing
  blocks.push(makeBlock('interc-excl', section, 'prayer', 'priest', anaphora['intercessions-exclamation']));
  blocks.push(makeBlock('interc-resp', section, 'response', 'choir', anaphora['intercessions-response']));
  blocks.push(makeBlock('anaphora-blessing', section, 'prayer', 'priest', anaphora['final-blessing']));
  blocks.push(makeBlock('anaphora-blessing-r', section, 'response', 'choir', anaphora['final-response']));

  return blocks;
}

function _litMegalynarion(megalynarionSpec, isBasil, f) {
  const section = 'Hymn to the Theotokos';
  let text;
  if (typeof megalynarionSpec === 'object' && megalynarionSpec?.text) {
    // Feast-specific megalynarion (irmos of the 9th ode)
    text = megalynarionSpec.text;
  } else if (megalynarionSpec === 'basil-liturgy' || isBasil) {
    text = f['megalynarion-basil'];
  } else {
    text = f['it-is-truly-meet'];
  }
  return [makeBlock('megalynarion', section, 'hymn', 'choir', text)];
}

function _litLordsPrayer(isBasil, f) {
  const section = 'The Lord\'s Prayer';
  const lit = f['litany-lords-prayer'];
  const lp  = f['lords-prayer'];
  const blocks = [
    makeBlock('lp-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('lp-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    const type = p.includes('ask of the Lord') || p.includes('let us ask') ? 'prayer' : 'prayer';
    const resp = p.includes('ask of the Lord') || p.includes('let us ask')
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

function _litPreCommunion(isBasil, f) {
  const section = 'Pre-Communion';
  const pc = f['pre-communion'];
  return [
    makeBlock('pc-peace',      section, 'prayer',   'priest', pc.bowHeads.text),
    makeBlock('pc-peace-r',    section, 'response', 'choir',  pc.bowHeads.response),
    makeBlock('pc-bow',        section, 'prayer',   'deacon', pc.bowHeads.deacon),
    makeBlock('pc-bow-r',      section, 'response', 'choir',  pc.bowHeads.peopleResponse),
    makeBlock('pc-bow-prayer', section, 'prayer',   'priest',
      isBasil ? pc['bow-prayer-basil'] : pc['bow-prayer-chrysostom']),
    makeBlock('pc-elevation-d', section, 'prayer',  'deacon', pc.elevation.deacon),
    makeBlock('pc-elevation-p', section, 'prayer',  'priest', pc.elevation.priest),
    makeBlock('pc-elevation-r', section, 'response','choir',  pc.elevation.people),
  ];
}

function _litCommunionPrayer(f) {
  const pc = f['pre-communion'];
  return [
    makeBlock('pc-prayer', 'Communion Prayer', 'prayer', 'all', pc['prayer-chrysostom']),
  ];
}

function _litCommunionHymn(communionHymn) {
  const section = 'Communion Hymn';
  if (!communionHymn) return [];
  const blocks = [];
  if (communionHymn.label)
    blocks.push(makeBlock('ch-label', section, 'rubric', null, communionHymn.label));
  blocks.push(makeBlock('ch-text', section, 'hymn', 'choir', communionHymn.text));
  return blocks;
}

function _litPostCommunion(spec, f) {
  const section = 'Post-Communion Blessing';
  const pc = f['post-communion-blessing'];
  const isPaschal = spec.weHaveSeen === 'paschal';
  const whs = f[isPaschal ? 'christ-is-risen' : 'we-have-seen'];
  return [
    makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
    makeBlock('pcb-response', section, 'response', 'choir',  pc.people),
    makeBlock('we-have-seen', section, 'hymn',     'choir',  whs),
  ];
}

function _litThanksgiving(isBasil, f) {
  const section = 'Litany of Thanksgiving';
  const lit = f['litany-thanksgiving'];
  const blocks = [
    makeBlock('lt-deacon',   section, 'prayer',   'deacon', lit.deacon),
    makeBlock('lt-response', section, 'response', 'choir',  lit.response),
    makeBlock('lt-petition', section, 'prayer',   'deacon', lit.petition),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`lt-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`lt-r${i}`, section, 'response', 'choir',  lit.petitionResponse));
  });
  blocks.push(makeBlock('lt-prayer', section, 'prayer', 'priest',
    isBasil ? lit['prayer-basil'] : lit['prayer-chrysostom']));
  blocks.push(
    makeBlock('lt-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('lt-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('lt-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('lt-amen',      section, 'response', 'choir',  lit.amen),
  );
  return blocks;
}

function _litBlessedBeTheName(f) {
  const section = 'Blessed be the Name';
  const b = f['blessed-be-the-name'];
  return [
    makeBlock('bbn-text',     section, 'hymn',     'choir',  `${b.text} (×3)`),
    makeBlock('bbn-response', section, 'response', 'choir',  b.response),
    makeBlock('bbn-blessing', section, 'prayer',   'priest', b.finalBlessing),
    makeBlock('bbn-final',    section, 'response', 'choir',  b.finalResponse),
  ];
}

function _litPsalm33(f) {
  const section = 'Psalm 33';
  const p = f['psalm-33'];
  return [
    makeBlock('ps33-rubric', section, 'rubric', null, p.rubric),
    makeBlock('ps33-text',   section, 'prayer', 'reader', p.text),
    makeBlock('ps33-glory',  section, 'doxology', null, p.glory),
  ];
}

function _litDismissalTroparia(isBasil, f, feastTroparia) {
  const section  = 'Dismissal Troparia';

  // Great feasts: use feast troparion + kontakion instead of liturgy-saint troparia
  if (feastTroparia?.troparion) {
    const ft = feastTroparia.troparion;
    const blocks = [
      makeBlock('dt-rubric', section, 'rubric', null, ft.rubric || `Troparion, Tone ${ft.tone}:`),
      makeBlock('dt-trop',   section, 'hymn',   'choir', ft.text, { tone: ft.tone }),
    ];
    if (feastTroparia.kontakion) {
      const fk = feastTroparia.kontakion;
      blocks.push(
        makeBlock('dt-glory',  section, 'doxology', null, 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.'),
        makeBlock('dt-kont',   section, 'hymn',     'choir', fk.text, { tone: fk.tone }),
      );
    }
    return blocks;
  }

  const tropKey  = isBasil ? 'troparion-basil' : 'troparion-chrysostom';
  const trop     = f[tropKey];
  const theos    = f['dismissal-theotokion'];
  return [
    makeBlock('dt-rubric',  section, 'rubric',   null,    isBasil ? 'Troparion of St. Basil the Great, Tone 1:' : 'Troparion of St. John Chrysostom, Tone 8:'),
    makeBlock('dt-trop',    section, 'hymn',     'choir', trop.troparion, { tone: trop.tone }),
    makeBlock('dt-glory',   section, 'doxology', null,    'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.'),
    makeBlock('dt-theos',   section, 'hymn',     'choir', theos),
  ];
}

function _litDismissal(dismissalSpec, isBasil) {
  const section = 'Dismissal';
  if (!dismissalSpec) {
    return [makeBlock('dis-text', section, 'prayer', 'priest', '[Dismissal]')];
  }

  const liturgySaintName = isBasil ? 'our holy father Basil the Great, Archbishop of Caesarea in Cappadocia' : 'our father among the saints John Chrysostom, Archbishop of Constantinople';
  const saintsStr = (dismissalSpec.saints || []).join('; ');
  const dayPatron = dismissalSpec.dayPatron || null;

  let opening;
  if (dismissalSpec.opening === 'feast' && dismissalSpec.feastLabel) {
    opening = `May Christ our true God,`;
  } else if (dismissalSpec.opening === 'sunday') {
    opening = 'May He Who rose from the dead, Christ our true God,';
  } else {
    opening = 'May Christ our true God,';
  }

  // Order: Theotokos → day-of-week patron → liturgy saint → day's saints → all saints
  const parts = ['through the prayers of His most pure Mother'];
  if (dayPatron) parts.push(`of ${dayPatron}`);
  parts.push(`of ${liturgySaintName}`);
  if (saintsStr) parts.push(`of ${saintsStr}`);
  const closing = `${parts.join('; ')}; and of all the saints, have mercy on us and save us, forasmuch as He is good and loveth mankind.`;

  return [
    makeBlock('dis-wisdom',  section, 'prayer',  'deacon', 'Wisdom!'),
    makeBlock('dis-bless',   section, 'prayer',  'choir',  'Father, bless.'),
    makeBlock('dis-blessed', section, 'prayer',  'priest', 'Blessed is He that is, Christ our true God, always, now and ever, and unto ages of ages.'),
    makeBlock('dis-confirm', section, 'response','choir',  'Amen. Preserve, O God, the holy Orthodox faith and Orthodox Christians, unto ages of ages.'),
    makeBlock('dis-theos',   section, 'prayer',  'priest', 'Most holy Theotokos, save us.'),
    makeBlock('dis-mag',     section, 'response','choir',  'More honorable than the Cherubim, and more glorious beyond compare than the Seraphim, without defilement thou gavest birth to God the Word: true Theotokos, we magnify thee.'),
    makeBlock('dis-glory',   section, 'prayer',  'priest', 'Glory to Thee, O Christ our God and our hope, glory to Thee.'),
    makeBlock('dis-glory-r', section, 'response','choir',  'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen. Lord, have mercy. Lord, have mercy. Lord, have mercy. Father, bless.'),
    makeBlock('dis-proper',  section, 'prayer',  'priest', `${opening} ${closing}`),
    makeBlock('dis-amen',    section, 'response','choir',  'Amen.'),
  ];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates a ServiceBlock object.
 */
function makeBlock(id, section, type, speaker, text, extras = {}) {
  const block = { id, section, type, speaker, text };
  for (const [k, v] of Object.entries(extras)) {
    if (v !== undefined && v !== null) block[k] = v;
  }
  return block;
}

// ─── Presanctified Liturgy Assembler ──────────────────────────────────────────

/**
 * Assembles the Liturgy of the Presanctified Gifts for a given calendar day.
 *
 * The Presanctified begins as Lenten Vespers (Psalm 103 → Great Litany →
 * Kathisma 18 → Lord I Call → Entrance → Gladsome Light → Prokeimena with
 * OT readings), then transitions to the communion portion unique to this
 * service (Let My Prayer Arise → Great Entrance → Lord's Prayer → Communion).
 *
 * @param {Object} calendarDay        - Calendar entry (must have .vespers spec)
 * @param {Object} vespersFixed       - Parsed fixed-texts/vespers-fixed.json
 * @param {Object} liturgyFixed       - Parsed fixed-texts/liturgy-fixed.json
 * @param {Object} presanctifiedFixed - Parsed fixed-texts/presanctified-fixed.json
 * @param {Object} sources            - { triodion, menaion, octoechos, prokeimena, db }
 * @returns {ServiceBlock[]}
 */
function assemblePresanctified(calendarDay, vespersFixed, liturgyFixed, presanctifiedFixed, sources) {
  _warnings = [];
  const blocks = [];
  const vespers = calendarDay.vespers;

  // ── VESPERS PORTION ──────────────────────────────────────────────────────────

  // 1. Opening (same as Vespers)
  blocks.push(...assembleOpening(vespersFixed, false));

  // 2. Psalm 103
  blocks.push(...assemblePsalm103(vespersFixed));

  // 3. Great Litany
  blocks.push(...assembleGreatLitany(vespersFixed));

  // 4. Kathisma 18 (always Kathisma 18 at the Presanctified)
  blocks.push(...assembleKathismaReading(18, 'Kathisma'));
  blocks.push(...assembleLittleLitany(vespersFixed));

  // 5. Lord, I Call (with Lenten stichera)
  blocks.push(...assembleLordICall(vespers.lordICall, vespersFixed, sources));

  // 6. Entrance
  blocks.push(makeBlock('entrance-wisdom', 'The Entrance', 'prayer', 'deacon',
    vespersFixed.entrance.wisdom));

  // 7. Gladsome Light
  blocks.push(makeBlock('gladsome-light', 'Gladsome Light', 'hymn', 'choir',
    vespersFixed['gladsome-light']));

  // 8. Prokeimena + OT Readings (Genesis, Proverbs — Lenten double pattern)
  blocks.push(...assembleProkeimenon(vespers.prokeimenon, vespersFixed, sources));

  // ── PRESANCTIFIED PORTION ────────────────────────────────────────────────────

  // 9. "Let My Prayer Arise" (Psalm 140 with prostrations)
  blocks.push(..._psLetMyPrayerArise(presanctifiedFixed));

  // 10. Prayer of St. Ephrem
  blocks.push(..._psPrayerOfEphrem(presanctifiedFixed));

  // 11. Aposticha (Lenten)
  blocks.push(...assembleAposticha(vespers.aposticha, calendarDay, vespersFixed, sources));

  // 12. Nunc Dimittis
  blocks.push(...assembleNuncDimittis(vespersFixed));

  // 13. Troparia
  blocks.push(...assembleTroparia(vespers.troparia, sources));

  // 14. Litany for the Catechumens (uses liturgy fixed text)
  blocks.push(..._litCatechumens(liturgyFixed));

  // 15. Litanies of the Faithful
  blocks.push(..._litLitaniesFaithful(liturgyFixed));

  // 16. "Now the Powers of Heaven" (replaces Cherubic Hymn)
  blocks.push(..._psNowThePowers(presanctifiedFixed));

  // 17. Litany of Supplication (Presanctified variant)
  blocks.push(..._psSupplication(presanctifiedFixed));

  // 18. Lord's Prayer
  {
    const section = 'The Lord\'s Prayer';
    const lp = liturgyFixed['lords-prayer'];
    blocks.push(
      makeBlock('lords-prayer', section, 'prayer', 'all', lp.text),
      makeBlock('lp-doxology',  section, 'prayer', 'priest', lp.doxology),
      makeBlock('lp-dox-resp',  section, 'response', 'choir', lp.response),
    );
  }

  // 19. Elevation + Pre-Communion
  blocks.push(..._psPreCommunion(presanctifiedFixed));

  // 20. Communion Hymn
  blocks.push(makeBlock('ch-text', 'Communion Hymn', 'hymn', 'choir',
    presanctifiedFixed['communion-hymn'].text));

  // 20a. Communion Prayer
  blocks.push(makeBlock('pc-prayer', 'Communion Prayer', 'prayer', 'all',
    presanctifiedFixed['pre-communion-prayer'].text));

  // 21. Post-Communion
  {
    const section = 'Post-Communion';
    const pc = presanctifiedFixed['post-communion'];
    blocks.push(
      makeBlock('pcb-priest',   section, 'prayer',   'priest', pc.priest),
      makeBlock('pcb-response', section, 'response', 'choir',  pc.people),
    );
  }

  // 22. Litany of Thanksgiving
  blocks.push(..._psThanksgiving(presanctifiedFixed));

  // 23. Prayer behind the Ambon
  blocks.push(makeBlock('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    presanctifiedFixed['prayer-ambon']));

  // 24. Blessed be the Name
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 25. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 26. Dismissal
  blocks.push(..._psDismissal(presanctifiedFixed));

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Presanctified Section Assemblers ────────────────────────────────────────

function _psLetMyPrayerArise(f) {
  const section = 'Let My Prayer Arise';
  const lmp = f['let-my-prayer-arise'];
  const blocks = [];

  // Full refrain first
  blocks.push(makeBlock('lmp-refrain-0', section, 'hymn', 'choir', lmp.refrain));

  // Verses alternating with refrain and prostrations
  lmp.verses.forEach((verse, i) => {
    blocks.push(makeBlock(`lmp-v${i}`, section, 'verse', 'choir', verse));
    blocks.push(makeBlock(`lmp-prostration-${i}`, section, 'rubric', null, 'Prostration.'));
    // After the last verse, sing just the half-refrain
    const refrain = (i === lmp.verses.length - 1) ? lmp.halfRefrain : lmp.refrain;
    blocks.push(makeBlock(`lmp-refrain-${i + 1}`, section, 'hymn', 'choir', refrain));
  });

  return blocks;
}

function _psPrayerOfEphrem(f) {
  const section = 'Prayer of St. Ephrem';
  const pe = f['prayer-of-st-ephrem'];
  return [
    makeBlock('ephrem-rubric', section, 'rubric', null, pe.rubric),
    makeBlock('ephrem-text',   section, 'prayer', 'all', pe.text),
  ];
}

function _psNowThePowers(f) {
  const section = 'Now the Powers of Heaven';
  const np = f['now-the-powers'];
  return [
    makeBlock('np-first',  section, 'hymn', 'choir', np.firstHalf),
    makeBlock('np-rubric', section, 'rubric', null,
      'The presanctified Gifts are carried from the Table of Oblation through the nave to the Holy Table.'),
    makeBlock('np-second', section, 'hymn', 'choir', np.secondHalf),
    makeBlock('np-concl',  section, 'hymn', 'choir', np.conclusion),
    makeBlock('np-prostration', section, 'rubric', null, 'Prostration.'),
  ];
}

function _psSupplication(f) {
  const section = 'Litany of Supplication';
  const lit = f['litany-presanctified'];
  const blocks = [
    makeBlock('ps-supp-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('ps-supp-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`ps-supp-p${i}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`ps-supp-p${i}-resp`, section, 'response', 'choir', lit.response));
  });
  lit.petitions2.forEach((p, i) => {
    blocks.push(makeBlock(`ps-supp-q${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`ps-supp-qr${i}`, section, 'response', 'choir',  lit.petitions2Response));
  });
  blocks.push(
    makeBlock('ps-supp-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('ps-supp-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('ps-supp-excl',      section, 'prayer',   'priest', lit.exclamation),
  );
  return blocks;
}

function _psPreCommunion(f) {
  const section = 'Pre-Communion';
  const el = f['elevation'];
  return [
    makeBlock('pc-peace',       section, 'prayer',   'priest', 'Peace be unto all.'),
    makeBlock('pc-peace-r',     section, 'response', 'choir',  'And to thy spirit.'),
    makeBlock('pc-bow',         section, 'prayer',   'deacon', 'Bow your heads unto the Lord.'),
    makeBlock('pc-bow-r',       section, 'response', 'choir',  'To Thee, O Lord.'),
    makeBlock('pc-elevation-d', section, 'prayer',   'deacon', el.deacon),
    makeBlock('pc-elevation-p', section, 'prayer',   'priest', el.priest),
    makeBlock('pc-elevation-r', section, 'response', 'choir',  el.people),
  ];
}

function _psThanksgiving(f) {
  const section = 'Litany of Thanksgiving';
  const lit = f['litany-thanksgiving'];
  const blocks = [
    makeBlock('lt-deacon',   section, 'prayer',   'deacon', lit.deacon),
    makeBlock('lt-response', section, 'response', 'choir',  lit.response),
    makeBlock('lt-petition', section, 'prayer',   'deacon', lit.petition),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`lt-p${i}`, section, 'prayer',   'deacon', p));
    blocks.push(makeBlock(`lt-r${i}`, section, 'response', 'choir',  lit.petitionResponse));
  });
  blocks.push(
    makeBlock('lt-prayer',    section, 'prayer',   'priest', lit.prayer),
    makeBlock('lt-comm',      section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('lt-comm-resp', section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('lt-excl',      section, 'prayer',   'priest', lit.exclamation),
    makeBlock('lt-amen',      section, 'response', 'choir',  'Amen.'),
  );
  return blocks;
}

function _psDismissal(f) {
  const section = 'Dismissal';
  const d = f['dismissal'];
  return [
    makeBlock('dis-prayer',  section, 'prayer',   'priest', d.exclamation),
    makeBlock('dis-glory',   section, 'doxology', null,     d.glorySuffix),
    makeBlock('dis-response',section, 'response', 'choir',  d.response),
    makeBlock('dis-blessing',section, 'prayer',   'priest', d.finalBlessing),
    makeBlock('dis-amen',    section, 'response', 'choir',  d.amen),
  ];
}

// ─── Paschal Hours Assembler ──────────────────────────────────────────────────

/**
 * Assembles the Paschal Hours — the short fixed service that replaces the
 * regular Hours (1st, 3rd, 6th, 9th) from Pascha through Bright Saturday.
 * All four hours are structurally identical. No variable content.
 *
 * @param {Object} f - Parsed fixed-texts/paschal-hours-fixed.json
 * @returns {ServiceBlock[]}
 */
function assemblePaschalHours(f) {
  _warnings = [];
  const blocks = [];

  // 1. Opening
  blocks.push(
    makeBlock('opening-exclamation', 'Opening', 'prayer', 'priest', f.opening.exclamation),
    makeBlock('opening-amen', 'Opening', 'response', 'reader', f.opening.amen),
  );

  // 2. Paschal Troparion ×3
  const section2 = 'Paschal Troparion';
  for (let i = 0; i < 3; i++) {
    blocks.push(makeBlock(`pt-${i}`, section2, 'hymn', 'choir', f['paschal-troparion'], { tone: 5 }));
  }

  // 3. "Having beheld the Resurrection of Christ"
  blocks.push(makeBlock('having-beheld', 'Having Beheld the Resurrection', 'hymn', 'choir',
    f['having-beheld']));

  // 4. Hypakoe
  blocks.push(makeBlock('hypakoe', 'Hypakoe', 'hymn', 'choir',
    f.hypakoe.text, { tone: f.hypakoe.tone }));

  // 5. Kontakion
  blocks.push(makeBlock('kontakion', 'Kontakion', 'hymn', 'choir',
    f.kontakion.text, { tone: f.kontakion.tone }));

  // 6. Ikos
  blocks.push(makeBlock('ikos', 'Kontakion', 'hymn', 'reader',
    f.ikos.text));

  // 7. Paschal Troparion ×3 (again)
  for (let i = 0; i < 3; i++) {
    blocks.push(makeBlock(`pt2-${i}`, 'Paschal Troparion', 'hymn', 'choir',
      f['paschal-troparion'], { tone: 5 }));
  }

  // 8. "In the grave bodily" troparion
  const section8 = 'Exaposteilarion';
  blocks.push(makeBlock('in-the-grave', section8, 'hymn', 'choir',
    f['troparion-in-the-grave'].text, { tone: f['troparion-in-the-grave'].tone }));

  // 9. Glory
  blocks.push(makeBlock('ex-glory-label', section8, 'doxology', null,
    'Glory to the Father, and to the Son, and to the Holy Spirit.'));
  blocks.push(makeBlock('ex-glory', section8, 'hymn', 'choir',
    f['troparion-glory'].text));

  // 10. Now and ever
  blocks.push(makeBlock('ex-now-label', section8, 'doxology', null,
    'Now and ever and unto ages of ages. Amen.'));
  blocks.push(makeBlock('ex-now', section8, 'hymn', 'choir',
    f['troparion-now'].text));

  // 11. Lord, have mercy ×40
  blocks.push(makeBlock('lhm-40', 'Petitions', 'response', 'reader',
    'Lord, have mercy. (×40)'));

  // 12. Glory, Now
  blocks.push(makeBlock('glory-now', 'Petitions', 'doxology', 'reader',
    'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));

  // 13. More honorable than the Cherubim
  blocks.push(makeBlock('magnification', 'Petitions', 'hymn', 'reader',
    'More honorable than the Cherubim, and more glorious beyond compare than the Seraphim, without corruption thou gavest birth to God the Word: true Theotokos, we magnify thee.'));

  // 14. Dismissal
  const sectionD = 'Dismissal';
  blocks.push(
    makeBlock('dis-text', sectionD, 'prayer', 'priest', f.dismissal.text),
    makeBlock('dis-amen', sectionD, 'response', 'choir', f.dismissal.response),
    makeBlock('dis-troparion', sectionD, 'hymn', 'choir', f.dismissal.finalTroparion, { tone: 5 }),
    makeBlock('dis-blessing', sectionD, 'prayer', 'priest', f.dismissal.finalBlessing),
    makeBlock('dis-final-amen', sectionD, 'response', 'choir', 'Amen.'),
  );

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Paschal Midnight Office ─────────────────────────────────────────────────

function assembleMidnightOffice(f) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    blocks.push(makeBlock(id, section, type, speaker, text, extras));

  // 1. Opening
  S('mo-excl', 'Opening', 'prayer', 'priest', f.opening.exclamation);
  S('mo-amen', 'Opening', 'response', 'reader', f.opening.amen);
  S('mo-glory', 'Opening', 'prayer', 'reader', f.gloryToThee);
  S('mo-hk', 'Opening', 'prayer', 'reader', f.heavenlyKing);

  // 2. Trisagion prayers
  S('mo-tris', 'Trisagion', 'prayer', 'reader', f.trisagion.holyGod + ' (Thrice)');
  S('mo-tris-gn', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow);
  S('mo-tris-ht', 'Trisagion', 'prayer', 'reader', f.trisagion.holyTrinity);
  S('mo-tris-lhm', 'Trisagion', 'response', 'reader', f.trisagion.lordHaveMercy + ' (Thrice)');
  S('mo-tris-gn2', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow2);

  // 3. Our Father
  S('mo-of', 'Our Father', 'prayer', 'reader', f.ourFather.text);
  S('mo-of-excl', 'Our Father', 'prayer', 'priest', f.ourFather.exclamation);
  S('mo-of-amen', 'Our Father', 'response', 'reader', f.ourFather.amen);

  // 4. Lord, have mercy ×12 + O come let us worship
  S('mo-lhm12', 'Opening', 'response', 'reader', f.lordHaveMercy12);
  S('mo-gn', 'Opening', 'prayer', 'reader', f.gloryNow);
  for (let i = 0; i < f.oComeLetUsWorship.length; i++) {
    S(`mo-ocluw-${i}`, 'Opening', 'prayer', 'reader', f.oComeLetUsWorship[i]);
  }

  // 5. Psalm 50
  S('mo-ps50', 'Psalm 50', 'verse', 'reader', f.psalm50);

  // 6. Canon of Holy Saturday (Tone 6)
  const odes = ['ode1', 'ode3', 'ode4', 'ode5', 'ode6', 'ode7', 'ode8', 'ode9'];
  const odeNames = { ode1:'Ode I', ode3:'Ode III', ode4:'Ode IV', ode5:'Ode V',
                     ode6:'Ode VI', ode7:'Ode VII', ode8:'Ode VIII', ode9:'Ode IX' };

  for (const ode of odes) {
    const o = f.canon[ode];
    const sec = `Canon — ${odeNames[ode]}`;

    S(`mo-${ode}-irm`, sec, 'hymn', 'choir', o.irmos, { tone: 6, label: 'Irmos' });

    for (let i = 0; i < o.troparia.length; i++) {
      const t = o.troparia[i];
      S(`mo-${ode}-ref-${i}`, sec, 'verse', 'reader', t.refrain);
      S(`mo-${ode}-trop-${i}`, sec, 'hymn', 'choir', t.text);
    }

    S(`mo-${ode}-kat`, sec, 'hymn', 'choir', o.katavasia, { tone: 6, label: 'Katavasia' });

    // Sessional hymn after Ode III
    if (ode === 'ode3' && f.canon.sessionalHymn) {
      S('mo-sess', 'Sessional Hymn', 'hymn', 'choir', f.canon.sessionalHymn.text,
        { tone: f.canon.sessionalHymn.tone });
    }

    // Kontakion & Ikos after Ode VI
    if (ode === 'ode6') {
      S('mo-kont', 'Kontakion', 'hymn', 'choir', f.canon.kontakion.text,
        { tone: f.canon.kontakion.tone, label: 'Kontakion' });
      S('mo-ikos', 'Kontakion', 'hymn', 'reader', f.canon.ikos, { label: 'Ikos' });
    }
  }

  // 7. Closing Trisagion + Our Father
  const c = f.closing;
  S('mo-cl-tris', 'Closing Prayers', 'prayer', 'reader', c.trisagion + ' (Thrice)');
  S('mo-cl-gn', 'Closing Prayers', 'prayer', 'reader', c.gloryNow);
  S('mo-cl-ht', 'Closing Prayers', 'prayer', 'reader', c.holyTrinity);
  S('mo-cl-lhm', 'Closing Prayers', 'response', 'reader', c.lordHaveMercy + ' (Thrice)');
  S('mo-cl-gn2', 'Closing Prayers', 'prayer', 'reader', c.gloryNow2);
  S('mo-cl-of', 'Closing Prayers', 'prayer', 'reader', c.ourFather);
  S('mo-cl-excl', 'Closing Prayers', 'prayer', 'priest', c.exclamation);
  S('mo-cl-amen', 'Closing Prayers', 'response', 'reader', c.amen);

  // 8. Troparion
  S('mo-trop', 'Troparion', 'hymn', 'choir', f.troparion.text, { tone: f.troparion.tone });

  // 9. Litany
  for (let i = 0; i < f.litany.petitions.length; i++) {
    const p = f.litany.petitions[i];
    S(`mo-lit-${i}`, 'Litany', p.speaker === 'priest' ? 'prayer' : 'response',
      p.speaker, p.text);
  }
  S('mo-lit-excl', 'Litany', 'prayer', 'priest', f.litany.exclamation);
  S('mo-lit-amen', 'Litany', 'response', 'choir', f.litany.amen);

  // 10. Pre-Dismissal
  const pd = f.preDissmissal;
  S('mo-pd-gl', 'Dismissal', 'prayer', 'priest', pd.gloryToThee);
  S('mo-pd-gn', 'Dismissal', 'doxology', 'choir', pd.gloryNow);
  S('mo-pd-lhm', 'Dismissal', 'response', 'choir', pd.lordHaveMercy);
  S('mo-pd-fb', 'Dismissal', 'response', 'choir', pd.fatherBless);

  // 11. Dismissal
  S('mo-dis', 'Dismissal', 'prayer', 'priest', f.dismissal.text);
  S('mo-dis-amen', 'Dismissal', 'response', 'choir', f.dismissal.response);

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Paschal Matins ──────────────────────────────────────────────────────────

function assemblePaschalMatins(f) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    blocks.push(makeBlock(id, section, type, speaker, text, extras));

  // 1. Procession hymn
  S('pm-proc', 'Procession', 'hymn', 'choir', f.procession.text, { label: 'Thrice, then repeatedly during procession' });

  // 2. Opening doxology
  S('pm-dox', 'Opening', 'prayer', 'priest', f.openingDoxology);
  S('pm-dox-amen', 'Opening', 'response', 'choir', 'Amen.');

  // 3. Paschal Troparion ×3 (clergy) + ×3 (choir)
  for (let i = 0; i < 3; i++) {
    S(`pm-pt-cl-${i}`, 'Paschal Troparion', 'hymn', 'priest', f.paschalTroparion, { tone: 5 });
  }
  for (let i = 0; i < 3; i++) {
    S(`pm-pt-ch-${i}`, 'Paschal Troparion', 'hymn', 'choir', f.paschalTroparion, { tone: 5 });
  }

  // 4. Stichoi with troparion
  for (let i = 0; i < f.stichoi.length; i++) {
    S(`pm-stichos-${i}`, 'Paschal Troparion', 'verse', 'priest', f.stichoi[i]);
    S(`pm-stichos-resp-${i}`, 'Paschal Troparion', 'hymn', 'choir', f.paschalTroparion);
  }

  // Glory, Now + Troparion
  S('pm-glory', 'Paschal Troparion', 'doxology', 'priest',
    'Glory to the Father and to the Son and to the Holy Spirit.');
  S('pm-glory-resp', 'Paschal Troparion', 'hymn', 'choir', f.paschalTroparion);
  S('pm-now', 'Paschal Troparion', 'doxology', 'priest',
    'Both now and ever, and unto the ages of ages. Amen.');
  S('pm-now-resp', 'Paschal Troparion', 'hymn', 'choir', f.paschalTroparion);

  // Split troparion
  S('pm-split-pr', 'Paschal Troparion', 'hymn', 'priest', f.paschalTroparionSplit.priest);
  S('pm-split-ch', 'Paschal Troparion', 'hymn', 'choir', f.paschalTroparionSplit.choir);

  // 5. Great Litany
  const gl = f.greatLitany;
  for (let i = 0; i < gl.petitions.length; i++) {
    const p = gl.petitions[i];
    S(`pm-gl-${i}`, 'Great Litany', 'prayer', 'deacon', p.deacon);
    S(`pm-gl-r-${i}`, 'Great Litany', 'response', 'choir', p.response);
  }
  S('pm-gl-excl', 'Great Litany', 'prayer', 'priest', gl.exclamation);
  S('pm-gl-amen', 'Great Litany', 'response', 'choir', gl.amen);

  // 6. Canon of Pascha (Tone 1)
  const odes = ['ode1', 'ode3', 'ode4', 'ode5', 'ode6', 'ode7', 'ode8', 'ode9'];
  const odeNames = { ode1:'Ode I', ode3:'Ode III', ode4:'Ode IV', ode5:'Ode V',
                     ode6:'Ode VI', ode7:'Ode VII', ode8:'Ode VIII', ode9:'Ode IX' };

  for (const ode of odes) {
    const o = f.canon[ode];
    const sec = `Canon — ${odeNames[ode]}`;

    // Irmos (Ode 9 has special structure with its own refrain)
    if (ode === 'ode9' && o.irmos.refrain) {
      S(`pm-${ode}-irm-ref`, sec, 'verse', 'reader', o.irmos.refrain);
      S(`pm-${ode}-irm`, sec, 'hymn', 'choir', o.irmos.text, { tone: 1, label: 'Irmos' });
    } else {
      S(`pm-${ode}-irm`, sec, 'hymn', 'choir', typeof o.irmos === 'string' ? o.irmos : o.irmos.text,
        { tone: 1, label: 'Irmos' });
    }

    // Troparia
    for (let i = 0; i < o.troparia.length; i++) {
      const t = o.troparia[i];
      S(`pm-${ode}-ref-${i}`, sec, 'verse', 'reader', t.refrain);
      S(`pm-${ode}-trop-${i}`, sec, 'hymn', 'choir', t.text);
    }

    // Katavasia (= irmos repeated) — Paschal canon uses troparion ×3 instead
    S(`pm-${ode}-kat`, sec, 'hymn', 'choir', f.paschalTroparion + ' (Thrice)',
      { tone: 5, label: 'Katavasia' });

    // Small Litany after each ode
    const sl = f.smallLitany;
    for (let j = 0; j < sl.petitions.length; j++) {
      const p = sl.petitions[j];
      S(`pm-${ode}-sl-${j}`, 'Small Litany', 'prayer', 'deacon', p.deacon);
      S(`pm-${ode}-sl-r-${j}`, 'Small Litany', 'response', 'choir', p.response);
    }
    S(`pm-${ode}-sl-excl`, 'Small Litany', 'prayer', 'priest', o.litanyExclamation);
    S(`pm-${ode}-sl-amen`, 'Small Litany', 'response', 'choir', sl.amen);

    // Hypakoe after Ode III
    if (ode === 'ode3') {
      S('pm-hypakoe', 'Hypakoe', 'hymn', 'choir', f.hypakoe.text, { tone: f.hypakoe.tone });
    }

    // Kontakion, Ikos, "Having Beheld" after Ode VI
    if (ode === 'ode6') {
      S('pm-kont', 'Kontakion', 'hymn', 'choir', f.kontakion.text,
        { tone: f.kontakion.tone, label: 'Kontakion' });
      S('pm-ikos', 'Kontakion', 'hymn', 'reader', f.ikos.text, { label: 'Ikos' });
      for (let i = 0; i < 3; i++) {
        S(`pm-hb-${i}`, 'Hymn of the Resurrection', 'hymn', 'choir', f.havingBeheld.text);
      }
    }
  }

  // 7. Exapostilarion (×3)
  for (let i = 0; i < 3; i++) {
    S(`pm-exap-${i}`, 'Exapostilarion', 'hymn', 'choir', f.exapostilarion.text,
      { tone: f.exapostilarion.tone });
  }

  // 8. The Lauds (Praises)
  const la = f.lauds;
  S('pm-lauds-open', 'The Praises', 'verse', 'choir', la.opening);
  S('pm-lauds-v2', 'The Praises', 'verse', 'choir', la.secondVerse);

  // Psalm verses (read)
  for (let i = 0; i < la.psalmVerses.length; i++) {
    S(`pm-lauds-pv-${i}`, 'The Praises', 'verse', 'reader', la.psalmVerses[i]);
  }

  // Resurrectional stichera (Tone 1)
  const rs = la.resurrectionalStichera;
  for (let i = 0; i < rs.stichera.length; i++) {
    S(`pm-lauds-rs-st-${i}`, 'The Praises', 'verse', 'reader', rs.stichera[i].stichos);
    S(`pm-lauds-rs-${i}`, 'The Praises', 'hymn', 'choir', rs.stichera[i].text,
      { tone: rs.tone });
  }

  // Paschal stichera (Tone 5)
  const ps = la.paschalStichera;
  for (let i = 0; i < ps.stichera.length; i++) {
    S(`pm-lauds-ps-st-${i}`, 'The Praises', 'verse', 'reader', ps.stichera[i].stichos);
    S(`pm-lauds-ps-${i}`, 'The Praises', 'hymn', 'choir', ps.stichera[i].text,
      { tone: ps.tone });
  }

  // Glory/Now + final sticheron
  S('pm-lauds-gn', 'The Praises', 'doxology', null,
    'Glory to the Father, and to the Son, and to the Holy Spirit, both now and ever, and unto the ages of ages. Amen.');
  S('pm-lauds-final', 'The Praises', 'hymn', 'choir', la.gloryNow);

  // Paschal Troparion ×3
  for (let i = 0; i < 3; i++) {
    S(`pm-lauds-pt-${i}`, 'The Praises', 'hymn', 'choir', f.paschalTroparion, { tone: 5 });
  }

  // 9. Chrysostom Homily
  S('pm-chr-rubric', 'Catechetical Homily', 'rubric', null, f.chrysostomHomily.rubric);
  if (f.chrysostomHomily.text) {
    const paragraphs = f.chrysostomHomily.text;
    for (let i = 0; i < paragraphs.length; i++) {
      S(`pm-chr-${i}`, 'Catechetical Homily', 'prayer', 'priest', paragraphs[i]);
    }
  }
  S('pm-chr-trop', 'Catechetical Homily', 'hymn', 'choir', f.chrysostomHomily.troparion.text,
    { tone: f.chrysostomHomily.troparion.tone, label: 'Troparion to St. John Chrysostom' });

  // 10. Augmented Litany
  const al = f.augmentedLitany;
  for (let i = 0; i < al.petitions.length; i++) {
    const p = al.petitions[i];
    S(`pm-al-${i}`, 'Augmented Litany', 'prayer', 'deacon', p.deacon);
    const rc = p.responseCount || 1;
    S(`pm-al-r-${i}`, 'Augmented Litany', 'response', 'choir',
      rc > 1 ? `${p.response} (×${rc})` : p.response);
  }
  S('pm-al-excl', 'Augmented Litany', 'prayer', 'priest', al.exclamation);
  S('pm-al-amen', 'Augmented Litany', 'response', 'choir', al.amen);

  // 11. Supplication Litany
  const sup = f.supplicationLitany;
  for (let i = 0; i < sup.petitions.length; i++) {
    const p = sup.petitions[i];
    S(`pm-sup-${i}`, 'Litany of Supplication', 'prayer', 'deacon', p.deacon);
    S(`pm-sup-r-${i}`, 'Litany of Supplication', 'response', 'choir', p.response);
  }
  S('pm-sup-excl', 'Litany of Supplication', 'prayer', 'priest', sup.exclamation);
  S('pm-sup-amen', 'Litany of Supplication', 'response', 'choir', sup.amen);

  // 12. Closing
  const cl = f.closing;
  S('pm-cl-peace', 'Closing', 'prayer', 'priest', cl.peace.priest);
  S('pm-cl-peace-r', 'Closing', 'response', 'choir', cl.peace.response);
  S('pm-cl-bow', 'Closing', 'prayer', 'deacon', cl.bowHeads.deacon);
  S('pm-cl-bow-r', 'Closing', 'response', 'choir', cl.bowHeads.response);
  S('pm-cl-excl', 'Closing', 'prayer', 'priest', cl.headBowingExclamation);
  S('pm-cl-amen', 'Closing', 'response', 'choir', cl.amen);
  S('pm-cl-wisdom', 'Closing', 'prayer', 'deacon', cl.wisdom);
  S('pm-cl-fb', 'Closing', 'response', 'choir', cl.blessing.choir);
  S('pm-cl-blessed', 'Closing', 'prayer', 'priest', cl.blessing.priest);
  S('pm-cl-confirm', 'Closing', 'response', 'choir', cl.confirmFaith);
  S('pm-cl-split-cl', 'Closing', 'hymn', 'priest', cl.finalTroparionSplit.clergy);
  S('pm-cl-split-ch', 'Closing', 'hymn', 'choir', cl.finalTroparionSplit.choir);

  // 13. Dismissal
  S('pm-dis', 'Dismissal', 'prayer', 'priest', f.dismissal.text);
  S('pm-dis-amen', 'Dismissal', 'response', 'choir', f.dismissal.response);
  for (let i = 0; i < 3; i++) {
    S(`pm-dis-cr-pr-${i}`, 'Dismissal', 'prayer', 'priest', f.dismissal.christIsRisenExchange.priest);
    S(`pm-dis-cr-pe-${i}`, 'Dismissal', 'response', 'all', f.dismissal.christIsRisenExchange.people);
  }
  for (let i = 0; i < 3; i++) {
    S(`pm-dis-ft-${i}`, 'Dismissal', 'hymn', 'choir', f.dismissal.finalTroparion, { tone: 5 });
  }
  S('pm-dis-dox', 'Dismissal', 'hymn', 'choir', f.dismissal.finalDoxastikon);

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Bridegroom Matins (Holy Mon/Tue/Wed evenings) ──────────────────────────

/**
 * Assembles Bridegroom Matins — served Mon/Tue/Wed evenings of Holy Week.
 * The structure is shared across all three nights; the kontakion, ikos,
 * sessional hymn, canon, lauds stichera, and aposticha vary by night.
 *
 * Correct order per St. Nicholas OCA service book:
 *   Royal Office → Six Psalms → Great Litany → Alleluia → Troparion →
 *   Kathisma readings + hymns (with little litanies) → Gospel →
 *   Psalm 50 → Priest's prayer → Little Litany → Kontakion/Ikos →
 *   Canon (with troparia + katavasia) → Little Litany → Exaposteilarion →
 *   Praises (Ps 148-150 + stichera) → Priest exclamation → Great Doxology (read) →
 *   Morning Litany → Bow-head prayer → Aposticha → Closing prayers →
 *   Prayer of St. Ephrem → Dismissal
 *
 * @param {Object} f    - Parsed fixed-texts/bridegroom-matins-fixed.json
 * @param {string} night - 'monday' | 'tuesday' | 'wednesday'
 * @returns {ServiceBlock[]}
 */
function assembleBridegroomMatins(f, night) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  const nightData = f[night];
  if (!nightData) {
    console.warn(`No Bridegroom Matins data for night: ${night}`);
    return blocks;
  }

  const vf = getVespersFixed();
  const mf = getMatinsFixed();
  const psalter = getPsalter();

  // ── Royal Office ──────────────────────────────────────────────────────────
  {
    const section = 'Royal Office';

    // Opening blessing
    blocks.push(S('opening-excl', section, 'prayer', 'priest', f.opening.exclamation));
    blocks.push(S('opening-amen', section, 'response', 'reader', f.opening.amen));

    // Opening prayers: O heavenly King, Trisagion, Our Father
    blocks.push(S('ro-heavenlyking', section, 'prayer', 'reader', vf.prayers.heavenlyKing));
    blocks.push(S('ro-trisagion', section, 'prayer', 'reader',
      vf.prayers.trisagion +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.' +
      '\n\n' + vf.prayers.mostHolyTrinity +
      '\n\nLord, have mercy. (×3)' +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('ro-ourfather', section, 'prayer', 'reader', vf.prayers.ourFather));
    blocks.push(S('ro-ourfather-excl', section, 'prayer', 'priest', vf.prayers['ourFather.doxology']));
    blocks.push(S('ro-ourfather-amen', section, 'response', 'reader', 'Amen.'));

    // Lord, have mercy ×12
    blocks.push(S('ro-lhm12', section, 'response', 'reader', 'Lord, have mercy. (×12)'));

    // Glory/Now
    blocks.push(S('ro-glorynow1', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));

    // Come, let us worship
    blocks.push(S('ro-comeletusworship', section, 'prayer', 'reader',
      'Come, let us worship God our King.\nCome, let us worship and fall down before Christ, our King and our God.\nCome, let us worship and fall down before Christ Himself, our King and our God.'));

    // Psalms 19 and 20
    for (const n of [19, 20]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`ro-ps${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
      }
    }

    // Trisagion prayers again
    blocks.push(S('ro-glorynow2', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('ro-trisagion2', section, 'prayer', 'reader',
      vf.prayers.trisagion +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.' +
      '\n\n' + vf.prayers.mostHolyTrinity +
      '\n\nLord, have mercy. (×3)' +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('ro-ourfather2', section, 'prayer', 'reader', vf.prayers.ourFather));
    blocks.push(S('ro-ourfather2-excl', section, 'prayer', 'priest', vf.prayers['ourFather.doxology']));
    blocks.push(S('ro-ourfather2-amen', section, 'response', 'reader', 'Amen.'));

    // Royal Office troparia
    const rot = mf.royalOffice.troparia;
    blocks.push(S('ro-trop1', section, 'prayer', 'reader', rot[0].text));
    blocks.push(S('ro-trop-glory', section, 'doxology', null, 'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('ro-trop2', section, 'prayer', 'reader', rot[1].text));
    blocks.push(S('ro-trop-now', section, 'doxology', null, 'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('ro-trop3', section, 'prayer', 'reader', rot[2].text));

    // Fervent Litany (augmented)
    const aug = vf.litanies.augmented;
    blocks.push(S('ro-fervent-opening', section, 'prayer', 'priest',
      'Have mercy on us, O God, according to Thy great goodness, we pray Thee, hearken and have mercy.'));
    blocks.push(S('ro-fervent-response', section, 'response', 'choir', 'Lord, have mercy. (×3)'));
    blocks.push(S('ro-fervent-pet1', section, 'prayer', 'priest',
      'Again we pray for our Metropolitan N., and for our Bishop [or Archbishop] N.R.'));
    blocks.push(S('ro-fervent-pet2', section, 'prayer', 'priest',
      'Again we pray for this country, its President, for all civil authorities, and for the armed forces.'));
    blocks.push(S('ro-fervent-pet3', section, 'prayer', 'priest',
      'Again we pray for our brethren and for all Christians.'));
    blocks.push(S('ro-fervent-excl', section, 'prayer', 'priest', aug.exclamation));
    blocks.push(S('ro-fervent-amen', section, 'response', 'choir', 'Amen.'));

    // Transition
    blocks.push(S('ro-transition', section, 'response', 'choir',
      'Amen. In the Name of the Lord, Father, bless.'));
    blocks.push(S('ro-trinity', section, 'prayer', 'priest', mf.royalOffice.trinityGlory));
    blocks.push(S('ro-trinity-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Six Psalms ─────────────────────────────────────────────────────────────
  {
    const section = 'Six Psalms';
    blocks.push(S('6ps-intro', section, 'rubric', 'reader', f.sixPsalms.intro));

    const andAgain = mf.sixPsalms.andAgain || {};

    // First group: Psalms 3, 37, 62
    for (const n of [3, 37, 62]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    blocks.push(S('6ps-mid-glory', section, 'doxology', 'reader', f.sixPsalms.midGlory));

    // Second group: Psalms 87, 102, 142
    for (const n of [87, 102, 142]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    // Closing of Six Psalms
    blocks.push(S('6ps-closing', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.\n\nAlleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'));
  }

  // ── Great Litany (full) ───────────────────────────────────────────────────
  {
    const section = 'Great Litany';
    const gl = vf.litanies.great;
    blocks.push(S('gl-opening', section, 'prayer', 'deacon', gl.opening));
    blocks.push(S('gl-response', section, 'response', 'choir', gl.response));
    for (let i = 0; i < gl.petitions.length; i++) {
      blocks.push(S(`gl-pet-${i}`, section, 'prayer', 'deacon', gl.petitions[i]));
    }
    blocks.push(S('gl-commemoration', section, 'prayer', 'deacon', gl.commemoration));
    blocks.push(S('gl-commem-resp', section, 'response', 'choir', gl.commemorationResponse));
    blocks.push(S('gl-exclamation', section, 'prayer', 'priest', gl.exclamation));
    blocks.push(S('gl-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Alleluia ──────────────────────────────────────────────────────────────
  {
    const section = 'Alleluia';
    blocks.push(S('alleluia-announce', section, 'prayer', 'deacon',
      `In the eighth tone: Alleluia, alleluia, alleluia.`));
    blocks.push(S('alleluia-v0', section, 'verse', 'deacon', `V. ${f.alleluia.verses[0]}`));
    blocks.push(S('alleluia-rep0', section, 'hymn', 'choir',
      'Alleluia, alleluia, alleluia.', { tone: f.alleluia.tone }));
    for (let i = 1; i < f.alleluia.verses.length; i++) {
      blocks.push(S(`alleluia-v${i}`, section, 'verse', 'deacon', `V. ${f.alleluia.verses[i]}`));
      blocks.push(S(`alleluia-rep${i}`, section, 'hymn', 'choir',
        'Alleluia, alleluia, alleluia.', { tone: f.alleluia.tone }));
    }
  }

  // ── Troparion (×2, Glory/Now, ×1) ──────────────────────────────────────────
  {
    const section = 'Troparion';
    // Holy Thursday has its own troparion; other nights use the shared Bridegroom troparion
    const trop = nightData.troparion || f.troparion;
    blocks.push(S('trop-1', section, 'hymn', 'choir', trop.text,
      { tone: trop.tone, label: trop.label }));
    blocks.push(S('trop-rubric', section, 'rubric', null, '(twice)'));
    blocks.push(S('trop-glory', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('trop-3', section, 'hymn', 'choir', trop.text,
      { tone: trop.tone }));
    blocks.push(S('trop-lhm3', section, 'response', null, 'Lord, have mercy. (×3)'));
    blocks.push(S('trop-small-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('trop-now', section, 'doxology', 'reader',
      'Now and ever and unto ages of ages. Amen.'));
  }

  // ── Kathisma Readings + Sessional Hymns + Little Litanies ────────────────
  {
    const kaths = nightData.kathismata;
    const ll = mf.littleLitany;
    const excKeys = ['afterKathisma1', 'afterKathisma2', 'afterOde3'];
    if (kaths && kaths.length) {
      for (let i = 0; i < kaths.length; i++) {
        const k = kaths[i];
        const section = 'Kathisma Reading';

        // Full kathisma reading (may be abbreviated or omitted per local practice)
        blocks.push(S(`kathisma-note-${i}`, section, 'rubric', null,
          `Note: The kathisma reading may be abbreviated or omitted at the discretion of the rector.`));
        blocks.push(...assembleKathismaReading(k.afterKathisma, section));

        // Post-kathisma prayers
        blocks.push(S(`kathisma-alleluia-${i}`, section, 'response', null,
          'Alleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'));
        blocks.push(S(`kathisma-lhm-${i}`, section, 'response', null,
          'Lord, have mercy. (×3)'));

        // Sessional hymn
        const hymSection = 'Sessional Hymn';
        blocks.push(S(`kathisma-label-${i}`, hymSection, 'rubric', null,
          `Kathisma Hymn, Tone ${k.tone}`));
        blocks.push(S(`kathisma-hymn-${i}`, hymSection, 'hymn', 'choir', k.text,
          { tone: k.tone }));

        // Glory/Now + repeat rubric (for 1st kathisma)
        if (i === 0) {
          blocks.push(S(`kathisma-gnrepeat-${i}`, hymSection, 'doxology', null,
            'Glory to the Father and to the Son and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
          blocks.push(S(`kathisma-hymn-rep-${i}`, hymSection, 'rubric', 'choir',
            `${k.text.substring(0, 40)}…`));
        } else {
          blocks.push(S(`kathisma-gn-${i}`, hymSection, 'doxology', null,
            'Glory… now and ever…'));
          blocks.push(S(`kathisma-hymn-rep-${i}`, hymSection, 'rubric', 'choir',
            `${k.text.substring(0, 40)}…`));
        }

        blocks.push(S(`kathisma-lhm2-${i}`, hymSection, 'response', null,
          'Lord, have mercy. (×3)'));
        blocks.push(S(`kathisma-glory2-${i}`, hymSection, 'doxology', null,
          'Glory to the Father and to the Son and to the Holy Spirit.'));
        blocks.push(S(`kathisma-now-${i}`, hymSection, 'doxology', 'reader',
          'Now and ever, and unto ages of ages. Amen.'));
      }
    }
  }

  // ── Gospel ────────────────────────────────────────────────────────────────
  if (nightData.gospel) {
    const section = 'Gospel';

    // Pre-Gospel dialogue
    blocks.push(S('gospel-prayer', section, 'prayer', 'deacon',
      'And that we may be accounted worthy of hearing the holy Gospel, let us pray to the Lord God.'));
    blocks.push(S('gospel-lhm', section, 'response', 'choir', 'Lord, have mercy. (×3)'));
    blocks.push(S('gospel-wisdom', section, 'prayer', 'deacon',
      'Wisdom. Stand upright. Let us hear the holy Gospel.'));
    blocks.push(S('gospel-peace', section, 'prayer', 'priest', 'Peace be unto all.'));
    blocks.push(S('gospel-spirit', section, 'response', 'choir', 'And to thy spirit.'));
    blocks.push(S('gospel-announce', section, 'prayer', 'priest',
      `The reading from the holy Gospel according to ${nightData.gospel.reference.split(' ')[0]}.`));
    blocks.push(S('gospel-glory', section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'));
    blocks.push(S('gospel-attend', section, 'prayer', 'deacon', 'Let us attend.'));

    // Gospel reference
    blocks.push(S('gospel-reading', section, 'rubric', 'priest',
      `${nightData.gospel.reference}, Pericope${nightData.gospel.pericope ? ' ' + nightData.gospel.pericope : ''}`));

    // Post-Gospel
    blocks.push(S('gospel-post-glory', section, 'response', 'choir',
      'Glory to Thee, O Lord, glory to Thee.'));
  }

  // ── Psalm 50 ──────────────────────────────────────────────────────────────
  {
    const ps50 = psalter['50'];
    if (ps50) {
      blocks.push(S('ps50', 'Psalm 50', 'prayer', 'reader', psalmBody(ps50).join('\n')));
    }
  }

  // ── Priest's Prayer (Save, O God, Thy people) ────────────────────────────
  {
    const section = 'Priest\'s Prayer';
    blocks.push(S('priest-prayer', section, 'prayer', 'priest', mf.postGospel.petition));
    blocks.push(S('priest-prayer-lhm', section, 'response', 'choir', 'Lord, have mercy. (×12)'));
    blocks.push(S('priest-prayer-excl', section, 'prayer', 'priest', mf.postGospel.petitionExclamation));
    blocks.push(S('priest-prayer-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Canon ────────────────────────────────────────────────────────────────
  // Kontakion/Ikos/Synaxarion are emitted after the last ode ≤ 6
  // (normally after Ode 6; for abbreviated canons like Holy Wed odes 3,8,9 → after Ode 3)
  {
    const canon = nightData.canon;
    const section = 'Canon';
    let kontakionEmitted = false;

    // Find the ode after which to place kontakion (highest ode ≤ 6)
    const kontakionAfterOde = canon && canon.odes
      ? canon.odes.filter(n => n <= 6).pop() || canon.odes[0]
      : null;

    if (canon && canon.odes) {
      for (const odeNum of canon.odes) {
        const odeKey = `ode${odeNum}`;
        const odeData = canon[odeKey];

        if (odeData) {
          // Ode heading
          blocks.push(S(`canon-ode${odeNum}-heading`, section, 'rubric', null,
            `Ode ${odeNum}, Irmos, Tone ${canon.tone}`));

          // Irmos
          blocks.push(S(`canon-ode${odeNum}-irmos`, section, 'hymn', 'choir', odeData.irmos,
            { tone: canon.tone }));

          // Troparia
          if (odeData.troparia) {
            for (let t = 0; t < odeData.troparia.length; t++) {
              blocks.push(S(`canon-ode${odeNum}-refrain-${t}`, section, 'verse', 'reader',
                odeData.refrain || 'Glory to Thee, our God, glory to Thee.'));
              blocks.push(S(`canon-ode${odeNum}-trop-${t}`, section, 'hymn', 'reader',
                odeData.troparia[t]));
            }
          }

          // Glory/Now before katavasia
          if (odeData.glorySuffix) {
            blocks.push(S(`canon-ode${odeNum}-glory`, section, 'doxology', 'reader',
              odeData.glorySuffix));
          }
          if (odeData.nowSuffix) {
            blocks.push(S(`canon-ode${odeNum}-now`, section, 'doxology', 'reader',
              odeData.nowSuffix));
          }

          // Theotokion (final troparion after Glory/Now, before katavasia)
          if (odeData.theotokion) {
            blocks.push(S(`canon-ode${odeNum}-theotokion`, section, 'hymn', 'reader',
              odeData.theotokion));
          }

          // Katavasia
          if (odeData.katavasia) {
            blocks.push(S(`canon-ode${odeNum}-katavasia-label`, section, 'rubric', null,
              `Katavasia, Tone ${canon.tone}`));
            blocks.push(S(`canon-ode${odeNum}-katavasia`, section, 'hymn', 'choir',
              odeData.katavasia, { tone: canon.tone }));
          }

          // Sessional hymns after Ode 3 (Holy Thursday)
          if (odeNum === 3 && canon.sessionalHymns) {
            for (let sh = 0; sh < canon.sessionalHymns.length; sh++) {
              const sess = canon.sessionalHymns[sh];
              if (sh === 0) {
                // no doxology prefix before first
              } else if (sh === 1) {
                blocks.push(S('canon-sess-glory', 'Sessional Hymn', 'doxology', null,
                  'Glory to the Father, and to the Son, and to the Holy Spirit;'));
              } else {
                blocks.push(S('canon-sess-now', 'Sessional Hymn', 'doxology', null,
                  'now and ever, and unto ages of ages. Amen.'));
              }
              blocks.push(S(`canon-sess-label-${sh}`, 'Sessional Hymn', 'rubric', null,
                `Kathisma Hymn, Tone ${sess.tone}`));
              blocks.push(S(`canon-sess-${sh}`, 'Sessional Hymn', 'hymn', 'choir',
                sess.text, { tone: sess.tone }));
            }
          }

          // Kontakion/Ikos/Synaxarion after the last ode ≤ 6
          if (odeNum === kontakionAfterOde && !kontakionEmitted) {
            kontakionEmitted = true;
            _emitLittleLitany(blocks, S, 'Little Litany', mf.littleLitany, 'afterOde6');
            blocks.push(S('kontakion', 'Kontakion', 'hymn', 'choir', nightData.kontakion.text,
              { tone: nightData.kontakion.tone, label: `Kontakion, Tone ${nightData.kontakion.tone}` }));
            blocks.push(S('ikos', 'Kontakion', 'hymn', 'reader', nightData.ikos.text,
              { label: 'Ikos' }));
            if (nightData.synaxarion) {
              blocks.push(S('synaxarion-heading', 'Synaxarion', 'rubric', null, 'Synaxarion'));
              blocks.push(S('synaxarion', 'Synaxarion', 'prayer', 'reader', nightData.synaxarion.text));
            }
          }
        } else {
          // Rubric placeholder for odes without full data
          blocks.push(S(`canon-ode${odeNum}-rubric`, section, 'rubric', null,
            `[Ode ${odeNum}, Tone ${canon.tone}: troparia and katavasia.]`));
        }
      }
    }
  }

  // ── Little Litany (after Canon) ──────────────────────────────────────────
  _emitLittleLitany(blocks, S, 'Little Litany', mf.littleLitany, 'afterOde9');

  // ── Exaposteilarion (×2, Glory/Now, ×1) ──────────────────────────────────
  {
    const section = 'Exaposteilarion';
    blocks.push(S('exapost-0', section, 'hymn', 'choir', f.exaposteilarion.text,
      { tone: f.exaposteilarion.tone, label: `${f.exaposteilarion.label}, Tone ${f.exaposteilarion.tone}` }));
    blocks.push(S('exapost-rubric', section, 'rubric', null, '(twice)'));
    blocks.push(S('exapost-glory', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('exapost-2', section, 'hymn', 'choir', f.exaposteilarion.text,
      { tone: f.exaposteilarion.tone }));
  }

  // ── The Praises (Psalms 148-150 + Stichera) ──────────────────────────────
  {
    const section = 'The Praises';

    // Psalms 148, 149, 150
    for (const n of [148, 149, 150]) {
      const ps = psalter[String(n)];
      if (ps) {
        blocks.push(S(`praises-ps${n}`, section, 'prayer', 'reader', ps.verses.join('\n'),
          { label: `Psalm ${n}` }));
      }
    }

    // Lauds stichera interspersed with Psalm 150 verses
    const lauds = nightData.stichera;
    let lastNonRepeatText = null;
    let lastNonRepeatTone = null;
    for (let i = 0; i < lauds.hymns.length; i++) {
      const h = lauds.hymns[i];
      // Tone heading for first sticheron or tone change
      if (i === 0) {
        blocks.push(S('praises-tone-heading', section, 'rubric', null,
          `Tone ${h.tone}`));
      }
      blocks.push(S(`praises-verse-${i}`, section, 'verse', 'reader', `V. ${h.verse}`));
      const text = h.repeat ? lastNonRepeatText : h.text;
      const tone = h.repeat ? lastNonRepeatTone : h.tone;
      blocks.push(S(`praises-hymn-${i}`, section, 'hymn', 'choir', text,
        { tone }));
      if (!h.repeat) {
        lastNonRepeatText = h.text;
        lastNonRepeatTone = h.tone;
      }
    }

    // Glory/Now
    if (lauds.gloryNow) {
      blocks.push(S('praises-glorynow', section, 'doxology', 'reader',
        `In the ${_toneWord(lauds.gloryNow.tone)} tone. Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.`));
      blocks.push(S('praises-glorynow-hymn', section, 'hymn', 'choir', lauds.gloryNow.text,
        { tone: lauds.gloryNow.tone, label: lauds.gloryNow.label || null }));
    } else {
      blocks.push(S('praises-glory', section, 'doxology', null,
        'Glory to the Father, and to the Son, and to the Holy Spirit.'));
      blocks.push(S('praises-glory-hymn', section, 'hymn', 'choir', lauds.glory.text,
        { tone: lauds.glory.tone, label: lauds.glory.label || null }));
      blocks.push(S('praises-now', section, 'doxology', null,
        'Now and ever and unto ages of ages. Amen.'));
      blocks.push(S('praises-now-hymn', section, 'hymn', 'choir', lauds.now.text,
        { tone: lauds.now.tone }));
    }
  }

  // ── Priest Exclamation + "Glory to Thee Who hast shown us the light" ─────
  blocks.push(S('dox-excl', 'Great Doxology', 'prayer', 'priest',
    'To Thee is due glory, O Lord our God, and unto Thee do we send up glory: to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages.'));
  blocks.push(S('dox-amen', 'Great Doxology', 'response', 'reader', 'Amen.'));
  blocks.push(S('dox-shown-light', 'Great Doxology', 'prayer', 'priest',
    'Glory to Thee Who hast shown us the light.'));

  // ── Great Doxology (read) ─────────────────────────────────────────────────
  blocks.push(S('great-doxology', 'Great Doxology', 'prayer', 'reader',
    f.greatDoxology.text));

  // ── Morning Litany (Supplication) ─────────────────────────────────────────
  {
    const section = 'Morning Litany';
    const ml = mf.litanies.morning;
    blocks.push(S('ml-opening', section, 'prayer', 'deacon', ml.opening));
    blocks.push(S('ml-response', section, 'response', 'choir', ml.response));
    blocks.push(S('ml-petition1', section, 'prayer', 'deacon', ml.petition1));
    blocks.push(S('ml-response2', section, 'response', 'choir', ml.response));
    for (let i = 0; i < ml.petitions.length; i++) {
      blocks.push(S(`ml-pet-${i}`, section, 'prayer', 'deacon', ml.petitions[i]));
    }
    blocks.push(S('ml-commemoration', section, 'prayer', 'deacon', ml.commemoration));
    blocks.push(S('ml-commem-resp', section, 'response', 'choir', ml.commemorationResponse));
    blocks.push(S('ml-exclamation', section, 'prayer', 'priest', ml.exclamation));
    blocks.push(S('ml-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Bow-Head Prayer ──────────────────────────────────────────────────────
  {
    const section = 'Morning Litany';
    const bh = mf.prayers.bowHeadsMorning;
    blocks.push(S('bh-peace', section, 'prayer', 'priest', bh.dialogue.peace));
    blocks.push(S('bh-response', section, 'response', 'choir', bh.dialogue.response));
    blocks.push(S('bh-invite', section, 'prayer', 'deacon', bh.dialogue.invitation));
    blocks.push(S('bh-invite-resp', section, 'response', 'choir', bh.dialogue.invitationResponse));
    blocks.push(S('bh-prayer', section, 'prayer', 'priest', bh.prayer));
    blocks.push(S('bh-exclamation', section, 'prayer', 'priest', bh.exclamation));
    blocks.push(S('bh-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Aposticha ─────────────────────────────────────────────────────────────
  if (nightData.aposticha) {
    const section = 'Aposticha';
    const ap = nightData.aposticha;
    // Tone heading
    if (ap.hymns[0] && ap.hymns[0].tone) {
      blocks.push(S('aposticha-tone', section, 'rubric', null,
        `Aposticha, Tone ${ap.hymns[0].tone}`));
    }
    for (let i = 0; i < ap.hymns.length; i++) {
      const h = ap.hymns[i];
      if (h.verse) {
        blocks.push(S(`aposticha-verse-${i}`, section, 'verse', 'reader', `V. ${h.verse}`));
      }
      blocks.push(S(`aposticha-hymn-${i}`, section, 'hymn', 'choir', h.text,
        { tone: h.tone }));
    }
    if (ap.gloryNow) {
      blocks.push(S('aposticha-glorynow', section, 'doxology', 'reader',
        `In the ${_toneWord(ap.gloryNow.tone)} tone. Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.`));
      blocks.push(S('aposticha-glorynow-hymn', section, 'hymn', 'choir', ap.gloryNow.text,
        { tone: ap.gloryNow.tone, label: ap.gloryNow.label || null }));
    }
  }

  // ── Closing Prayers ──────────────────────────────────────────────────────
  {
    const section = 'Closing Prayers';
    // "It is good to give thanks"
    blocks.push(S('close-itisgood', section, 'prayer', 'reader',
      mf.itIsGood.text + ' (×2)'));

    // Trisagion prayers
    blocks.push(S('close-trisagion', section, 'prayer', 'reader',
      vf.prayers.trisagion +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.' +
      '\n\n' + vf.prayers.mostHolyTrinity +
      '\n\nLord, have mercy. (×3)' +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('close-ourfather', section, 'prayer', 'reader', vf.prayers.ourFather));
    blocks.push(S('close-ourfather-excl', section, 'prayer', 'priest', vf.prayers['ourFather.doxology']));

    // Standing in the temple + LHM 40
    blocks.push(S('close-standing', section, 'prayer', 'reader',
      'Amen. ' + f.closingPrayers.standingInTheTemple));
    blocks.push(S('close-lhm40', section, 'response', null, 'Lord, have mercy. (×40)'));

    // Glory/Now + More honorable
    blocks.push(S('close-glorynow', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('close-morehon', section, 'prayer', null, f.closingPrayers.moreHonorable));

    // In the Name of the Lord, Father bless
    blocks.push(S('close-bless', section, 'response', null, 'In the Name of the Lord, Father, bless.'));
    blocks.push(S('close-blessed', section, 'prayer', 'priest',
      'Blessed be He Who Is, Christ our God, always, now and ever and unto ages of ages.'));

    // O heavenly King (closing version)
    blocks.push(S('close-heavenlyking', section, 'prayer', 'reader',
      'Amen. ' + f.closingPrayers.oHeavenlyKingClosing));
  }

  // ── Prayer of St. Ephrem ──────────────────────────────────────────────────
  {
    const section = 'Prayer of St. Ephrem';
    const eph = require('./fixed-texts/presanctified-fixed.json')['prayer-of-st-ephrem'];
    blocks.push(S('ephrem', section, 'prayer', 'priest', eph.text));
    blocks.push(S('ephrem-rubric1', section, 'rubric', null,
      'Prostration after each of the three petitions.'));
    blocks.push(S('ephrem-bows', section, 'rubric', null,
      'And we make twelve bows from the waist, quietly saying "O God, cleanse me a sinner" each time.'));
    blocks.push(S('ephrem-full', section, 'prayer', 'priest',
      eph.text.replace(/\n\n/g, ' ')));
    blocks.push(S('ephrem-rubric2', section, 'rubric', null, '(prostration)'));
  }

  // ── Dismissal ─────────────────────────────────────────────────────────────
  {
    const section = 'Dismissal';
    blocks.push(S('dismissal-preglory', section, 'prayer', 'priest', f.dismissal.preGlory));
    blocks.push(S('dismissal-glory', section, 'doxology', 'choir', f.dismissal.glory));
    blocks.push(S('dismissal-lhm3', section, 'response', null, f.dismissal.lordHaveMercy3));
    blocks.push(S('dismissal-bless', section, 'response', null, f.dismissal.fatherBless));
    blocks.push(S('dismissal', section, 'prayer', 'priest', f.dismissal[night]));
    blocks.push(S('dismissal-amen', section, 'response', 'choir', f.dismissal.response));
  }

  blocks._warnings = _warnings.slice();
  return blocks;
}

/** Emit a standard Little Litany */
function _emitLittleLitany(blocks, S, section, ll, excKey) {
  blocks.push(S(`ll-${excKey}-opening`, section, 'prayer', 'deacon', ll.opening));
  blocks.push(S(`ll-${excKey}-response`, section, 'response', 'choir', ll.response));
  blocks.push(S(`ll-${excKey}-petition`, section, 'prayer', 'deacon', ll.petition));
  blocks.push(S(`ll-${excKey}-commem`, section, 'prayer', 'deacon', ll.commemoration));
  blocks.push(S(`ll-${excKey}-commem-resp`, section, 'response', 'choir', ll.commemorationResponse));
  const exc = ll.exclamations[excKey] || ll.exclamations.afterKathisma1;
  blocks.push(S(`ll-${excKey}-excl`, section, 'prayer', 'priest', exc));
  blocks.push(S(`ll-${excKey}-amen`, section, 'response', 'choir', 'Amen.'));
}

/** Convert tone number to ordinal word */
function _toneWord(n) {
  const words = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  return words[n] || String(n);
}

/** Convert number to ordinal (e.g. 9 → "9th") */
function _ordinal(n) {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v-20)%10] || s[v] || s[0]);
}

// ─── Matins of Great Friday — The Twelve Passion Gospels ─────────────────────

/**
 * Assembles the Service of the Twelve Passion Gospels (Matins of Great Friday).
 * Served on the evening of Great Thursday. 100% fixed content.
 *
 * Structure:
 *   Opening (Royal Office prayers) → Six Psalms → Great Litany →
 *   Alleluia + Troparion → Gospel 1 →
 *   Antiphons 1–3 + Sessional + Gospel 2 → Antiphons 4–6 + Sessional + Gospel 3 →
 *   Antiphons 7–9 + Sessional + Gospel 4 → Antiphons 10–12 + Sessional + Gospel 5 →
 *   Antiphons 13–15 + Sessional + Gospel 6 → Beatitudes → Little Litany →
 *   Prokeimenon + Gospel 7 → Psalm 50 + Gospel 8 → Canon (abbreviated) →
 *   Gospel 9 → Lauds → Gospel 10 → Small Doxology → Bow-Head Prayer →
 *   Gospel 11 → Aposticha → Gospel 12 →
 *   Closing Prayers → Closing Troparion → Fervent Supplication → Dismissal
 *
 * @param {Object} f - Parsed fixed-texts/passion-gospels-fixed.json
 * @returns {ServiceBlock[]}
 */
function assemblePassionGospels(f) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  const vf = getVespersFixed();
  const mf = getMatinsFixed();
  const psalter = getPsalter();

  const preGospelResp = f.preGospelResponse || 'Glory to Thy passion, O Lord.';
  const postGospelResp = f.postGospelResponse || 'Glory to Thy longsuffering, O Lord.';

  // ── Opening (Royal Office) ────────────────────────────────────────────────
  {
    const section = 'Opening';
    blocks.push(S('opening-excl', section, 'prayer', 'priest', f.opening.exclamation));
    blocks.push(S('opening-amen', section, 'response', 'reader', f.opening.amen));

    // Opening prayers: Glory to Thee, O Heavenly King, Trisagion through Our Father
    blocks.push(S('opening-glorytothee', section, 'prayer', 'reader',
      'Glory to Thee, our God, glory to Thee.'));
    blocks.push(S('opening-heavenlyking', section, 'prayer', 'reader', vf.prayers.heavenlyKing));
    blocks.push(S('opening-trisagion', section, 'prayer', 'reader',
      vf.prayers.trisagion +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.' +
      '\n\n' + vf.prayers.mostHolyTrinity +
      '\n\nLord, have mercy. (×3)' +
      '\n\nGlory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('opening-ourfather', section, 'prayer', 'reader', vf.prayers.ourFather));
    blocks.push(S('opening-ourfather-excl', section, 'prayer', 'priest', vf.prayers['ourFather.doxology']));
    blocks.push(S('opening-ourfather-amen', section, 'response', 'reader', 'Amen.'));

    // Lord, have mercy ×12
    blocks.push(S('opening-lhm12', section, 'response', 'reader', 'Lord, have mercy. (×12)'));

    // Glory/Now
    blocks.push(S('opening-glorynow', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));

    // Come, let us worship
    blocks.push(S('opening-comeletusworship', section, 'prayer', 'reader',
      'Come, let us worship God our King.\nCome, let us worship and fall down before Christ, our King and our God.\nCome, let us worship and fall down before Christ Himself, our King and our God.'));

    // Priest: Glory to the holy Trinity
    blocks.push(S('opening-trinity', section, 'prayer', 'priest',
      f.opening.trinityGlory || mf.royalOffice.trinityGlory));
    blocks.push(S('opening-trinity-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Six Psalms ────────────────────────────────────────────────────────────
  {
    const section = 'Six Psalms';
    blocks.push(S('6ps-intro', section, 'rubric', 'reader', mf.sixPsalms.intro));

    const andAgain = mf.sixPsalms.andAgain || {};

    for (const n of [3, 37, 62]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    blocks.push(S('6ps-mid-glory', section, 'doxology', 'reader', mf.sixPsalms.midGlory));

    for (const n of [87, 102, 142]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    blocks.push(S('6ps-closing', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.\n\nAlleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'));
  }

  // ── Great Litany ──────────────────────────────────────────────────────────
  {
    const section = 'Great Litany';
    const gl = vf.litanies.great;
    blocks.push(S('gl-opening', section, 'prayer', 'deacon', gl.opening));
    blocks.push(S('gl-response', section, 'response', 'choir', gl.response));
    for (let i = 0; i < gl.petitions.length; i++) {
      blocks.push(S(`gl-pet-${i}`, section, 'prayer', 'deacon', gl.petitions[i]));
    }
    blocks.push(S('gl-commemoration', section, 'prayer', 'deacon', gl.commemoration));
    blocks.push(S('gl-commem-resp', section, 'response', 'choir', gl.commemorationResponse));
    blocks.push(S('gl-exclamation', section, 'prayer', 'priest', gl.exclamation));
    blocks.push(S('gl-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Alleluia (instead of "God is the Lord" — fasting day) ──────────────────
  {
    const section = 'Alleluia';
    const a = f.alleluia || {};
    const tone = a.tone || 8;
    blocks.push(S('alleluia-announce', section, 'prayer', 'deacon',
      `In the eighth tone: Alleluia, alleluia, alleluia.`));
    blocks.push(S('alleluia-v0', section, 'verse', 'deacon', `V. ${a.verses[0]}`));
    blocks.push(S('alleluia-rep0', section, 'hymn', 'choir',
      'Alleluia, alleluia, alleluia.', { tone }));
    for (let i = 1; i < a.verses.length; i++) {
      blocks.push(S(`alleluia-v${i}`, section, 'verse', 'deacon', `V. ${a.verses[i]}`));
      blocks.push(S(`alleluia-rep${i}`, section, 'hymn', 'choir',
        'Alleluia, alleluia, alleluia.', { tone }));
    }
  }

  // ── Troparion ──────────────────────────────────────────────────────────────
  {
    const section = 'Troparion';
    blocks.push(S('trop-1', section, 'hymn', 'choir', f.troparion.text,
      { tone: f.troparion.tone, label: f.troparion.label }));
    blocks.push(S('trop-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('trop-2', section, 'hymn', 'choir', f.troparion.text,
      { tone: f.troparion.tone }));
    blocks.push(S('trop-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('trop-3', section, 'hymn', 'choir', f.troparion.text,
      { tone: f.troparion.tone }));
  }

  // ── Helper: render a Passion Gospel reading ────────────────────────────────
  function addGospel(gospel, extras) {
    const section = `Gospel ${gospel.number}`;
    // Pre-Gospel dialogue
    blocks.push(S(`gos-${gospel.number}-prayer`, section, 'rubric', 'deacon',
      'And that we may be accounted worthy of hearing the holy Gospel, let us pray to the Lord God.'));
    blocks.push(S(`gos-${gospel.number}-mercy`, section, 'response', 'choir',
      'Lord, have mercy. Lord, have mercy. Lord, have mercy.'));
    blocks.push(S(`gos-${gospel.number}-wisdom`, section, 'rubric', 'deacon',
      'Wisdom. Stand upright. Let us listen to the holy Gospel.'));
    blocks.push(S(`gos-${gospel.number}-peace`, section, 'rubric', 'priest',
      'Peace be unto all.'));
    blocks.push(S(`gos-${gospel.number}-spirit`, section, 'response', 'choir',
      'And to thy spirit.'));
    blocks.push(S(`gos-${gospel.number}-announce`, section, 'rubric', 'priest',
      `The reading from the holy Gospel according to ${gospel.book}.`));
    blocks.push(S(`gos-${gospel.number}-glory`, section, 'response', 'choir',
      preGospelResp));
    blocks.push(S(`gos-${gospel.number}-attend`, section, 'rubric', 'deacon',
      'Let us attend.'));
    blocks.push(S(`gos-${gospel.number}-text`, section, 'prayer', 'reader',
      `[${gospel.book} ${gospel.pericope}]`, { label: gospel.label }));
    blocks.push(S(`gos-${gospel.number}-glory-end`, section, 'response', 'choir',
      postGospelResp));
    if (gospel.bellRings) {
      blocks.push(S(`gos-${gospel.number}-bell`, section, 'rubric', null,
        `A bell is rung ${gospel.bellRings === 1 ? 'once' : gospel.bellRings === 2 ? 'twice' : gospel.bellRings === 3 ? 'thrice' : gospel.bellRings + ' times'}.`));
    }
    // Priest's reading after certain gospels
    if (extras && extras.priestReading) {
      blocks.push(S(`gos-${gospel.number}-priest`, section, 'prayer', 'priest',
        extras.priestReading));
    }
  }

  // ── Helper: render a group of 3 antiphons ─────────────────────────────────
  function addAntiphonGroup(start, groupNum) {
    for (let i = start; i < start + 3 && i <= 15; i++) {
      const a = f.antiphons[i - 1];
      const section = `Antiphon ${a.number}`;
      // Support both old single-text and new troparia-array format
      if (a.troparia && Array.isArray(a.troparia)) {
        for (let t = 0; t < a.troparia.length; t++) {
          blocks.push(S(`ant-${i}-trop-${t}`, section, 'hymn', 'choir',
            a.troparia[t], t === 0 ? { tone: a.tone } : {}));
        }
      } else if (a.text) {
        blocks.push(S(`ant-${i}-text`, section, 'hymn', 'choir', a.text,
          { tone: a.tone }));
        if (a.verse) {
          blocks.push(S(`ant-${i}-verse`, section, 'verse', 'reader', a.verse));
        }
        if (a.troparion) {
          blocks.push(S(`ant-${i}-trop`, section, 'hymn', 'choir', a.troparion));
        }
      }
      // Additional troparia with their own tone (e.g. antiphon 4 Tone I troparion)
      if (a.additionalTroparia) {
        for (let j = 0; j < a.additionalTroparia.length; j++) {
          const at = a.additionalTroparia[j];
          blocks.push(S(`ant-${i}-addtrop-${j}`, section, 'hymn', 'choir',
            at.text || at, at.tone ? { tone: at.tone } : {}));
        }
      }
      if (a.additionalStichera) {
        for (let j = 0; j < a.additionalStichera.length; j++) {
          blocks.push(S(`ant-${i}-extra-${j}`, section, 'hymn', 'choir',
            a.additionalStichera[j]));
        }
      }
      if (a.glory) {
        blocks.push(S(`ant-${i}-glory-dox`, section, 'doxology', null,
          'Glory to the Father, and to the Son, and to the Holy Spirit.'));
        blocks.push(S(`ant-${i}-glory`, section, 'hymn', 'choir', a.glory));
      }
      if (a.theotokion && typeof a.theotokion === 'string' && !a.theotokion.endsWith('...')) {
        blocks.push(S(`ant-${i}-now-dox`, section, 'doxology', null,
          'Now and ever and unto ages of ages. Amen.'));
        blocks.push(S(`ant-${i}-theotokion`, section, 'hymn', 'choir', a.theotokion));
      }
      blocks.push(S(`ant-${i}-refrain`, section, 'response', 'choir', a.refrain));
    }
    // Sessional hymn after this antiphon group
    if (f.sessionalHymns) {
      const sh = f.sessionalHymns.find(h => h.afterAntiphonGroup === groupNum);
      if (sh) {
        blocks.push(S(`sess-${groupNum}`, `Sessional Hymn`, 'hymn', 'choir',
          sh.text, { tone: sh.tone }));
      }
    }
  }

  // ── Gospel 1 ───────────────────────────────────────────────────────────────
  addGospel(f.gospels[0]);

  // ── Antiphons 1–3 + Sessional Hymn + Gospel 2 ─────────────────────────────
  addAntiphonGroup(1, 1);
  addGospel(f.gospels[1]);

  // ── Antiphons 4–6 + Sessional Hymn + Gospel 3 ─────────────────────────────
  addAntiphonGroup(4, 2);
  addGospel(f.gospels[2]);

  // ── Antiphons 7–9 + Sessional Hymn + Gospel 4 ─────────────────────────────
  addAntiphonGroup(7, 3);
  addGospel(f.gospels[3]);

  // ── Antiphons 10–12 + Sessional Hymn + Gospel 5 ───────────────────────────
  addAntiphonGroup(10, 4);
  addGospel(f.gospels[4]);

  // ── Antiphons 13–15 + Sessional Hymn + Gospel 6 ───────────────────────────
  addAntiphonGroup(13, 5);
  addGospel(f.gospels[5]);

  // ── Beatitudes ────────────────────────────────────────────────────────────
  {
    const section = 'Beatitudes';
    const bt = f.beatitudes;
    blocks.push(S('beat-intro', section, 'rubric', 'reader',
      'In Thy Kingdom remember us, O Lord, when Thou comest into Thy Kingdom.'));
    for (let i = 0; i < bt.troparia.length; i++) {
      const t = bt.troparia[i];
      if (t.label) {
        blocks.push(S(`beat-label-${i}`, section, 'doxology', null, t.label));
      }
      if (t.verse) {
        blocks.push(S(`beat-verse-${i}`, section, 'verse', 'reader', t.verse));
      }
      if (t.text) {
        blocks.push(S(`beat-trop-${i}`, section, 'hymn', 'choir', t.text,
          { tone: bt.tone }));
      }
    }
  }

  // ── Little Litany + Prokeimenon ────────────────────────────────────────────
  _emitLittleLitany(blocks, S, 'Little Litany', mf.littleLitany, 'afterOde9');
  if (f.prokeimenon) {
    const section = 'Prokeimenon';
    blocks.push(S('prok-announce', section, 'rubric', 'deacon',
      `The prokeimenon in the ${['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][f.prokeimenon.tone] || f.prokeimenon.tone} tone: ${f.prokeimenon.text}`));
    blocks.push(S('prok-choir', section, 'hymn', 'choir', f.prokeimenon.text,
      { tone: f.prokeimenon.tone }));
    blocks.push(S('prok-verse', section, 'verse', 'deacon', f.prokeimenon.verse));
    blocks.push(S('prok-choir-2', section, 'hymn', 'choir', f.prokeimenon.text,
      { tone: f.prokeimenon.tone }));
  }

  // ── Gospel 7 ──────────────────────────────────────────────────────────────
  addGospel(f.gospels[6]);

  // ── Psalm 50 ──────────────────────────────────────────────────────────────
  {
    const psalter = getPsalter();
    const ps50 = psalter['50'];
    if (ps50) {
      blocks.push(S('ps50', 'Psalm 50', 'prayer', 'reader',
        ps50.verses.join('\n')));
    }
  }

  // ── Gospel 8 ──────────────────────────────────────────────────────────────
  addGospel(f.gospels[7]);

  // ── Canon (Odes 5, 8, 9 with troparia; Kontakion/Ikos after Ode 5) ──────
  if (f.canon) {
    const section = 'Canon';
    const canonTone = f.canon.tone;
    for (const odeKey of ['ode5', 'ode8', 'ode9']) {
      const ode = f.canon[odeKey];
      if (!ode) continue;
      const odeLabel = odeKey === 'ode5' ? 'Fifth Ode' : odeKey === 'ode8' ? 'Eighth Ode' : 'Ninth Ode';
      blocks.push(S(`canon-${odeKey}-label`, section, 'rubric', null,
        `${odeLabel}, Tone ${canonTone}`));
      blocks.push(S(`canon-${odeKey}`, section, 'hymn', 'choir', ode.irmos,
        { tone: canonTone, label: 'Irmos' }));
      // Troparia
      if (ode.troparia) {
        for (let t = 0; t < ode.troparia.length; t++) {
          blocks.push(S(`canon-${odeKey}-ref-${t}`, section, 'verse', 'reader',
            ode.refrain || 'Glory to Thee our God, glory to Thee.'));
          blocks.push(S(`canon-${odeKey}-trop-${t}`, section, 'hymn', 'reader',
            ode.troparia[t]));
        }
      }
      // Glory/Now troparion
      if (ode.glory) {
        blocks.push(S(`canon-${odeKey}-glory-dox`, section, 'doxology', null,
          'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
        blocks.push(S(`canon-${odeKey}-glory`, section, 'hymn', 'reader', ode.glory));
      }
      // Katavasia (irmos repeated)
      const katKey = `katavasia${odeKey.slice(3)}`;
      if (f.canon[katKey]) {
        blocks.push(S(`canon-${odeKey}-katavasia-label`, section, 'rubric', null, 'Katavasia'));
        blocks.push(S(`canon-${odeKey}-katavasia`, section, 'hymn', 'choir',
          ode.irmos, { tone: canonTone }));
      }
      // Kontakion/Ikos/Synaxarion after Ode 5
      if (odeKey === 'ode5') {
        // Small Litany
        blocks.push(S('canon-ll5', section, 'rubric', null, 'Small Litany'));
        blocks.push(S('kontakion', section, 'hymn', 'choir', f.kontakion.text,
          { tone: f.kontakion.tone, label: `Kontakion, Tone ${f.kontakion.tone}` }));
        blocks.push(S('ikos', section, 'hymn', 'reader', f.ikos.text, { label: 'Ikos' }));
      }
    }
    // Small Litany after Ode 9
    blocks.push(S('canon-ll9', section, 'rubric', null, 'Small Litany'));
  }

  // ── Gospel 9 ──────────────────────────────────────────────────────────────
  addGospel(f.gospels[8]);

  // ── Lauds (The Praises) — after Gospel 9 ──────────────────────────────────
  {
    const section = 'Lauds';
    let lastNonRepeatText = null;
    let lastNonRepeatTone = null;
    for (let i = 0; i < f.lauds.stichera.length; i++) {
      const s = f.lauds.stichera[i];
      blocks.push(S(`lauds-verse-${i}`, section, 'verse', 'reader', `V. ${s.verse}`));
      const text = s.repeat ? lastNonRepeatText : s.text;
      const tone = s.repeat ? lastNonRepeatTone : s.tone;
      blocks.push(S(`lauds-hymn-${i}`, section, 'hymn', 'choir', text,
        { tone }));
      if (!s.repeat) {
        lastNonRepeatText = s.text;
        lastNonRepeatTone = s.tone;
      }
    }
    blocks.push(S('lauds-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('lauds-glory-hymn', section, 'hymn', 'choir', f.lauds.glory.text,
      { tone: f.lauds.glory.tone }));
    blocks.push(S('lauds-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('lauds-now-hymn', section, 'hymn', 'choir', f.lauds.now.text,
      { tone: f.lauds.now.tone }));
  }

  // ── Gospel 10 ─────────────────────────────────────────────────────────────
  addGospel(f.gospels[9]);

  // ── Small Doxology (read, not sung) ───────────────────────────────────────
  {
    const section = 'Small Doxology';
    blocks.push(S('small-dox-label', section, 'rubric', null,
      'The Small Doxology is read.'));
    blocks.push(S('small-dox', section, 'prayer', 'reader',
      'Glory to God in the highest, and on earth peace, good will towards men.\n\n' +
      'We praise Thee, we bless Thee, we worship Thee, we glorify Thee, we give thanks to Thee for Thy great glory.\n\n' +
      'O Lord God, heavenly King, God the Father Almighty; O Lord, the only-begotten Son, Jesus Christ; and O Holy Spirit.\n\n' +
      'O Lord God, Lamb of God, Son of the Father, that takest away the sin of the world, have mercy on us; Thou that takest away the sins of the world, receive our prayer; Thou that sittest at the right hand of the Father, have mercy on us.\n\n' +
      'For Thou only art holy, Thou only art the Lord, Jesus Christ, to the glory of God the Father. Amen.\n\n' +
      'Every day will I bless Thee, and I will praise Thy Name forever and ever.\n\n' +
      'Lord, Thou hast been our refuge from generation to generation. I said, Lord, be merciful to me and heal my soul, for I have sinned against Thee. Lord, I have fled unto Thee; teach me to do Thy will, for Thou art my God. For with Thee is the fountain of life, and in Thy light shall we see light. O continue Thy mercy upon them that know Thee.\n\n' +
      'Vouchsafe, O Lord, to keep us this day without sin. Blessed art Thou, O Lord, the God of our fathers, and praised and glorified is Thy Name forever. Amen. Let Thy mercy, O Lord, be upon us, as we have set our hope on Thee. Blessed art Thou, O Lord: teach me Thy statutes. Blessed art Thou, O Master: make me to understand Thy statutes. Blessed art Thou, O Holy One: enlighten me with Thy statutes.\n\n' +
      'Thy mercy, O Lord, endureth forever. O despise not the works of Thy hands. To Thee is due praise; to Thee is due a song; to Thee is due glory: to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen.'));
  }

  // ── Bow-Head Prayer (after Small Doxology) ─────────────────────────────────
  {
    const section = 'Bow-Head Prayer';
    const bh = mf.prayers.bowHeadsMorning;
    blocks.push(S('bh-peace', section, 'prayer', 'priest', bh.dialogue.peace));
    blocks.push(S('bh-response', section, 'response', 'choir', bh.dialogue.response));
    blocks.push(S('bh-invite', section, 'prayer', 'deacon', bh.dialogue.invitation));
    blocks.push(S('bh-invite-resp', section, 'response', 'choir', bh.dialogue.invitationResponse));
    blocks.push(S('bh-prayer', section, 'prayer', 'priest', bh.prayer));
    blocks.push(S('bh-exclamation', section, 'prayer', 'priest', bh.exclamation));
    blocks.push(S('bh-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Gospel 11 ─────────────────────────────────────────────────────────────
  addGospel(f.gospels[10], f.postGospel11Priest
    ? { priestReading: f.postGospel11Priest.text } : null);

  // ── Aposticha ─────────────────────────────────────────────────────────────
  if (f.aposticha) {
    const section = 'Aposticha';
    for (let i = 0; i < f.aposticha.stichera.length; i++) {
      const s = f.aposticha.stichera[i];
      if (s.verse) {
        blocks.push(S(`apost-verse-${i}`, section, 'verse', 'reader', `V. ${s.verse}`));
      }
      blocks.push(S(`apost-hymn-${i}`, section, 'hymn', 'choir', s.text,
        { tone: s.tone, label: s.theotokion ? 'Theotokion' : null }));
    }
    if (f.aposticha.glory) {
      blocks.push(S('apost-glory-dox', section, 'doxology', null,
        'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
      blocks.push(S('apost-glory', section, 'hymn', 'choir', f.aposticha.glory.text,
        { tone: f.aposticha.glory.tone }));
    }
  }

  // ── Gospel 12 ─────────────────────────────────────────────────────────────
  addGospel(f.gospels[11], f.postGospel12Priest
    ? { priestReading: f.postGospel12Priest.text } : null);

  // ── Trisagion + Our Father ────────────────────────────────────────────────
  {
    const section = 'Closing Prayers';
    blocks.push(S('closing-itagtt', section, 'prayer', 'reader',
      'It is a good thing to give thanks unto the Lord, and to sing unto Thy Name, O Most High; to tell of Thy mercy in the morning, and of Thy truth every night.'));
    blocks.push(S('closing-trisagion', section, 'prayer', 'reader',
      'Holy God, Holy Mighty, Holy Immortal: have mercy on us. (Thrice)'));
    blocks.push(S('closing-glory-now', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.'));
    blocks.push(S('closing-trinity', section, 'prayer', 'reader',
      'O most holy Trinity, have mercy on us. O Lord, cleanse us from our sins. O Master, pardon our transgressions. O Holy One, visit and heal our infirmities, for Thy Name\'s sake.'));
    blocks.push(S('closing-lordmercy', section, 'response', 'choir',
      'Lord, have mercy. (Thrice)'));
    blocks.push(S('closing-ourfather', section, 'prayer', 'reader',
      'Our Father, who art in heaven, hallowed be Thy Name. Thy kingdom come. Thy will be done, on earth as it is in heaven. Give us this day our daily bread; and forgive us our trespasses, as we forgive those who trespass against us; and lead us not into temptation, but deliver us from the evil one.'));
    blocks.push(S('closing-excl', section, 'prayer', 'priest',
      'For Thine is the kingdom, and the power, and the glory of the Father, and of the Son, and of the Holy Spirit, now and ever and unto ages of ages.'));
    blocks.push(S('closing-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Closing Troparion ─────────────────────────────────────────────────────
  blocks.push(S('closing-trop', 'Closing Troparion', 'hymn', 'choir',
    f.closingTroparion.text, { tone: f.closingTroparion.tone }));

  // ── Litany of Fervent Supplication ────────────────────────────────────────
  {
    const section = 'Litany of Fervent Supplication';
    const aug = vf.litanies.augmented;
    blocks.push(S('fervent-opening', section, 'prayer', 'deacon',
      'Have mercy on us, O God, according to Thy great goodness, we pray Thee, hearken and have mercy.'));
    blocks.push(S('fervent-resp', section, 'response', 'choir',
      'Lord, have mercy. (×3)'));
    for (let i = 0; i < aug.triplePetitions.length; i++) {
      blocks.push(S(`fervent-pet-${i}`, section, 'prayer', 'deacon', aug.triplePetitions[i]));
    }
    blocks.push(S('fervent-excl', section, 'prayer', 'priest', aug.exclamation));
    blocks.push(S('fervent-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── Dismissal ─────────────────────────────────────────────────────────────
  {
    const section = 'Dismissal';
    const md = mf.dismissal;
    blocks.push(S('dis-wisdom', section, 'rubric', 'deacon', md.wisdom));
    blocks.push(S('dis-bless', section, 'response', 'choir', md.bless));
    blocks.push(S('dis-blessed', section, 'prayer', 'priest', md.blessed));
    blocks.push(S('dis-confirm', section, 'response', 'choir', md.confirm));
    blocks.push(S('dis-theotokos', section, 'prayer', 'priest', md.theotokos));
    blocks.push(S('dis-morehon', section, 'hymn', 'choir', md.theotokosResponse));
    blocks.push(S('dis-glory', section, 'prayer', 'priest', md.glory));
    blocks.push(S('dis-final-glory', section, 'doxology', 'choir', md.finalGlory));
    blocks.push(S('dismissal', section, 'prayer', 'priest', f.dismissal.text));
    blocks.push(S('dismissal-amen', section, 'response', 'choir', f.dismissal.response));
  }

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Matins of Great Saturday — The Lamentations ─────────────────────────────

/**
 * Assembles the Lamentations service (Matins of Great and Holy Saturday).
 * Served on the evening of Great Friday. 100% fixed content.
 *
 * Structure:
 *   Opening → Six Psalms → God is the Lord + Troparia →
 *   Stasis 1 (Psalm 118 + troparia) → Small Litany →
 *   Stasis 2 → Small Litany → Stasis 3 → Small Litany →
 *   Evlogetaria → Psalm 50 → Canon (abbreviated) →
 *   Kontakion + Ikos → Exaposteilarion →
 *   Lauds → Great Doxology → Procession + Trisagion →
 *   Prophecy → Epistle → Gospel → Dismissal
 *
 * @param {Object} f - Parsed fixed-texts/lamentations-fixed.json
 * @returns {ServiceBlock[]}
 */
function assembleLamentations(f) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  // ── Opening ────────────────────────────────────────────────────────────────
  blocks.push(S('opening-excl', 'Opening', 'prayer', 'priest', f.opening.exclamation));
  blocks.push(S('opening-amen', 'Opening', 'response', 'reader', f.opening.amen));

  // ── Six Psalms ─────────────────────────────────────────────────────────────
  {
    const section = 'Six Psalms';
    const psalter = getPsalter();
    blocks.push(S('6ps-intro', section, 'rubric', 'reader', f.sixPsalms.intro));
    for (const n of [3, 37, 62]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
      }
    }
    blocks.push(S('6ps-mid-glory', section, 'doxology', 'reader', f.sixPsalms.midGlory));
    for (const n of [87, 102, 142]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
      }
    }
    blocks.push(S('6ps-closing', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.\n\nAlleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'));
  }

  // ── Great Litany (minimal) ─────────────────────────────────────────────────
  blocks.push(S('gl-opening', 'The Peace Litany', 'prayer', 'deacon',
    'In peace, let us pray to the Lord.'));
  blocks.push(S('gl-response', 'The Peace Litany', 'response', 'choir',
    'Lord, have mercy.'));

  // ── God is the Lord + Troparia ─────────────────────────────────────────────
  {
    const section = 'God is the Lord';
    blocks.push(S('gisl', section, 'hymn', 'choir',
      'God is the Lord, and hath appeared unto us; blessed is He that cometh in the Name of the Lord.',
      { tone: f.godIsTheLord.tone }));
    for (let i = 0; i < f.godIsTheLord.verses.length; i++) {
      blocks.push(S(`gisl-v${i}`, section, 'verse', 'reader', f.godIsTheLord.verses[i]));
    }
  }
  {
    const section = 'Troparia';
    blocks.push(S('trop-1', section, 'hymn', 'choir', f.troparia.nobleJoseph.text,
      { tone: f.troparia.nobleJoseph.tone, label: f.troparia.nobleJoseph.label }));
    blocks.push(S('trop-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('trop-2', section, 'hymn', 'choir', f.troparia.glory.text,
      { tone: f.troparia.glory.tone, label: f.troparia.glory.label }));
    blocks.push(S('trop-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('trop-3', section, 'hymn', 'choir', f.troparia.now.text,
      { tone: f.troparia.now.tone, label: f.troparia.now.label }));
  }

  // ── Stasis 1 ───────────────────────────────────────────────────────────────
  {
    const section = 'Stasis 1';
    blocks.push(S('s1-heading', section, 'rubric', null,
      `Tone ${f.stasis1.tone}. "${f.stasis1.refrain.substring(0, 40)}…"`));
    for (let i = 0; i < f.stasis1.verses.length; i++) {
      const v = f.stasis1.verses[i];
      blocks.push(S(`s1-ps-${i}`, section, 'verse', 'reader', v.psalm));
      blocks.push(S(`s1-tr-${i}`, section, 'hymn', 'choir', v.troparion,
        { tone: f.stasis1.tone }));
    }
  }

  // ── Small Litany after Stasis 1 ─────────────────────────────────────────────
  {
    const section = 'Small Litany';
    const sl = f.smallLitanies || {};
    const pet = sl.petitions || {};
    blocks.push(S('sl-1-open', section, 'prayer', 'deacon',
      pet.opening || 'Again and again, in peace, let us pray to the Lord.'));
    blocks.push(S('sl-1-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-1-help', section, 'prayer', 'deacon', pet.helpUs || 'Help us, save us, have mercy on us, and keep us, O God, by Thy grace.'));
    blocks.push(S('sl-1-help-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-1-comm', section, 'prayer', 'deacon', pet.commemoration || ''));
    blocks.push(S('sl-1-comm-resp', section, 'response', 'choir', pet.commitResponse || 'To Thee, O Lord.'));
    const s1Excl = (sl.afterStasis1 || {});
    blocks.push(S('sl-1-excl', section, 'prayer', 'priest', s1Excl.exclamation || ''));
    blocks.push(S('sl-1-amen', section, 'response', 'choir', s1Excl.amen || 'Amen.'));
  }

  // ── Stasis 2 ───────────────────────────────────────────────────────────────
  {
    const section = 'Stasis 2';
    blocks.push(S('s2-heading', section, 'rubric', null,
      `Tone ${f.stasis2.tone}. "${f.stasis2.refrain.substring(0, 45)}…"`));
    for (let i = 0; i < f.stasis2.verses.length; i++) {
      const v = f.stasis2.verses[i];
      blocks.push(S(`s2-ps-${i}`, section, 'verse', 'reader', v.psalm));
      blocks.push(S(`s2-tr-${i}`, section, 'hymn', 'choir', v.troparion,
        { tone: f.stasis2.tone }));
    }
  }

  // ── Small Litany after Stasis 2 ─────────────────────────────────────────────
  {
    const section = 'Small Litany';
    const sl = f.smallLitanies || {};
    const pet = sl.petitions || {};
    blocks.push(S('sl-2-open', section, 'prayer', 'deacon',
      pet.opening || 'Again and again, in peace, let us pray to the Lord.'));
    blocks.push(S('sl-2-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-2-help', section, 'prayer', 'deacon', pet.helpUs || 'Help us, save us, have mercy on us, and keep us, O God, by Thy grace.'));
    blocks.push(S('sl-2-help-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-2-comm', section, 'prayer', 'deacon', pet.commemoration || ''));
    blocks.push(S('sl-2-comm-resp', section, 'response', 'choir', pet.commitResponse || 'To Thee, O Lord.'));
    const s2Excl = (sl.afterStasis2 || {});
    blocks.push(S('sl-2-excl', section, 'prayer', 'priest', s2Excl.exclamation || ''));
    blocks.push(S('sl-2-amen', section, 'response', 'choir', s2Excl.amen || 'Amen.'));
  }

  // ── Stasis 3 ───────────────────────────────────────────────────────────────
  {
    const section = 'Stasis 3';
    blocks.push(S('s3-heading', section, 'rubric', null,
      `Tone ${f.stasis3.tone}. "${f.stasis3.refrain.substring(0, 45)}…"`));
    for (let i = 0; i < f.stasis3.verses.length; i++) {
      const v = f.stasis3.verses[i];
      blocks.push(S(`s3-ps-${i}`, section, 'verse', 'reader', v.psalm));
      blocks.push(S(`s3-tr-${i}`, section, 'hymn', 'choir', v.troparion,
        { tone: f.stasis3.tone }));
    }
  }

  // ── Small Litany after Stasis 3 ─────────────────────────────────────────────
  {
    const section = 'Small Litany';
    const sl = f.smallLitanies || {};
    const pet = sl.petitions || {};
    blocks.push(S('sl-3-open', section, 'prayer', 'deacon',
      pet.opening || 'Again and again, in peace, let us pray to the Lord.'));
    blocks.push(S('sl-3-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-3-help', section, 'prayer', 'deacon', pet.helpUs || 'Help us, save us, have mercy on us, and keep us, O God, by Thy grace.'));
    blocks.push(S('sl-3-help-resp', section, 'response', 'choir', pet.response || 'Lord, have mercy.'));
    blocks.push(S('sl-3-comm', section, 'prayer', 'deacon', pet.commemoration || ''));
    blocks.push(S('sl-3-comm-resp', section, 'response', 'choir', pet.commitResponse || 'To Thee, O Lord.'));
    const s3Excl = (sl.afterStasis3 || {});
    blocks.push(S('sl-3-excl', section, 'prayer', 'priest', s3Excl.exclamation || ''));
    blocks.push(S('sl-3-amen', section, 'response', 'choir', s3Excl.amen || 'Amen.'));
  }

  // ── Evlogetaria ────────────────────────────────────────────────────────────
  {
    const section = 'Evlogetaria';
    for (let i = 0; i < f.evlogetaria.troparia.length; i++) {
      const t = f.evlogetaria.troparia[i];
      blocks.push(S(`evlog-v-${i}`, section, 'verse', 'reader', t.verse));
      blocks.push(S(`evlog-tr-${i}`, section, 'hymn', 'choir', t.text,
        { tone: f.evlogetaria.tone }));
    }
    blocks.push(S('evlog-alleluia', section, 'hymn', 'choir', f.evlogetaria.alleluia));
  }

  // ── Psalm 50 ───────────────────────────────────────────────────────────────
  {
    const psalter = getPsalter();
    const ps50 = psalter['50'];
    if (ps50) {
      blocks.push(S('ps50', 'Psalm 50', 'prayer', 'reader', psalmBody(ps50).join('\n')));
    }
  }

  // ── Canon (abbreviated — rubric placeholder) ──────────────────────────────
  blocks.push(S('canon-rubric', 'Canon', 'rubric', null, f.canon.rubric));

  // ── Kontakion + Ikos (after Ode 6 of Canon) ──────────────────────────────
  blocks.push(S('kontakion', 'Kontakion', 'hymn', 'choir', f.canon.kontakion.text,
    { tone: f.canon.kontakion.tone }));
  blocks.push(S('ikos', 'Kontakion', 'hymn', 'reader', f.canon.ikos.text));

  // ── Exaposteilarion (×3) ──────────────────────────────────────────────────
  {
    const section = 'Exaposteilarion';
    for (let i = 0; i < 3; i++) {
      blocks.push(S(`exapost-${i}`, section, 'hymn', 'choir', f.exaposteilarion.text,
        { tone: f.exaposteilarion.tone, label: i === 0 ? f.exaposteilarion.label : null }));
    }
  }

  // ── Lauds (Praises) ──────────────────────────────────────────────────────
  {
    const section = 'Lauds';
    for (let i = 0; i < f.lauds.hymns.length; i++) {
      const h = f.lauds.hymns[i];
      blocks.push(S(`lauds-verse-${i}`, section, 'verse', 'reader', `V. ${h.verse}`));
      blocks.push(S(`lauds-hymn-${i}`, section, 'hymn', 'choir', h.text,
        { tone: h.tone }));
    }
    blocks.push(S('lauds-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('lauds-glory-hymn', section, 'hymn', 'choir', f.lauds.glory.text,
      { tone: f.lauds.glory.tone }));
    blocks.push(S('lauds-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('lauds-now-hymn', section, 'hymn', 'choir', f.lauds.now.text));
  }

  // ── Great Doxology (sung) ──────────────────────────────────────────────────
  blocks.push(S('great-doxology', 'Great Doxology', 'prayer', 'choir',
    f.greatDoxology.text));

  // ── Procession with Epitaphios + Trisagion ─────────────────────────────────
  blocks.push(S('procession-rubric', 'Procession', 'rubric', null, f.procession.rubric));
  blocks.push(S('trisagion', 'Procession', 'hymn', 'choir', f.trisagion.text));

  // ── Prophecy (Ezekiel 37) ─────────────────────────────────────────────────
  blocks.push(S('prophecy-label', 'Prophecy', 'rubric', null,
    `${f.prophecy.label} (${f.prophecy.pericope})`));
  blocks.push(S('prophecy-text', 'Prophecy', 'prayer', 'reader', f.prophecy.text));

  // ── Epistle ────────────────────────────────────────────────────────────────
  {
    const section = 'Epistle';
    const ep = f.epistle;
    blocks.push(S('ep-prok', section, 'hymn', 'reader',
      `Prokeimenon, Tone ${ep.prokeimenon.tone}:\n${ep.prokeimenon.refrain}`,
      { tone: ep.prokeimenon.tone }));
    blocks.push(S('ep-prok-v', section, 'verse', 'reader', ep.prokeimenon.verse));
    blocks.push(S('ep-announce', section, 'rubric', 'deacon',
      `The Reading from ${ep.book} (${ep.pericope}).`));
    blocks.push(S('ep-text', section, 'prayer', 'reader', ep.text));
    blocks.push(S('ep-alleluia', section, 'hymn', 'choir',
      'Alleluia, alleluia, alleluia!', { tone: ep.alleluia.tone }));
    for (let i = 0; i < ep.alleluia.verses.length; i++) {
      blocks.push(S(`ep-alleluia-v${i}`, section, 'verse', 'reader', ep.alleluia.verses[i]));
    }
  }

  // ── Gospel ─────────────────────────────────────────────────────────────────
  {
    const section = 'Gospel';
    blocks.push(S('gospel-label', section, 'rubric', 'deacon',
      `${f.gospel.label} (${f.gospel.book} ${f.gospel.pericope})`));
    blocks.push(S('gospel-text', section, 'prayer', 'priest', f.gospel.text));
  }

  // ── Dismissal ──────────────────────────────────────────────────────────────
  blocks.push(S('dismissal', 'Dismissal', 'prayer', 'priest', f.dismissal.text));
  blocks.push(S('dismissal-amen', 'Dismissal', 'response', 'choir', f.dismissal.response));

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Vesperal Liturgy of St. Basil — Holy Saturday ──────────────────────────

/**
 * Assembles the Vesperal Liturgy of St. Basil the Great (Holy Saturday morning).
 * Combines Vespers (with 15 OT readings) and the Liturgy of St. Basil.
 *
 * Structure:
 *   VESPERS PORTION:
 *     Opening → Psalm 103 → Great Litany → Lord I Call (stichera) →
 *     Entrance → Gladsome Light → 15 Old Testament Readings →
 *     Song of the Three Youths → "Arise, O God" →
 *   LITURGY PORTION:
 *     Baptismal Hymn → Small Litany → Epistle → Gospel →
 *     Augmented Litany → Catechumens → Faithful Litanies →
 *     Cherubic Hymn ("Let all mortal flesh") → Great Entrance →
 *     Creed → Anaphora of St. Basil → Megalynarion →
 *     Lord's Prayer → Pre-Communion → Communion Hymn →
 *     Post-Communion → Thanksgiving → Dismissal
 *
 * @param {Object} vf   - Parsed fixed-texts/vesperal-liturgy-fixed.json (unique content)
 * @param {Object} vesp - Parsed fixed-texts/vespers-fixed.json (shared vespers texts)
 * @param {Object} lf   - Parsed fixed-texts/liturgy-fixed.json (shared liturgy texts)
 * @returns {ServiceBlock[]}
 */
function assembleVesperalLiturgy(vf, vesp, lf) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  // ═══════════════════════════════════════════════════════════════════════════
  // VESPERS PORTION
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Opening ────────────────────────────────────────────────────────────────
  blocks.push(S('opening-excl', 'Opening', 'prayer', 'priest', vesp.opening.exclamation));
  blocks.push(S('opening-amen', 'Opening', 'response', 'choir', vesp.responses.amen));

  // ── Psalm 103 ──────────────────────────────────────────────────────────────
  blocks.push(...assemblePsalm103(vesp));

  // ── Great Litany ───────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(vesp));

  // ── Lord, I Have Cried ─────────────────────────────────────────────────────
  {
    const section = 'Lord, I Have Cried';
    const psalmVerses = vesp.lordICall.psalmVerses;
    blocks.push(S('lic-refrain', section, 'prayer', 'choir', vesp.lordICall.refrain));

    // Psalms 140, 141 (read in full)
    blocks.push(S('ps140', section, 'prayer', 'reader', psalmVerses.psalm140.text));
    blocks.push(S('ps141', section, 'prayer', 'reader', psalmVerses.psalm141.text));

    // Psalm 129 + 116 verses with stichera interleaved (dynamic count: On 6 or On 8)
    const stichera = vf.lordICall.stichera;
    const sticheraMap = {};
    const count = stichera.length;
    for (let i = 0; i < count; i++) {
      sticheraMap[count - i] = stichera[i];
    }

    const maxVerse = Math.max(...Object.keys(sticheraMap).map(Number));
    const allVerses = [...psalmVerses.psalm129.verses, ...psalmVerses.psalm116.verses];
    for (const verse of allVerses) {
      if (verse.number > maxVerse) continue; // skip verses above stichera count
      blocks.push(S(`lic-verse-${verse.number}`, section, 'verse', 'reader',
        `V. (${verse.number}) ${verse.text}`));
      if (sticheraMap[verse.number]) {
        const h = sticheraMap[verse.number];
        blocks.push(S(`lic-hymn-v${verse.number}`, section, 'hymn', 'choir', h.text,
          { tone: h.tone, source: 'triodion' }));
      }
    }

    // Glory
    blocks.push(S('lic-glory', section, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S('lic-glory-hymn', section, 'hymn', 'choir', vf.lordICall.glory.text,
      { tone: vf.lordICall.glory.tone, source: 'triodion' }));

    // Now
    blocks.push(S('lic-now', section, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S('lic-now-hymn', section, 'hymn', 'choir', vf.lordICall.now.text,
      { source: 'triodion' }));
  }

  // ── Entrance ───────────────────────────────────────────────────────────────
  blocks.push(S('entrance', 'Entrance', 'rubric', 'deacon', vesp.entrance.wisdom));

  // ── Gladsome Light ─────────────────────────────────────────────────────────
  blocks.push(S('gladsome-light', 'Gladsome Light', 'hymn', 'choir', vesp['gladsome-light']));

  // ── 15 Old Testament Readings ──────────────────────────────────────────────
  for (const reading of vf.readings) {
    const section = reading.label;
    blocks.push(S(`reading-${reading.order}-label`, section, 'rubric', 'deacon',
      `${reading.book} (${reading.pericope})`));
    blocks.push(S(`reading-${reading.order}-text`, section, 'prayer', 'reader',
      reading.text));
  }

  // ── Song of the Three Youths ───────────────────────────────────────────────
  {
    const section = 'Song of the Three Youths';
    blocks.push(S('song-3-label', section, 'rubric', null, vf.songOfThreeYouths.label));
    blocks.push(S('song-3-text', section, 'hymn', 'choir', vf.songOfThreeYouths.text,
      { tone: vf.songOfThreeYouths.tone }));
  }

  // ── "Arise, O God" ─────────────────────────────────────────────────────────
  {
    const section = 'Arise, O God';
    blocks.push(S('arise-hymn', section, 'hymn', 'choir', vf.ariseOGod.text,
      { tone: vf.ariseOGod.tone, label: vf.ariseOGod.label }));
    for (let i = 0; i < vf.ariseOGod.verses.length; i++) {
      blocks.push(S(`arise-v${i}`, section, 'verse', 'reader', vf.ariseOGod.verses[i]));
      blocks.push(S(`arise-rep-${i}`, section, 'hymn', 'choir', vf.ariseOGod.text,
        { tone: vf.ariseOGod.tone }));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LITURGY PORTION (St. Basil the Great)
  // ═══════════════════════════════════════════════════════════════════════════

  const isBasil = true;

  // ── Baptismal Hymn (replaces Trisagion) ────────────────────────────────────
  blocks.push(S('baptismal-rubric', 'Baptismal Hymn', 'rubric', null,
    'In place of the Trisagion:'));
  blocks.push(S('baptismal-hymn', 'Baptismal Hymn', 'hymn', 'choir',
    vf.baptismalHymn.text, { label: vf.baptismalHymn.label }));

  // ── Little Litany (after Baptismal Hymn) ───────────────────────────────────
  blocks.push(..._litLittleLitany(lf, 'exclamation2', 'vl-post-bapt'));

  // ── Peace → Prokeimenon transition ─────────────────────────────────────────
  blocks.push(S('vl-peace', 'Epistle', 'prayer', 'priest', 'Peace be unto all.'));
  blocks.push(S('vl-peace-resp', 'Epistle', 'response', 'choir', 'And to thy spirit.'));

  // ── Epistle ────────────────────────────────────────────────────────────────
  // Note: No Alleluia at this service — "Arise, O God" (rendered above) replaces it
  {
    const section = 'Epistle';
    const ep = vf.epistle;
    blocks.push(S('ep-prok', section, 'hymn', 'reader',
      `Prokeimenon, Tone ${ep.prokeimenon.tone}:\n${ep.prokeimenon.refrain}`,
      { tone: ep.prokeimenon.tone }));
    blocks.push(S('ep-prok-v', section, 'verse', 'reader', ep.prokeimenon.verse));
    blocks.push(S('ep-announce', section, 'rubric', 'deacon',
      `The Reading from ${ep.book} (${ep.pericope}).`));
    blocks.push(S('ep-text', section, 'prayer', 'reader', ep.text));
  }

  // ── Gospel ─────────────────────────────────────────────────────────────────
  {
    const section = 'Gospel';
    blocks.push(S('gospel-glory', section, 'doxology', 'deacon',
      'Glory to Thee, O Lord, glory to Thee!'));
    blocks.push(S('gospel-label', section, 'rubric', 'deacon',
      `${vf.gospel.label} (${vf.gospel.book} ${vf.gospel.pericope})`));
    blocks.push(S('gospel-text', section, 'prayer', 'priest', vf.gospel.text));
    blocks.push(S('gospel-glory-end', section, 'doxology', 'choir',
      'Glory to Thee, O Lord, glory to Thee!'));
  }

  // ── Augmented Litany ───────────────────────────────────────────────────────
  blocks.push(..._litAugmentedLitany(lf));

  // ── Catechumens + Faithful ─────────────────────────────────────────────────
  blocks.push(..._litCatechumens(lf));
  blocks.push(..._litLitaniesFaithful(lf));

  // ── Cherubic Hymn: "Let All Mortal Flesh Keep Silence" ─────────────────────
  blocks.push(S('cherubic-hymn', 'Let All Mortal Flesh Keep Silence', 'hymn', 'choir',
    lf['cherubic-great-saturday']));

  // ── Great Entrance ─────────────────────────────────────────────────────────
  blocks.push(..._litGreatEntrance(lf));

  // ── Supplication + Creed ───────────────────────────────────────────────────
  blocks.push(..._litSupplication(lf));
  blocks.push(S('creed', 'The Creed', 'prayer', 'all', lf['creed']));

  // ── Anaphora of St. Basil ──────────────────────────────────────────────────
  blocks.push(..._litAnaphora(isBasil, lf));

  // ── Megalynarion — "Do not lament Me, O Mother" (replaces "All of creation") ──
  blocks.push(..._litMegalynarion(vf.megalynarion, isBasil, lf));

  // ── Lord's Prayer ──────────────────────────────────────────────────────────
  blocks.push(..._litLordsPrayer(isBasil, lf));

  // ── Pre-Communion ──────────────────────────────────────────────────────────
  blocks.push(..._litPreCommunion(isBasil, lf));

  // ── Communion Hymn ─────────────────────────────────────────────────────────
  blocks.push(S('communion-hymn', 'Communion Hymn', 'hymn', 'choir',
    vf.communionHymn.text));

  // ── Communion Prayer ───────────────────────────────────────────────────────
  blocks.push(..._litCommunionPrayer(lf));

  // ── Post-Communion ─────────────────────────────────────────────────────────
  blocks.push(..._litPostCommunion({}, lf));

  // ── Hymn of Thanksgiving ───────────────────────────────────────────────────
  blocks.push(S('let-our-mouths', 'Hymn of Thanksgiving', 'hymn', 'choir',
    lf['let-our-mouths']));

  // ── Thanksgiving Litany ────────────────────────────────────────────────────
  blocks.push(..._litThanksgiving(isBasil, lf));

  // ── Prayer behind the Ambon ────────────────────────────────────────────────
  blocks.push(S('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    lf['prayer-ambon-basil']));

  // ── Blessed be the Name + Psalm 33 ─────────────────────────────────────────
  blocks.push(..._litBlessedBeTheName(lf));
  blocks.push(..._litPsalm33(lf));

  // ── Dismissal ──────────────────────────────────────────────────────────────
  blocks.push(S('dismissal', 'Dismissal', 'prayer', 'priest', vf.dismissal.text));
  blocks.push(S('dismissal-amen', 'Dismissal', 'response', 'choir', vf.dismissal.response));

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Royal Hours of Great Friday ─────────────────────────────────────────────

/**
 * Assembles the Royal Hours of Great Friday.
 * 4 hours (1st, 3rd, 6th, 9th), each with: psalms, troparion/glory/theotokion,
 * prokeimenon, prophecy, epistle, gospel, 3 stichera, kontakion.
 * 100% fixed — same every year.
 *
 * @param {Object} f - Parsed royal-hours-fixed.json
 * @returns {ServiceBlock[]}
 */
function assembleRoyalHours(f) {
  _warnings = [];
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);
  const psalter = getPsalter();

  // ── Opening Prayers ───────────────────────────────────────────────────────
  {
    const sec = 'Opening Prayers';
    blocks.push(S('op-blessing', sec, 'prayer', 'priest', f.opening.blessing));
    blocks.push(S('op-amen', sec, 'response', 'reader', f.opening.amen));
    if (f.opening.trisagion) {
      blocks.push(S('op-trisagion', sec, 'prayer', 'reader', f.opening.trisagion));
      blocks.push(S('op-trinity', sec, 'prayer', 'reader', f.opening.allHolyTrinity));
      blocks.push(S('op-lhm3', sec, 'response', 'reader', f.opening.lordHaveMercy3));
      blocks.push(S('op-our-father', sec, 'prayer', 'reader', f.opening.ourFather));
      blocks.push(S('op-excl', sec, 'prayer', 'priest', f.opening.exclamation));
      blocks.push(S('op-lhm12', sec, 'response', 'reader', f.opening.lordHaveMercy12));
    }
    blocks.push(S('op-comelet', sec, 'prayer', 'reader', f.opening.comeLet));
  }

  // ── Four Hours ────────────────────────────────────────────────────────────
  const hourKeys = ['first', 'third', 'sixth', 'ninth'];
  const hourNames = ['First Hour', 'Third Hour', 'Sixth Hour', 'Ninth Hour'];

  for (let h = 0; h < 4; h++) {
    const key = hourKeys[h];
    const hour = f.hours[key];
    const name = hourNames[h];
    const pfx = key.substring(0, 2); // fi, th, si, ni

    // Psalms
    const psSection = `${name} — Psalms`;
    for (let i = 0; i < hour.psalms.length; i++) {
      const psNum = hour.psalms[i];
      const ps = psalter[String(psNum)];
      if (ps) {
        blocks.push(S(`${pfx}-ps${psNum}-title`, psSection, 'rubric', null,
          `Psalm ${psNum}`));
        blocks.push(S(`${pfx}-ps${psNum}`, psSection, 'prayer', 'reader',
          ps.verses.join('\n')));
      }
    }

    // Troparion
    const tropSection = `${name} — Troparia`;
    blocks.push(S(`${pfx}-trop`, tropSection, 'hymn', 'choir', hour.troparion.text,
      { tone: hour.troparion.tone }));
    blocks.push(S(`${pfx}-glory-label`, tropSection, 'doxology', null,
      'Glory to the Father, and to the Son, and to the Holy Spirit.'));
    blocks.push(S(`${pfx}-glory`, tropSection, 'hymn', 'choir', hour.glory.text,
      hour.glory.tone ? { tone: hour.glory.tone } : undefined));
    blocks.push(S(`${pfx}-now-label`, tropSection, 'doxology', null,
      'Now and ever and unto ages of ages. Amen.'));
    blocks.push(S(`${pfx}-theot`, tropSection, 'hymn', 'choir', hour.theotokion.text));

    // Prokeimenon
    const prokSection = `${name} — Prokeimenon`;
    blocks.push(S(`${pfx}-prok-refrain`, prokSection, 'hymn', 'reader',
      hour.prokeimenon.refrain, { tone: hour.prokeimenon.tone }));
    blocks.push(S(`${pfx}-prok-verse`, prokSection, 'verse', 'reader',
      hour.prokeimenon.verse));
    blocks.push(S(`${pfx}-prok-refrain2`, prokSection, 'hymn', 'reader',
      hour.prokeimenon.refrain));

    // Prophecy (OT reading)
    const readSection = `${name} — Readings`;
    blocks.push(S(`${pfx}-proph-intro`, readSection, 'rubric', null,
      `The Reading from the Prophecy of ${hour.prophecy.book} (${hour.prophecy.pericope})`));
    blocks.push(S(`${pfx}-prophecy`, readSection, 'prayer', 'reader',
      hour.prophecy.text));

    // Epistle
    blocks.push(S(`${pfx}-ep-intro`, readSection, 'rubric', null,
      `The Reading from the Epistle of the Holy Apostle Paul to the ${hour.epistle.book} (${hour.epistle.pericope})`));
    blocks.push(S(`${pfx}-epistle`, readSection, 'prayer', 'reader',
      hour.epistle.text));

    // Gospel
    blocks.push(S(`${pfx}-gos-intro`, readSection, 'rubric', null,
      `The Reading from the Holy Gospel according to ${hour.gospel.book} (${hour.gospel.pericope})`));
    blocks.push(S(`${pfx}-gospel`, readSection, 'prayer', 'deacon',
      hour.gospel.text));

    // Stichera (3 idiomela)
    const stiSection = `${name} — Stichera`;
    for (let i = 0; i < hour.stichera.length; i++) {
      blocks.push(S(`${pfx}-stich-${i}`, stiSection, 'hymn', 'choir',
        hour.stichera[i].text, { tone: hour.stichera[i].tone }));
    }

    // Trisagion → Our Father before Kontakion
    const closeSec = `${name} — Closing`;
    blocks.push(S(`${pfx}-trisagion`, closeSec, 'prayer', 'reader', f.opening.trisagion));
    blocks.push(S(`${pfx}-our-father`, closeSec, 'prayer', 'reader', f.opening.ourFather));
    blocks.push(S(`${pfx}-excl`, closeSec, 'prayer', 'priest', f.opening.exclamation));

    // Kontakion
    blocks.push(S(`${pfx}-kontakion`, `${name} — Kontakion`, 'hymn', 'choir',
      hour.kontakion.text, { tone: hour.kontakion.tone }));

    // Lord have mercy ×40 + closing prayer
    blocks.push(S(`${pfx}-lhm40`, closeSec, 'response', 'reader', 'Lord, have mercy. (×40)'));
  }

  // ── Dismissal ─────────────────────────────────────────────────────────────
  blocks.push(S('dismissal', 'Dismissal', 'prayer', 'priest', f.dismissal.text));
  blocks.push(S('dismissal-amen', 'Dismissal', 'response', 'choir', f.dismissal.response));

  blocks._warnings = _warnings.slice();
  return blocks;
}

// ─── Regular Matins (Orthros) Assembler ──────────────────────────────────────

/**
 * Assembles the regular Matins (Orthros) service for a given calendar day.
 *
 * Unlike the Holy Week matins assemblers (Bridegroom, Paschal, Passion Gospels,
 * Lamentations) which are 100% fixed, regular Matins draws variable content
 * from Octoechos, Menaion, and Triodion via the calendar entry's matins spec.
 *
 * The matins spec (calendarDay.matins) drives:
 *   - godIsTheLord vs alleluia
 *   - troparia (resurrectional / saint)
 *   - kathisma schedule
 *   - polyeleios / magnification (feasts)
 *   - prokeimenon + gospel (Sundays / feasts)
 *   - canon (stub for now)
 *   - kontakion / ikos
 *   - exapostilarion
 *   - lauds stichera
 *   - great vs small doxology
 *   - aposticha (Lenten weekdays)
 *
 * @param {Object} calendarDay   - Parsed calendar entry with .matins spec
 * @param {Object} matinsFixed   - Parsed fixed-texts/matins-fixed.json
 * @param {Object} vespersFixed  - Parsed fixed-texts/vespers-fixed.json (shared texts)
 * @param {Object} sources       - { octoechos, menaion, triodion, ... }
 * @returns {ServiceBlock[]}
 */
function assembleMatins(calendarDay, matinsFixed, vespersFixed, sources) {
  _warnings = [];
  const blocks = [];
  const spec = calendarDay.matins;
  if (!spec) {
    console.warn('No matins spec in calendar entry');
    return blocks;
  }

  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  const isSunday       = spec.isSunday || false;
  const isGreatFeast   = spec.feastRank === 'greatFeast';
  // Great Doxology is sung on Sundays + doxology-rank feasts, UNLESS overridden
  // (e.g. Annunciation on a Lenten weekday uses Small Doxology per rubrics)
  const hasDoxology    = spec.useSmallDoxology ? false
    : (isSunday || ['greatFeast', 'polyeleos', 'doxology'].includes(spec.feastRank));
  const hasAposticha   = spec.aposticha != null;
  const hasGospel      = spec.gospel != null;
  const isAlleluiaDay  = spec.alleluia === true;
  const isVigil        = spec.serviceType === 'all-night-vigil';

  // ── 1. Opening ──────────────────────────────────────────────────────────────
  if (!isVigil) {
    blocks.push(...assembleOpening(vespersFixed));
  }

  // ── 1b. Royal Office (Psalms 19 & 20) — often omitted in parish practice ──
  if (spec.includeRoyalOffice && matinsFixed.royalOffice) {
    const section = 'Royal Office';
    const ro = matinsFixed.royalOffice;
    const psalter = getPsalter();

    // Trisagion → Our Father → Lord have mercy ×12
    blocks.push(S('ro-trisagion', section, 'prayer', 'reader', vespersFixed.prayers.trisagion));
    blocks.push(S('ro-glory', section, 'doxology', 'reader', vespersFixed.doxology.gloryNow));
    blocks.push(S('ro-our-father', section, 'prayer', 'reader', vespersFixed.prayers.ourFather));
    blocks.push(S('ro-kingdom', section, 'prayer', 'priest', vespersFixed.prayers['ourFather.doxology']));
    blocks.push(S('ro-lhm12', section, 'response', 'reader', 'Lord, have mercy. (×12)'));

    // Psalms 19 & 20
    for (const n of ro.psalmNumbers) {
      const ps = psalter[String(n)];
      if (ps) {
        blocks.push(S(`ro-ps${n}-intro`, section, 'instruction', null, `Psalm ${n} — ${ps.verses[0]}`));
        blocks.push(S(`ro-ps${n}`, section, 'prayer', 'reader', ps.verses.slice(1).join('\n')));
      }
    }

    // Trisagion → Our Father (again)
    blocks.push(S('ro-trisagion2', section, 'prayer', 'reader', vespersFixed.prayers.trisagion));
    blocks.push(S('ro-glory2', section, 'doxology', 'reader', vespersFixed.doxology.gloryNow));
    blocks.push(S('ro-our-father2', section, 'prayer', 'reader', vespersFixed.prayers.ourFather));
    blocks.push(S('ro-kingdom2', section, 'prayer', 'priest', vespersFixed.prayers['ourFather.doxology']));

    // Troparia
    ro.troparia.forEach((t, i) => {
      if (t.label) {
        blocks.push(S(`ro-trop-label-${i}`, section, 'rubric', null, t.label));
      }
      blocks.push(S(`ro-trop-${i}`, section, 'prayer', 'reader', t.text));
    });

    // Abbreviated Augmented Litany exclamation
    blocks.push(S('ro-litany-excl', section, 'prayer', 'priest', ro.litanyExclamation));
    blocks.push(S('ro-litany-amen', section, 'response', 'reader', 'Amen.'));

    // Transition to Six Psalms
    blocks.push(S('ro-transition', section, 'prayer', 'reader', ro.transition));
    blocks.push(S('ro-trinity', section, 'prayer', 'priest', ro.trinityGlory));
    blocks.push(S('ro-trinity-amen', section, 'response', 'reader', 'Amen.'));
  }

  // ── 2. Six Psalms ───────────────────────────────────────────────────────────
  {
    const section = 'Six Psalms';
    const psalter = getPsalter();
    blocks.push(S('6ps-intro', section, 'rubric', 'reader', matinsFixed.sixPsalms.intro));

    const andAgain = matinsFixed.sixPsalms.andAgain || {};

    for (const n of [3, 37, 62]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    blocks.push(S('6ps-mid-glory', section, 'doxology', 'reader', matinsFixed.sixPsalms.midGlory));

    for (const n of [87, 102, 142]) {
      const ps = psalter[String(n)];
      if (ps) {
        const verses = psalmBody(ps);
        blocks.push(S(`6ps-${n}`, `Psalm ${n}`, 'prayer', 'reader', verses.join('\n')));
        if (andAgain[String(n)]) {
          blocks.push(S(`6ps-${n}-again`, `Psalm ${n}`, 'prayer', 'reader', andAgain[String(n)]));
        }
      }
    }

    blocks.push(S('6ps-closing', section, 'doxology', 'reader',
      'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.\n\nAlleluia, alleluia, alleluia. Glory to Thee, O God. (×3)'));
  }

  // ── 3. Great Litany ─────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(vespersFixed));

  // ── 4. God is the Lord / Alleluia ───────────────────────────────────────────
  if (isAlleluiaDay) {
    const section = 'Alleluia';
    const a = matinsFixed.alleluia;
    blocks.push(S('alleluia', section, 'hymn', 'choir',
      a.refrain, { tone: a.tone }));
    for (let i = 0; i < a.verses.length; i++) {
      blocks.push(S(`alleluia-v${i}`, section, 'verse', 'reader', a.verses[i]));
      blocks.push(S(`alleluia-rep-${i}`, section, 'hymn', 'choir',
        a.refrain, { tone: a.tone }));
    }
  } else {
    const section = 'God is the Lord';
    const g = matinsFixed.godIsTheLord;
    const tone = spec.tone || 4;
    blocks.push(S('gitl-refrain', section, 'hymn', 'choir', g.refrain, { tone }));
    for (let i = 0; i < g.verses.length; i++) {
      blocks.push(S(`gitl-v${i}`, section, 'verse', 'reader', g.verses[i]));
      blocks.push(S(`gitl-rep-${i}`, section, 'hymn', 'choir', g.refrain, { tone }));
    }
  }

  // ── 5. Troparia after God is the Lord ───────────────────────────────────────
  if (spec.troparia) {
    blocks.push(...assembleTroparia(spec.troparia, sources));
  } else if (spec.troparion) {
    // Simple case: single troparion repeated ×3 (e.g. great feast)
    const section = 'Troparia';
    const t = spec.troparion;
    blocks.push(S('trop-1', section, 'hymn', 'choir', t.text, { tone: t.tone, label: t.label }));
    blocks.push(S('trop-glory', section, 'doxology', null, vespersFixed.doxology.gloryOnly));
    blocks.push(S('trop-2', section, 'hymn', 'choir', t.text, { tone: t.tone }));
    blocks.push(S('trop-now', section, 'doxology', null, vespersFixed.doxology.nowOnly));
    blocks.push(S('trop-3', section, 'hymn', 'choir', t.text, { tone: t.tone }));
  }

  // ── 6. Kathisma Readings ────────────────────────────────────────────────────
  {
    const kathismaCount = spec.kathismaCount || (isSunday ? 3 : 2);
    const kathismaNumbers = spec.kathismaNumbers || [];

    for (let k = 0; k < kathismaCount; k++) {
      const kathNum = kathismaNumbers[k];
      if (kathNum) {
        blocks.push(...assembleKathismaReading(kathNum, `Kathisma ${k + 1}`));
      } else {
        blocks.push(S(`kathisma-${k + 1}-rubric`, `Kathisma ${k + 1}`, 'rubric', null,
          `[Kathisma ${k + 1} — number to be determined by schedule]`));
      }
      // Little Litany after each kathisma
      const llSection = `Little Litany (after Kathisma ${k + 1})`;
      const lit = vespersFixed.litanies.little;
      blocks.push(S(`ll-${k}-opening`, llSection, 'prayer', 'deacon', lit.opening));
      blocks.push(S(`ll-${k}-response`, llSection, 'response', 'choir', lit.response));
      blocks.push(S(`ll-${k}-petition`, llSection, 'prayer', 'deacon', lit.petition));
      blocks.push(S(`ll-${k}-comm`, llSection, 'prayer', 'deacon', lit.commemoration));
      blocks.push(S(`ll-${k}-comm-r`, llSection, 'response', 'choir', lit.commemorationResponse));
      blocks.push(S(`ll-${k}-excl`, llSection, 'prayer', 'priest',
        k % 2 === 0 ? lit.exclamation1 : lit.exclamation2));
      blocks.push(S(`ll-${k}-amen`, llSection, 'response', 'choir', 'Amen.'));

      // Sessional hymn (sedalen) after each kathisma — variable
      if (spec.sedalion && spec.sedalion[k]) {
        const sed = spec.sedalion[k];
        blocks.push(S(`sedalen-${k}`, `Kathisma ${k + 1}`, 'hymn', 'choir',
          sed.text, { tone: sed.tone, source: sed.source, label: sed.label }));
      }
    }
  }

  // ── 7. Polyeleios ──────────────────────────────────────────────────────────
  if (isSunday || ['greatFeast', 'polyeleos'].includes(spec.feastRank)) {
    const section = 'Polyeleios';
    const poly = matinsFixed.polyeleios;

    // Psalm 134
    blocks.push(S('poly-ps134-hd', section, 'rubric', null, poly.psalm134.label));
    for (let i = 0; i < poly.psalm134.verses.length; i++) {
      blocks.push(S(`poly-ps134-v${i}`, section, 'verse', 'choir', poly.psalm134.verses[i]));
      blocks.push(S(`poly-ps134-r${i}`, section, 'response', 'choir', poly.psalm134.refrain));
    }

    // Psalm 135
    blocks.push(S('poly-ps135-hd', section, 'rubric', null, poly.psalm135.label));
    for (let i = 0; i < poly.psalm135.verses.length; i++) {
      blocks.push(S(`poly-ps135-v${i}`, section, 'verse', 'choir', poly.psalm135.verses[i]));
      blocks.push(S(`poly-ps135-r${i}`, section, 'response', 'choir', poly.psalm135.refrain));
    }

    // Magnification (for great feasts)
    if (spec.magnification) {
      const mag = spec.magnification;
      blocks.push(S('magnification', section, 'hymn', 'choir', mag.refrain, { label: 'Magnification' }));
      if (mag.psalmVerses) {
        for (let i = 0; i < mag.psalmVerses.length; i++) {
          blocks.push(S(`mag-v${i}`, section, 'verse', 'reader', mag.psalmVerses[i].text));
          blocks.push(S(`mag-r${i}`, section, 'hymn', 'choir', mag.refrain));
        }
      }
    }

    // Little Litany after Polyeleios
    const llSection = 'Little Litany (after Polyeleios)';
    const lit = vespersFixed.litanies.little;
    blocks.push(S('poly-ll-opening', llSection, 'prayer', 'deacon', lit.opening));
    blocks.push(S('poly-ll-response', llSection, 'response', 'choir', lit.response));
    blocks.push(S('poly-ll-petition', llSection, 'prayer', 'deacon', lit.petition));
    blocks.push(S('poly-ll-comm', llSection, 'prayer', 'deacon', lit.commemoration));
    blocks.push(S('poly-ll-comm-r', llSection, 'response', 'choir', lit.commemorationResponse));
    blocks.push(S('poly-ll-excl', llSection, 'prayer', 'priest', lit.exclamation2));
    blocks.push(S('poly-ll-amen', llSection, 'response', 'choir', 'Amen.'));
  }

  // ── 8. Evlogitaria (Sundays only, except great feasts of the Lord) ────────
  if (isSunday && !spec.isGreatFeastOfLord) {
    blocks.push(S('evlog-refrain', 'Evlogitaria', 'hymn', 'choir',
      matinsFixed.evlogitaria.refrain, { tone: matinsFixed.evlogitaria.tone }));
    matinsFixed.evlogitaria.troparia.forEach((t, i) => {
      if (typeof t === 'string') {
        blocks.push(S(`evlog-${i}`, 'Evlogitaria', 'hymn', 'choir', t,
          { tone: matinsFixed.evlogitaria.tone }));
        blocks.push(S(`evlog-r${i}`, 'Evlogitaria', 'hymn', 'choir',
          matinsFixed.evlogitaria.refrain, { tone: matinsFixed.evlogitaria.tone }));
      } else {
        // Glory or Now troparion
        blocks.push(S(`evlog-${i}-prefix`, 'Evlogitaria', 'doxology', null, t.prefix));
        blocks.push(S(`evlog-${i}`, 'Evlogitaria', 'hymn', 'choir', t.text,
          { tone: matinsFixed.evlogitaria.tone }));
      }
    });
    blocks.push(S('evlog-final', 'Evlogitaria', 'response', 'choir',
      matinsFixed.evlogitaria.finalRefrain));
  }

  // ── 9. Hypakoë (Sundays only) ──────────────────────────────────────────────
  if (isSunday && spec.hypakoë) {
    blocks.push(S('hypakoë', 'Hypakoë', 'hymn', 'choir', spec.hypakoë.text,
      { tone: spec.hypakoë.tone, source: 'octoechos' }));
  }

  // ── 10. Antiphons of Degrees (Sundays only) ────────────────────────────────
  if (isSunday && spec.antiphons) {
    blocks.push(S('antiphons', 'Antiphons of Degrees', 'hymn', 'choir', spec.antiphons.text,
      { tone: spec.antiphons.tone, source: 'octoechos', _source: spec.antiphons._source }));
  }

  // ── 11. Prokeimenon + Let Everything That Breathes + Gospel ────────────────
  if (hasGospel) {
    // Prokeimenon
    if (spec.prokeimenon) {
      const section = 'Matins Prokeimenon';
      const prok = spec.prokeimenon;
      blocks.push(S('mat-prok-intro', section, 'prayer', 'deacon',
        matinsFixed.prokeimenon.intro));
      blocks.push(S('mat-prok-refrain', section, 'hymn', 'choir', prok.refrain,
        { tone: prok.tone, _source: prok._source }));
      if (prok.verse) {
        blocks.push(S('mat-prok-verse', section, 'verse', 'reader', prok.verse,
          { _source: prok._source }));
        blocks.push(S('mat-prok-refrain-2', section, 'hymn', 'choir', prok.refrain,
          { tone: prok.tone, _source: prok._source }));
      }
    }

    // Let everything that breathes
    blocks.push(S('let-everything', 'Let Everything That Breathes', 'hymn', 'choir',
      matinsFixed.letEverythingThatBreathes.text));

    // Gospel intro
    const section = 'Matins Gospel';
    blocks.push(S('gospel-intro', section, 'prayer', 'deacon', matinsFixed.gospel.intro));
    blocks.push(S('gospel-response', section, 'response', 'choir', matinsFixed.gospel.response));
    blocks.push(S('gospel-excl', section, 'prayer', 'priest', matinsFixed.gospel.exclamation));
    blocks.push(S('gospel-amen', section, 'response', 'choir', matinsFixed.gospel.amen));

    // Gospel reading
    const g = spec.gospel;
    blocks.push(S('gospel-reading', section, 'prayer', 'priest',
      g.text || `[Gospel: ${g.reading}]`,
      { label: g.reading, source: g.source || 'gospel' }));
  }

  // ── 12. Having Beheld the Resurrection (Sundays only) ──────────────────────
  if (isSunday) {
    blocks.push(S('having-beheld', 'Having Beheld the Resurrection', 'hymn', 'choir',
      matinsFixed.havingBeheld.text));
  }

  // ── 13. Psalm 50 ───────────────────────────────────────────────────────────
  {
    const psalter = getPsalter();
    const ps50 = psalter['50'];
    if (ps50) {
      blocks.push(S('ps50', 'Psalm 50', 'prayer', 'reader', psalmBody(ps50).join('\n')));
    }
  }

  // ── 14. Post-Gospel Stichera ────────────────────────────────────────────────
  if (hasGospel) {
    const section = 'Post-Gospel Stichera';
    blocks.push(S('pg-glory', section, 'doxology', null, vespersFixed.doxology.gloryOnly));
    blocks.push(S('pg-glory-verse', section, 'verse', 'reader',
      matinsFixed.postGospel.gloryVerse));

    if (spec.postGospelSticheron) {
      blocks.push(S('pg-sticheron', section, 'hymn', 'choir',
        spec.postGospelSticheron.text,
        { tone: spec.postGospelSticheron.tone, source: spec.postGospelSticheron.source,
          label: spec.postGospelSticheron.author, _source: spec.postGospelSticheron._source }));
    }

    blocks.push(S('pg-now', section, 'doxology', null, vespersFixed.doxology.nowOnly));
    blocks.push(S('pg-theotokion', section, 'verse', 'reader',
      matinsFixed.postGospel.theotokion));

    // Have mercy on me + sticheron on Psalm 50
    blocks.push(S('pg-ps50-verse', section, 'verse', 'reader',
      matinsFixed.postGospel.verse10));

    // Petition: "Save, O God, Thy people…" + Exclamation
    blocks.push(S('pg-petition', section, 'prayer', 'deacon',
      matinsFixed.postGospel.petition));
    blocks.push(S('pg-petition-excl', section, 'prayer', 'priest',
      matinsFixed.postGospel.petitionExclamation));
    blocks.push(S('pg-petition-amen', section, 'response', 'choir', 'Amen.'));
  }

  // ── 15. Canon ──────────────────────────────────────────────────────────────
  if (spec.canon) {
    _assembleCanon(blocks, spec.canon, matinsFixed, vespersFixed, sources);
  } else {
    blocks.push(S('canon-rubric', 'Canon', 'rubric', null,
      '[The Canon is chanted here. Odes 1–9 with troparia and katavasia.]'));
  }

  // ── 16. Kontakion + Ikos (after Ode 6, but placed here if canon is stubbed) ─
  if (spec.kontakion && !spec.canon) {
    blocks.push(S('kontakion', 'Kontakion', 'hymn', 'choir', spec.kontakion.text,
      { tone: spec.kontakion.tone, label: spec.kontakion.label }));
    if (spec.ikos) {
      blocks.push(S('ikos', 'Kontakion', 'hymn', 'reader', spec.ikos.text));
    }
  }

  // ── 17. Exapostilarion ─────────────────────────────────────────────────────
  if (spec.exapostilaria) {
    const section = 'Exapostilarion';
    spec.exapostilaria.forEach((ex, i) => {
      blocks.push(S(`exapost-${i}`, section, 'hymn', 'choir', ex.text,
        { tone: ex.tone, label: ex.melody || ex.label, source: ex.source, _source: ex._source }));
    });
  } else if (spec.exapostilarion) {
    // Single exapostilarion (possibly repeated)
    const section = 'Exapostilarion';
    const ex = spec.exapostilarion;
    const count = ex.repeat || 1;
    for (let i = 0; i < count; i++) {
      blocks.push(S(`exapost-${i}`, section, 'hymn', 'choir', ex.text,
        { tone: ex.tone, label: i === 0 ? (ex.label || ex.melody) : null, source: ex.source, _source: ex._source }));
    }
  }

  // ── 18. Lauds (Praises) ────────────────────────────────────────────────────
  if (spec.lauds) {
    const section = 'Lauds';
    const laudsSpec = spec.lauds;

    // Psalm verses (read or sung)
    if (laudsSpec.read) {
      blocks.push(S('lauds-rubric', section, 'rubric', null,
        'The Praises are read, not sung.'));
    }

    // Stichera
    if (laudsSpec.stichera) {
      laudsSpec.stichera.forEach((st, i) => {
        if (st.verse) {
          blocks.push(S(`lauds-verse-${i}`, section, 'verse', 'reader', `V. ${st.verse}`));
        }
        if (st.repeat) {
          // Repeat previous sticheron
          const prev = laudsSpec.stichera[i - 1];
          if (prev) {
            blocks.push(S(`lauds-hymn-${i}`, section, 'hymn', 'choir', prev.text,
              { tone: prev.tone || laudsSpec.tone }));
          }
        } else if (st.text) {
          blocks.push(S(`lauds-hymn-${i}`, section, 'hymn', 'choir', st.text,
            { tone: st.tone || laudsSpec.tone, label: st.melody }));
        }
      });
    }

    // Glory/Now + Doxastikon
    if (laudsSpec.doxastikon) {
      blocks.push(S('lauds-glory-now', section, 'doxology', null, vespersFixed.doxology.gloryNow));
      blocks.push(S('lauds-doxastikon', section, 'hymn', 'choir', laudsSpec.doxastikon.text,
        { tone: laudsSpec.doxastikon.tone, label: laudsSpec.doxastikon.author, _source: laudsSpec.doxastikon._source }));
    }
  }

  // ── 19. Great Doxology / Small Doxology ────────────────────────────────────
  //
  // The ending of Matins branches depending on whether aposticha are present:
  //
  // WITHOUT aposticha (Sunday / festal with Great Doxology):
  //   Great Doxology → Troparion → Augmented Litany → Morning Litany → Dismissal
  //
  // WITH aposticha (Lenten weekday, even if great feast):
  //   Small Doxology → Aposticha → "It is good…" → Trisagion/Our Father →
  //   Troparion → Augmented Litany → Morning Litany → Dismissal
  //
  // Priest's exclamation before either Doxology
  blocks.push(S('glory-shown-light', hasDoxology ? 'Great Doxology' : 'Small Doxology',
    'prayer', 'priest', 'Glory to Thee Who hast shown us the light!'));

  if (hasDoxology) {
    blocks.push(S('great-doxology', 'Great Doxology', 'hymn', 'choir',
      matinsFixed.greatDoxology.text));
    blocks.push(S('great-doxology-trisagion', 'Great Doxology', 'hymn', 'choir',
      matinsFixed.greatDoxology.trisagion));

    // Troparion after the Great Doxology
    if (spec.troparionAfterDoxology) {
      blocks.push(S('trop-after-dox', 'Great Doxology', 'hymn', 'choir',
        spec.troparionAfterDoxology.text,
        { tone: spec.troparionAfterDoxology.tone }));
    } else if (isSunday) {
      // Default: odd tones → "Today salvation", even tones → "Having risen"
      const tone = spec.tone || 4;
      const trop = (tone % 2 === 1)
        ? matinsFixed.troparionAfterDoxology.todaySalvation
        : matinsFixed.troparionAfterDoxology.havingRisen;
      blocks.push(S('trop-after-dox', 'Great Doxology', 'hymn', 'choir',
        trop.text, { tone: trop.tone }));
    }

    // ── Litanies (no-aposticha path) ──────────────────────────────────────
    blocks.push(...assembleAugmentedLitany(vespersFixed));
    blocks.push(..._assembleMorningLitany(matinsFixed, vespersFixed));

  } else {
    // Small (read) Doxology — weekdays without doxology-rank feast
    blocks.push(S('small-doxology', 'Small Doxology', 'prayer', 'reader',
      matinsFixed.smallDoxology.text));

    // ── Morning Litany (right after Doxology per OCA rubrics) ────────────
    blocks.push(..._assembleMorningLitany(matinsFixed, vespersFixed));

    // ── 20. Aposticha (Lenten weekday matins, after Morning Litany) ──────
    if (hasAposticha) {
      const section = 'Aposticha';
      const ap = spec.aposticha;
      if (ap.stichera) {
        ap.stichera.forEach((st, i) => {
          if (st.verse) {
            blocks.push(S(`apost-verse-${i}`, section, 'verse', 'reader', st.verse));
          }
          blocks.push(S(`apost-hymn-${i}`, section, 'hymn', 'choir', st.text,
            { tone: st.tone, source: st.source, label: st.label }));
        });
      }
      if (ap.glory) {
        blocks.push(S('apost-glory', section, 'doxology', null, vespersFixed.doxology.gloryNow));
        blocks.push(S('apost-glory-hymn', section, 'hymn', 'choir', ap.glory.text,
          { tone: ap.glory.tone, source: ap.glory.source, label: ap.glory.author }));
      }
    }

    // ── 21. "It is good to give thanks…" + Trisagion + Our Father ─────────
    {
      const section = 'Closing Prayers';
      blocks.push(S('it-is-good', section, 'prayer', 'reader',
        matinsFixed.itIsGood.text));
      blocks.push(S('trisagion-close', section, 'prayer', 'reader', vespersFixed.prayers.trisagion));
      blocks.push(S('glory-now-close', section, 'doxology', 'reader', vespersFixed.doxology.gloryNow));
      blocks.push(S('our-father-close', section, 'prayer', 'reader', vespersFixed.prayers.ourFather));
      blocks.push(S('kingdom-close', section, 'prayer', 'priest', vespersFixed.prayers['ourFather.doxology']));
    }

    // ── Troparion (Apolytikon — after aposticha path) ─────────────────────
    if (spec.finalTroparion) {
      blocks.push(S('final-trop', 'Closing Prayers', 'hymn', 'choir', spec.finalTroparion.text,
        { tone: spec.finalTroparion.tone, label: spec.finalTroparion.label }));
    } else if (spec.troparion) {
      blocks.push(S('final-trop', 'Closing Prayers', 'hymn', 'choir', spec.troparion.text,
        { tone: spec.troparion.tone, label: spec.troparion.label }));
    }

    // ── Augmented Litany (after troparion in aposticha path) ─────────────
    blocks.push(...assembleAugmentedLitany(vespersFixed));
  }

  // ── 23. Dismissal ─────────────────────────────────────────────────────────
  blocks.push(...assembleDismissal(vespersFixed));

  blocks._warnings = _warnings.slice();
  return blocks;
}

/**
 * Assembles the Canon section when canon data is provided in the spec.
 * Handles heirmoi + troparia stubs, little litanies after odes 3/6/9,
 * kontakion/ikos after ode 6, and magnificat before ode 9.
 */
function _assembleCanon(blocks, canonSpec, matinsFixed, vespersFixed, sources) {
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);
  const section = 'Canon';
  const lit = vespersFixed.litanies.little;

  const tone = canonSpec.tone;
  const odes = [1, 3, 4, 5, 6, 7, 8, 9]; // Ode 2 omitted in practice

  for (const odeNum of odes) {
    const odeKey = `ode${odeNum}`;
    const odeData = canonSpec[odeKey];

    if (odeData) {
      // Irmos
      if (odeData.irmos) {
        blocks.push(S(`canon-ode${odeNum}-irmos`, section, 'hymn', 'choir',
          odeData.irmos, { tone, label: `Ode ${odeNum} — Irmos` }));
      }

      // Troparia (if provided)
      if (odeData.troparia) {
        let prevCanon = null;
        odeData.troparia.forEach((t, i) => {
          // Insert canon-type heading when switching between canons
          if (t.canon && t.canon !== prevCanon) {
            if (t.canon === 'crossResurrection') {
              blocks.push(S(`canon-ode${odeNum}-cross-hdr`, section, 'rubric', null,
                'Canon of the Cross and Resurrection'));
            } else if (t.canon === 'theotokos') {
              blocks.push(S(`canon-ode${odeNum}-theotokos-hdr`, section, 'rubric', null,
                'Canon of the Theotokos'));
            }
            prevCanon = t.canon;
          }
          // Refrain before the troparion
          if (t.refrain) {
            blocks.push(S(`canon-ode${odeNum}-ref-${i}`, section, 'verse', 'reader',
              t.refrain));
          }
          // Label for theotokia
          const label = t.type === 'theotokion' ? 'Theotokion' : undefined;
          blocks.push(S(`canon-ode${odeNum}-trop-${i}`, section, 'hymn', 'choir',
            t.text || t, { tone: t.tone || tone, source: t.source, label }));
        });
      } else {
        blocks.push(S(`canon-ode${odeNum}-troparia`, section, 'rubric', null,
          `[Troparia of Ode ${odeNum} — from Octoechos, Menaion, and/or Triodion]`));
      }

      // Katavasia
      if (odeData.katavasia) {
        blocks.push(S(`canon-ode${odeNum}-katav`, section, 'hymn', 'choir',
          odeData.katavasia, { tone, label: 'Katavasia' }));
      }

      // Megalynarion for Ode 9 (great feasts)
      if (odeNum === 9 && odeData.megalynarion) {
        blocks.push(S('canon-ode9-mega', section, 'hymn', 'choir',
          odeData.megalynarion, { label: 'Megalynarion' }));
      }
    } else {
      blocks.push(S(`canon-ode${odeNum}-rubric`, section, 'rubric', null,
        `[Ode ${odeNum}]`));
    }

    // Little Litany after Odes 3, 6, 9
    if (odeNum === 3 || odeNum === 6 || odeNum === 9) {
      const llSect = `Little Litany (after Ode ${odeNum})`;
      blocks.push(S(`canon-ll${odeNum}-opening`, llSect, 'prayer', 'deacon', lit.opening));
      blocks.push(S(`canon-ll${odeNum}-response`, llSect, 'response', 'choir', lit.response));
      blocks.push(S(`canon-ll${odeNum}-petition`, llSect, 'prayer', 'deacon', lit.petition));
      blocks.push(S(`canon-ll${odeNum}-comm`, llSect, 'prayer', 'deacon', lit.commemoration));
      blocks.push(S(`canon-ll${odeNum}-comm-r`, llSect, 'response', 'choir', lit.commemorationResponse));
      blocks.push(S(`canon-ll${odeNum}-excl`, llSect, 'prayer', 'priest', lit.exclamation1));
      blocks.push(S(`canon-ll${odeNum}-amen`, llSect, 'response', 'choir', 'Amen.'));
    }

    // Sessional Hymns after Ode 3
    if (odeNum === 3 && canonSpec.sedalenAfterOde3) {
      const sed = canonSpec.sedalenAfterOde3;
      const hymns = Array.isArray(sed) ? sed : [sed];
      hymns.forEach((h, i) => {
        blocks.push(S(`canon-sed3-${i}`, section, 'hymn', 'choir', h.text,
          { tone: h.tone, label: h.label || 'Sessional Hymn', source: h.source }));
      });
    }

    // Kontakion + Ikos after Ode 6
    if (odeNum === 6 && canonSpec.kontakion) {
      blocks.push(S('canon-kontakion', 'Kontakion', 'hymn', 'choir',
        canonSpec.kontakion.text, { tone: canonSpec.kontakion.tone, label: canonSpec.kontakion.label }));
      if (canonSpec.ikos) {
        blocks.push(S('canon-ikos', 'Kontakion', 'hymn', 'reader', canonSpec.ikos.text));
      }
    }

    // Magnificat before Ode 9
    if (odeNum === 8 && !canonSpec.skipMagnificat) {
      const section = 'Magnificat';
      const mag = matinsFixed.magnificat;
      for (let i = 0; i < mag.verses.length; i++) {
        blocks.push(S(`mag-refrain-${i}`, section, 'hymn', 'choir', mag.refrain));
        blocks.push(S(`mag-verse-${i}`, section, 'verse', 'reader', mag.verses[i]));
      }
      blocks.push(S('mag-refrain-final', section, 'hymn', 'choir', mag.refrain));
    }
  }
}

/**
 * Assembles the morning Litany of Completion (parallel to evening litany).
 */
function _assembleMorningLitany(matinsFixed, vespersFixed) {
  const section = 'Morning Litany';
  const lit = matinsFixed.litanies.morning;
  const blocks = [
    makeBlock('ml-opening', section, 'prayer', 'deacon', lit.opening),
    makeBlock('ml-response', section, 'response', 'choir', lit.response),
    makeBlock('ml-petition1', section, 'prayer', 'deacon', lit.petition1),
    makeBlock('ml-p1-response', section, 'response', 'choir', lit.response),
  ];
  lit.petitions.forEach((p, i) => {
    blocks.push(makeBlock(`ml-petition-${i + 2}`, section, 'prayer', 'deacon', p));
    blocks.push(makeBlock(`ml-petition-${i + 2}-response`, section, 'response', 'choir',
      lit.petitionResponse));
  });
  blocks.push(
    makeBlock('ml-commemoration', section, 'prayer', 'deacon', lit.commemoration),
    makeBlock('ml-comm-response', section, 'response', 'choir', lit.commemorationResponse),
    makeBlock('ml-exclamation', section, 'prayer', 'priest', lit.exclamation),
    makeBlock('ml-amen', section, 'response', 'choir', 'Amen.'),
    makeBlock('ml-peace', section, 'prayer', 'priest', vespersFixed.responses.peaceToAll),
    makeBlock('ml-peace-response', section, 'response', 'choir', vespersFixed.responses.andToThySpirit),
    makeBlock('ml-bow', section, 'prayer', 'deacon', 'Let us bow our heads unto the Lord.'),
    makeBlock('ml-bow-response', section, 'response', 'choir', vespersFixed.responses.bowHeads),
    makeBlock('ml-bow-prayer', section, 'prayer', 'priest', matinsFixed.prayers.bowHeadsMorning.text),
    makeBlock('ml-bow-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  assembleVespers,
  assembleLiturgy,
  assemblePresanctified,
  assemblePaschalHours,
  assembleMidnightOffice,
  assemblePaschalMatins,
  assembleBridegroomMatins,
  assemblePassionGospels,
  assembleLamentations,
  assembleVesperalLiturgy,
  assembleRoyalHours,
  assembleMatins,
  resolveSource,
};
