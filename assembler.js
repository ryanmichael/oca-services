/**
 * Orthodox Vespers Service Assembler
 *
 * Takes a calendar day entry and assembles an ordered array of rendered blocks
 * suitable for display or API delivery.
 *
 * assembleVespers(calendarDay, fixedTexts, sources) → ServiceBlock[]
 */

// ─── Psalter data (loaded once) ───────────────────────────────────────────────
let _psalter    = null;
let _kathismata = null;
function getPsalter() {
  if (!_psalter) _psalter = require('./fixed-texts/psalter.json');
  return _psalter;
}
function getKathismata() {
  if (!_kathismata) _kathismata = require('./fixed-texts/kathismata.json');
  return _kathismata;
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
  const isGreatVespers = vespers.serviceType === 'greatVespers';

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

  // ── 16. Dismissal ───────────────────────────────────────────────────────────
  blocks.push(...assembleDismissal(fixedTexts));

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
        blocks.push(makeBlock(`k-ps${psalmNum}-hd`, section, 'rubric', null,
          `PSALM ${psalmNum}`));
        const text = psalm.verses.join('\n\n');
        blocks.push(makeBlock(`k-ps${psalmNum}`, section, 'prayer', 'reader', text));
      });
    } else {
      // Psalm 118 verse-range stasis
      const { psalm: psalmNum, fromVerse, toVerse } = stasis;
      const psalm = psalter[psalmNum];
      if (psalm) {
        blocks.push(makeBlock(`k-ps${psalmNum}-${fromVerse}hd`, section, 'rubric', null,
          `PSALM ${psalmNum}:${fromVerse}–${toVerse}`));
        const verses = psalm.verses.slice(fromVerse - 1, toVerse);
        blocks.push(makeBlock(`k-ps${psalmNum}-${fromVerse}`, section, 'prayer', 'reader',
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

  // Add Psalm 129 and 116 verses with stichera interleaved
  const allVerses = [...psalmVerses.psalm129.verses, ...psalmVerses.psalm116.verses];
  for (const verse of allVerses) {
    blocks.push(makeBlock(
      `lic-verse-${verse.number}`, section, 'verse', 'reader',
      `V. (${verse.number}) ${verse.text}`
    ));
    if (verseMap[verse.number]) {
      const { hymn, slot } = verseMap[verse.number];
      blocks.push(makeBlock(
        `lic-hymn-v${verse.number}`, section, 'hymn', 'choir', hymn.text,
        { tone: slot.tone, source: slot.source, label: slot.label, ...(slot.provenance && { provenance: slot.provenance }) }
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
      { tone: glorySpec.tone, source: glorySpec.source, label: glorySpec.label, ...(glorySpec.provenance && { provenance: glorySpec.provenance }) }
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
        { tone: lordICallSpec.now.tone, source: lordICallSpec.now.source, label: lordICallSpec.now.label, ...(lordICallSpec.now.provenance && { provenance: lordICallSpec.now.provenance }) }
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
          idiomelon.text, { tone: idiomelon.tone, source: idiomelon.source, ...(idiomelon.provenance && { provenance: idiomelon.provenance }) }));
      }
      continue;
    }

    const sourceObj = resolveSource(slot.source, slot.key, sources);
    if (!sourceObj) continue;

    if (slot.position === 1) {
      // First sticheron — no preceding verse, just the hymn
      blocks.push(makeBlock(`apost-idiomelon`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label, ...(slot.provenance && { provenance: slot.provenance }) }));
      idiomelon = { text: sourceObj.text, tone: slot.tone, source: slot.source, provenance: slot.provenance };
    } else {
      // Subsequent stichera — verse then hymn
      const verseIndex = slot.position - 2;
      if (verseTexts[verseIndex]) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseTexts[verseIndex]}`));
      }
      blocks.push(makeBlock(`apost-hymn-${i}`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label, ...(slot.provenance && { provenance: slot.provenance }) }));
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
        glorySource.text, { tone: apostichaSpec.glory.tone, source: apostichaSpec.glory.source, label: apostichaSpec.glory.label, ...(apostichaSpec.glory.provenance && { provenance: apostichaSpec.glory.provenance }) }));
    }
  }

  if (apostichaSpec.now) {
    const nowSource = resolveSource(apostichaSpec.now.source, apostichaSpec.now.key, sources);
    blocks.push(makeBlock('apost-now-label', section, 'doxology', null,
      fixedTexts.doxology.nowOnly));
    if (nowSource) {
      blocks.push(makeBlock('apost-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: apostichaSpec.now.tone, source: apostichaSpec.now.source, label: apostichaSpec.now.label, ...(apostichaSpec.now.provenance && { provenance: apostichaSpec.now.provenance }) }));
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
      { tone: slot.tone, source: slot.source || tropariaSpec.source, label: sourceObj.label, ...(slot.provenance && { provenance: slot.provenance }) }
    ));
  }
  return blocks;
}

function assembleDismissal(fixedTexts) {
  const section = 'Dismissal';
  const d = fixedTexts.dismissal;
  return [
    makeBlock('dis-wisdom', section, 'prayer', 'deacon', d.wisdom),
    makeBlock('dis-father-bless', section, 'response', 'choir', d.fatherBless),
    makeBlock('dis-blessed', section, 'prayer', 'priest', d.blessedHeWhoIs),
    makeBlock('dis-confirm', section, 'response', 'choir', d.confirm),
    makeBlock('dis-theotokos', section, 'prayer', 'priest', d.mostHolyTheotokos),
    makeBlock('dis-magnification', section, 'response', 'choir', d.magnification),
    makeBlock('dis-glory-christ', section, 'prayer', 'priest', d.gloryChrist),
    makeBlock('dis-final', section, 'response', 'choir', d.finalResponse),
    makeBlock('dis-proper', section, 'prayer', 'priest', '[Proper Dismissal for the day]'),
    makeBlock('dis-amen', section, 'response', 'choir', 'Amen.'),
  ];
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

  // 3. First Antiphon + Little Litany
  blocks.push(..._litTypicalAntiphon1(liturgyFixed));
  blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));

  // 4. Second Antiphon + Only-Begotten Son + Little Litany
  blocks.push(..._litTypicalAntiphon2(liturgyFixed));
  blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
    liturgyFixed['only-begotten-son']));
  blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));

  // 5. Beatitudes (Third Antiphon)
  blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed));

  // 6. Small Entrance
  blocks.push(..._litSmallEntrance(liturgyFixed));

  // 7. Entrance Hymn
  blocks.push(..._litEntranceHymn(spec.entranceHymn));

  // 8. Troparia
  blocks.push(..._litTroparia(spec.troparia));

  // 9. Kontakia
  blocks.push(..._litKontakia(spec.kontakia));

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

  // 17. Litany for the Catechumens
  blocks.push(..._litCatechumens(liturgyFixed));

  // 18–19. Litanies of the Faithful
  blocks.push(..._litLitaniesFaithful(liturgyFixed));

  // ── LITURGY OF THE FAITHFUL ────────────────────────────────────────────────

  // 19. Cherubic Hymn
  blocks.push(makeBlock('cherubic-hymn', 'Cherubic Hymn', 'hymn', 'choir',
    liturgyFixed['cherubic-hymn']));

  // 20. Great Entrance
  blocks.push(..._litGreatEntrance(liturgyFixed));

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

  // 26. Pre-Communion (Bow prayer + Elevation + Communion prayer)
  blocks.push(..._litPreCommunion(isBasil, liturgyFixed));

  // 27. Communion Hymn
  blocks.push(..._litCommunionHymn(spec.communionHymn));

  // 28. Post-Communion Blessing
  blocks.push(..._litPostCommunion(spec, liturgyFixed));

  // 29. Hymn of Thanksgiving
  blocks.push(makeBlock('let-our-mouths', 'Hymn of Thanksgiving', 'hymn', 'choir',
    liturgyFixed['let-our-mouths']));

  // 30. Litany of Thanksgiving
  blocks.push(..._litThanksgiving(isBasil, liturgyFixed));

  // 31. Prayer behind the Ambon
  const ambonKey = isBasil ? 'prayer-ambon-basil' : 'prayer-ambon-chrysostom';
  blocks.push(makeBlock('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    liturgyFixed[ambonKey]));

  // 32. Blessed be the Name
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 33. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 34. Dismissal Troparia
  blocks.push(..._litDismissalTroparia(isBasil, liturgyFixed));

  // 35. Dismissal
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
  lit.petitions.forEach((p, i) =>
    blocks.push(makeBlock(`gl-p${i}`, section, 'prayer', 'deacon', p)));
  blocks.push(
    makeBlock('gl-commemoration', section, 'prayer',   'deacon', lit.commemoration),
    makeBlock('gl-comm-resp',     section, 'response', 'choir',  lit.commemorationResponse),
    makeBlock('gl-exclamation',   section, 'prayer',   'priest', lit.exclamation),
    makeBlock('gl-amen',          section, 'response', 'choir',  lit.amen),
  );
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

  // Paired verses (indices 1–10) with troparia
  // "Glory..." (index 11) and "Now and ever..." (index 12) are the doxology pair
  // We map the 10 "beatitude proper" verses to the assigned troparia, filling top-down
  const tropariaPlaceholders = [];
  for (const group of beatitudesSpec.troparia) {
    for (let n = 0; n < (group.count || 1); n++) {
      tropariaPlaceholders.push({
        tone:   group.tone,
        label:  group.label,
        source: group.source,
        text:   `[${group.label} — troparion ${n + 1} of ${group.count}. Text to be sourced.]`,
      });
    }
  }

  // Verses 1–10 (indices 1–10 in the array) are the paired beatitude verses
  const pairedVerses = verses.slice(1, 11); // "Blessed are the poor..." through "Rejoice and be glad..."
  pairedVerses.forEach((verse, i) => {
    blocks.push(makeBlock(`beat-v${i + 1}`, section, 'verse', 'choir', verse));
    const troparion = tropariaPlaceholders[i];
    if (troparion) {
      blocks.push(makeBlock(`beat-t${i + 1}`, section, 'hymn', 'choir', troparion.text,
        { tone: troparion.tone, label: troparion.label }));
    }
  });

  // Glory doxology
  blocks.push(makeBlock('beat-glory', section, 'doxology', null, verses[11]));
  // Glory troparion (last troparion if more than 10, or use tropariaPlaceholders[10])
  if (tropariaPlaceholders.length > 10) {
    const g = tropariaPlaceholders[10];
    blocks.push(makeBlock('beat-glory-t', section, 'hymn', 'choir', g.text,
      { tone: g.tone, label: g.label }));
  }

  // Now and ever
  blocks.push(makeBlock('beat-now', section, 'doxology', null, verses[12]));
  // Theotokion (last troparion if more than 11, or use tropariaPlaceholders[11])
  if (tropariaPlaceholders.length > 11) {
    const t = tropariaPlaceholders[11];
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
    if (k.connector) blocks.push(makeBlock(`kont-conn-${i}`, section, 'doxology', null, k.connector));
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

  // Bishop blessing (always precedes the Epistle)
  blocks.push(makeBlock('tris-bishop', section, 'prayer', 'priest',
    'Peace be unto all.'));
  blocks.push(makeBlock('tris-bishop-resp', section, 'response', 'choir',
    'And to thy spirit.'));
  blocks.push(makeBlock('tris-reader-rubric', section, 'prayer', 'reader',
    'Bless, master.'));
  blocks.push(makeBlock('tris-bless', section, 'prayer', 'priest',
    'Blessed is He that cometh in the name of the Lord.'));
  blocks.push(makeBlock('tris-bless-resp', section, 'response', 'choir',
    'Blessed is He that cometh in the name of the Lord.'));
  blocks.push(makeBlock('tris-bless2', section, 'prayer', 'priest',
    'God is the Lord and hath appeared unto us.'));

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
  return [
    makeBlock('ep-wisdom',  section, 'prayer',  'deacon', 'Wisdom!'),
    makeBlock('ep-reader',  section, 'prayer',  'reader',
      `The reading from the ${epistle.book || 'Epistle'}.`),
    makeBlock('ep-attend',  section, 'prayer',  'deacon', 'Let us attend.'),
    makeBlock('ep-text',    section, 'prayer',  'reader',
      `[${epistle.display || `${epistle.book} ${epistle.pericope}`}]`),
    makeBlock('ep-peace',   section, 'prayer',  'priest', 'Peace be unto thee.'),
    makeBlock('ep-peace-r', section, 'response', 'choir',  'And to thy spirit.'),
  ];
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
  return [
    makeBlock('gos-deacon',  section, 'prayer',  'deacon', 'Wisdom! Arise! Let us hear the Holy Gospel.'),
    makeBlock('gos-peace',   section, 'prayer',  'priest', 'Peace be unto all.'),
    makeBlock('gos-peace-r', section, 'response', 'choir', 'And to thy spirit.'),
    makeBlock('gos-rubric',  section, 'prayer',  'priest',
      `The reading of the Holy Gospel according to ${gospel.book}.`),
    makeBlock('gos-attend',  section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'),
    makeBlock('gos-text',    section, 'prayer',  'reader',
      `[${gospel.display || `${gospel.book} ${gospel.pericope}`}]`),
    makeBlock('gos-end',     section, 'response', 'choir', 'Glory to Thee, O Lord, glory to Thee.'),
  ];
}

function _litAugmentedLitany(f) {
  const section = 'Litany of Fervent Supplication';
  const lit = f['augmented-litany'];
  const blocks = [
    makeBlock('al-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('al-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) =>
    blocks.push(makeBlock(`al-p${i}`, section, 'prayer', 'deacon', p)));
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

function _litCatechumens(f) {
  const section = 'Litany for the Catechumens';
  const lit = f['litany-catechumens'];
  const blocks = [
    makeBlock('cat-opening',  section, 'prayer',   'deacon', lit.opening),
    makeBlock('cat-response', section, 'response', 'choir',  lit.response),
  ];
  lit.petitions.forEach((p, i) =>
    blocks.push(makeBlock(`cat-p${i}`, section, 'prayer', 'deacon', p)));
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
  lit.petitions.forEach((p, i) =>
    blocks.push(makeBlock(`sup-p${i}`, section, 'prayer', 'deacon', p)));
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
  if (megalynarionSpec === 'basil-liturgy' || isBasil) {
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
    makeBlock('pc-prayer',      section, 'prayer',  'all',    pc['prayer-chrysostom']),
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

function _litDismissalTroparia(isBasil, f) {
  const section  = 'Dismissal Troparia';
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

  const opening = dismissalSpec.opening === 'sunday'
    ? 'May He Who rose from the dead, Christ our true God,'
    : 'May Christ our true God,';

  const closing = `through the prayers of His most pure Mother; of ${liturgySaintName};${saintsStr ? ` of ${saintsStr};` : ''} and of all the saints, have mercy on us and save us, forasmuch as He is good and loveth mankind.`;

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
  return { id, section, type, speaker, text, ...extras };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  assembleVespers,
  assembleLiturgy,
  resolveSource,
};
