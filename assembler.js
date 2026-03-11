/**
 * Orthodox Vespers Service Assembler
 * 
 * Takes a calendar day entry and assembles an ordered array of rendered blocks
 * suitable for display or API delivery.
 * 
 * assembleVespers(calendarDay, fixedTexts, sources) → ServiceBlock[]
 */

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
function assembleVespers(calendarDay, fixedTexts, sources) {
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

  // All other cases: kathisma is read (not sung); texts not yet stored.
  return [
    makeBlock('kathisma-rubric', section, 'rubric', null,
      `KATHISMA ${kathNum}`),
    makeBlock('kathisma-reading', section, 'prayer', 'reader',
      `[Kathisma ${kathNum} — the appointed section of the Psalter for ${dayOfWeek} evening]`),
  ];
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
        { tone: slot.tone, source: slot.source, label: slot.label }
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
      { tone: glorySpec.tone, source: glorySpec.source, label: glorySpec.label }
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
        { tone: lordICallSpec.now.tone, source: lordICallSpec.now.source, label: lordICallSpec.now.label }
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
    return null;
  }
  // Navigate dot-notation path through the source object
  // e.g. "lent.soulSaturday2.lordICall.glory" → source.lent.soulSaturday2.lordICall.glory
  // But our files are keyed by their own key property and stored differently.
  // For now, treat the source as the already-resolved document for the day.
  return deepGet(source, keyPath);
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
      }
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
  const verseTexts = (isGreatVespersSaturday && !isLentenSaturday)
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
          idiomelon.text, { tone: idiomelon.tone, source: idiomelon.source }));
      }
      continue;
    }

    const sourceObj = resolveSource(slot.source, slot.key, sources);
    if (!sourceObj) continue;

    if (slot.position === 1) {
      // First sticheron — no preceding verse, just the hymn
      blocks.push(makeBlock(`apost-idiomelon`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label }));
      idiomelon = { text: sourceObj.text, tone: slot.tone, source: slot.source };
    } else {
      // Subsequent stichera — verse then hymn
      const verseIndex = slot.position - 2;
      if (verseTexts[verseIndex]) {
        blocks.push(makeBlock(`apost-verse-${i}`, section, 'verse', 'reader',
          `V. ${verseTexts[verseIndex]}`));
      }
      blocks.push(makeBlock(`apost-hymn-${i}`, section, 'hymn', 'choir',
        sourceObj.text, { tone: slot.tone, source: slot.source, label: slot.label }));
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
        glorySource.text, { tone: apostichaSpec.glory.tone, label: apostichaSpec.glory.label }));
    }
  }

  if (apostichaSpec.now) {
    const nowSource = resolveSource(apostichaSpec.now.source, apostichaSpec.now.key, sources);
    blocks.push(makeBlock('apost-now-label', section, 'doxology', null,
      fixedTexts.doxology.nowOnly));
    if (nowSource) {
      blocks.push(makeBlock('apost-now-hymn', section, 'hymn', 'choir',
        nowSource.text, { tone: apostichaSpec.now.tone, label: apostichaSpec.now.label }));
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
      { tone: slot.tone, label: sourceObj.label }
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
  resolveSource,
};
