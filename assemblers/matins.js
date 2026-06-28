'use strict';

const makeBlock                              = require('./_shared/make-block');
const warnings                               = require('./_shared/warnings');
const { getPsalter, psalmBody }              = require('../oca-psalter');

const { assembleOpening }                    = require('./vespers-parts/opening');
const { assembleGreatLitany,
        assembleAugmentedLitany }            = require('./vespers-parts/litanies');
const { assembleKathismaReading }            = require('./vespers-parts/kathisma');
const assembleTroparia                       = require('./common-parts/troparia');
const assembleDismissal                      = require('./common-parts/dismissal');

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
function assembleMatins(calendarDay, matinsFixed, vespersFixed, sources, opts = {}) {
  warnings.reset();
  const { rubrics } = opts;
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
    blocks.push(...assembleOpening(vespersFixed, false, rubrics));
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
  } else if (spec.feastTroparion && spec.troparion) {
    // Afterfeast pattern: feast×2 → Glory: saint → Both-now: feast×1
    const section = 'Troparia';
    const ft = spec.feastTroparion;
    const st = spec.troparion;
    blocks.push(S('trop-1', section, 'hymn', 'choir', ft.text, { tone: ft.tone, label: ft.label }));
    blocks.push(S('trop-2', section, 'hymn', 'choir', ft.text, { tone: ft.tone }));
    blocks.push(S('trop-glory', section, 'doxology', null, vespersFixed.doxology.gloryOnly));
    blocks.push(S('trop-saint', section, 'hymn', 'choir', st.text, { tone: st.tone, label: st.label }));
    blocks.push(S('trop-now', section, 'doxology', null, vespersFixed.doxology.nowOnly));
    blocks.push(S('trop-3', section, 'hymn', 'choir', ft.text, { tone: ft.tone }));
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
      const magTone = mag.tone;
      blocks.push(S('magnification', section, 'hymn', 'choir', mag.refrain, { tone: magTone, label: 'Magnification' }));
      // Accept either `psalmVerses: [{ text, ref }]` (Annunciation-style) or
      // `verses: ["...", "..."]` (Pentecost/Ascension/Dormition-style).
      const verses = mag.psalmVerses
        ? mag.psalmVerses.map(v => v.text || v)
        : (mag.verses || []);
      for (let i = 0; i < verses.length; i++) {
        blocks.push(S(`mag-v${i}`, section, 'verse', 'reader', verses[i]));
        blocks.push(S(`mag-r${i}`, section, 'hymn', 'choir', mag.refrain, { tone: magTone }));
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

  // ── 10b. Sessional hymn after Polyeleios (Triodion overlays, etc.) ─────────
  if (spec.sessionalHymnAfterPolyeleios) {
    const s = spec.sessionalHymnAfterPolyeleios;
    const section = 'Sessional Hymn (after Polyeleios)';
    if (s.label) {
      blocks.push(S('shap-label', section, 'rubric', null, s.label));
    }
    (s.stichera || []).forEach((st, i) => {
      if (st.verse) {
        blocks.push(S(`shap-v${i}`, section, 'verse', 'reader', `V. ${st.verse}`));
      }
      blocks.push(S(`shap-${i}`, section, 'hymn', 'choir', st.text,
        { tone: st.tone, _source: s._source }));
    });
    if (s.glory) {
      blocks.push(S('shap-glory', section, 'doxology', null, vespersFixed.doxology.gloryOnly));
      blocks.push(S('shap-glory-hymn', section, 'hymn', 'choir', s.glory.text,
        { tone: s.glory.tone, _source: s._source }));
    }
    if (s.bothNow) {
      blocks.push(S('shap-bn', section, 'doxology', null, vespersFixed.doxology.nowOnly));
      blocks.push(S('shap-bn-hymn', section, 'hymn', 'choir', s.bothNow.text,
        { tone: s.bothNow.tone, label: s.bothNow.label || s.bothNow._label, _source: s._source }));
    }
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

  // ── 12. Having Beheld the Resurrection ─────────────────────────────────────
  // Default: Sundays sing it, except great feasts of the Lord (which replace
  // the resurrectional hymnography). Weekday feasts can opt back in via
  // `spec.includeHavingBeheld` (e.g., Ascension matins per OCA rubric).
  const renderHavingBeheld = spec.includeHavingBeheld != null
    ? spec.includeHavingBeheld
    : (isSunday && !spec.isGreatFeastOfLord);
  if (renderHavingBeheld) {
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

    // Glory + Doxastikon
    if (laudsSpec.doxastikon) {
      // If a Both-now theotokion follows, emit Glory-only; otherwise Glory-Now.
      const gloryText = laudsSpec.theotokion
        ? vespersFixed.doxology.gloryOnly
        : vespersFixed.doxology.gloryNow;
      blocks.push(S('lauds-glory', section, 'doxology', null, gloryText));
      blocks.push(S('lauds-doxastikon', section, 'hymn', 'choir', laudsSpec.doxastikon.text,
        { tone: laudsSpec.doxastikon.tone, label: laudsSpec.doxastikon.author, _source: laudsSpec.doxastikon._source }));
    }

    // Both now + Theotokion (e.g. Cross Sunday's "Most blessed art thou…")
    if (laudsSpec.theotokion) {
      blocks.push(S('lauds-bothnow', section, 'doxology', null, vespersFixed.doxology.nowOnly));
      blocks.push(S('lauds-theotokion', section, 'hymn', 'choir', laudsSpec.theotokion.text,
        { tone: laudsSpec.theotokion.tone, label: laudsSpec.theotokion.label, _source: laudsSpec.theotokion._source }));
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

    // ── Veneration stichera (Elevation of the Cross procession, etc.) ──
    // After the Great Doxology and the festal troparion, when the clergy
    // and faithful venerate (e.g. the Cross on Sep 14), a sequence of
    // idiomela is sung during the procession.
    if (spec.venerationStichera) {
      const v = spec.venerationStichera;
      const section = v.section || 'Veneration';
      if (v.rubric) {
        blocks.push(S('ven-rubric', section, 'rubric', null, v.rubric));
      }
      (v.stichera || []).forEach((s, i) => {
        blocks.push(S(`ven-${i}`, section, 'hymn', 'choir', s.text,
          { tone: s.tone, label: s.label || s.author, _source: s._source }));
      });
      if (v.glory) {
        blocks.push(S('ven-glory', section, 'doxology', null,
          vespersFixed.doxology.gloryNow));
        blocks.push(S('ven-glory-hymn', section, 'hymn', 'choir', v.glory.text,
          { tone: v.glory.tone, label: v.glory.label || v.glory.author, _source: v.glory._source }));
      }
      if (v.closingRubric) {
        blocks.push(S('ven-closing', section, 'rubric', null, v.closingRubric));
      }
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
        // Split Glory + Now when a separate `now` slot is present (saint's
        // doxastikon at Glory + Octoechos Theotokion at Now). Otherwise the
        // single glory slot carries the combined "Glory ... now and ever".
        const gloryText = ap.now ? vespersFixed.doxology.gloryOnly : vespersFixed.doxology.gloryNow;
        blocks.push(S('apost-glory', section, 'doxology', null, gloryText));
        blocks.push(S('apost-glory-hymn', section, 'hymn', 'choir', ap.glory.text,
          { tone: ap.glory.tone, source: ap.glory.source, label: ap.glory.author }));
      }
      if (ap.now) {
        blocks.push(S('apost-now', section, 'doxology', null, vespersFixed.doxology.nowOnly));
        blocks.push(S('apost-now-hymn', section, 'hymn', 'choir', ap.now.text,
          { tone: ap.now.tone, source: ap.now.source, label: ap.now.author || ap.now.label || 'Theotokion' }));
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

  blocks._warnings = warnings.get();
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
      // Multi-canon feast detection: irmos2 (and optionally irmos3) present
      // AND troparia explicitly partitioned via t.canon === 'secondCanon' (or
      // 'thirdCanon'). In that case, render in groups (Irmos N → N-canon
      // troparia) rather than the flat single-canon layout.
      const tropList = odeData.troparia || [];
      const isTwoCanonOde = !!odeData.irmos2
        && tropList.some(t => t.canon === 'secondCanon');
      const isThreeCanonOde = isTwoCanonOde
        && !!odeData.irmos3
        && tropList.some(t => t.canon === 'thirdCanon');

      // Per-troparion render helper (refrain + hymn block).
      const emitTroparion = (t, i) => {
        if (t.refrain) {
          blocks.push(S(`canon-ode${odeNum}-ref-${i}`, section, 'verse', 'reader',
            t.refrain));
        }
        const label = t.type === 'theotokion' ? 'Theotokion' : undefined;
        blocks.push(S(`canon-ode${odeNum}-trop-${i}`, section, 'hymn', 'choir',
          t.text || t, { tone: t.tone || tone, source: t.source, label }));
      };

      if (isTwoCanonOde) {
        // ── First Canon ─────────────────────────────────────────────────────
        blocks.push(S(`canon-ode${odeNum}-c1-hdr`, section, 'rubric', null,
          `Ode ${odeNum} — First Canon`));
        blocks.push(S(`canon-ode${odeNum}-irmos`, section, 'hymn', 'choir',
          odeData.irmos, { tone, label: 'Irmos' }));
        tropList.forEach((t, i) => {
          if (t.canon === 'secondCanon' || t.canon === 'thirdCanon') return;
          emitTroparion(t, i);
        });

        // ── Second Canon ────────────────────────────────────────────────────
        blocks.push(S(`canon-ode${odeNum}-c2-hdr`, section, 'rubric', null,
          `Ode ${odeNum} — Second Canon`));
        const tone2 = odeData.tone2 || canonSpec._secondCanonTone || tone;
        blocks.push(S(`canon-ode${odeNum}-irmos2`, section, 'hymn', 'choir',
          odeData.irmos2, { tone: tone2, label: 'Irmos' }));
        tropList.forEach((t, i) => {
          if (t.canon !== 'secondCanon') return;
          emitTroparion(t, i);
        });

        // ── Third Canon (rare — Nov 23, three simultaneous canons) ──────────
        if (isThreeCanonOde) {
          blocks.push(S(`canon-ode${odeNum}-c3-hdr`, section, 'rubric', null,
            `Ode ${odeNum} — Third Canon`));
          const tone3 = odeData.tone3 || canonSpec._thirdCanonTone || tone;
          blocks.push(S(`canon-ode${odeNum}-irmos3`, section, 'hymn', 'choir',
            odeData.irmos3, { tone: tone3, label: 'Irmos' }));
          tropList.forEach((t, i) => {
            if (t.canon !== 'thirdCanon') return;
            emitTroparion(t, i);
          });
        }
      } else {
        // ── Single canon (existing layout) ──────────────────────────────────
        // Irmos
        if (odeData.irmos) {
          blocks.push(S(`canon-ode${odeNum}-irmos`, section, 'hymn', 'choir',
            odeData.irmos, { tone, label: `Ode ${odeNum} — Irmos` }));
        }
        // Second-canon irmos (e.g., Pentecost: 1st canon Tone 7 + 2nd canon Tone 4)
        // Kept for back-compat with data that supplies irmos2 but no per-troparion
        // canon tags (Pentecost today supplies only irmoi, no troparia).
        if (odeData.irmos2) {
          const tone2 = odeData.tone2 || canonSpec._secondCanonTone || tone;
          blocks.push(S(`canon-ode${odeNum}-irmos2`, section, 'hymn', 'choir',
            odeData.irmos2, { tone: tone2, label: `Ode ${odeNum} — Irmos (2nd Canon)` }));
        }

        // Troparia (if provided)
        if (odeData.troparia) {
          let prevCanon = null;
          odeData.troparia.forEach((t, i) => {
            // Insert canon-type heading when switching between canons
            // (Sunday Matins resurrection / cross-resurrection / theotokos).
            if (t.canon && t.canon !== prevCanon) {
              if (t.canon === 'crossResurrection') {
                blocks.push(S(`canon-ode${odeNum}-cross-hdr`, section, 'rubric', null,
                  'Canon of the Cross and Resurrection'));
              } else if (t.canon === 'theotokos') {
                blocks.push(S(`canon-ode${odeNum}-theotokos-hdr`, section, 'rubric', null,
                  'Canon of the Theotokos'));
              } else if (t.canon === 'crossOfTheStudite') {
                blocks.push(S(`canon-ode${odeNum}-cross-studite-hdr`, section, 'rubric', null,
                  'Canon of the Cross by St Theodore the Studite'));
                if (t._irmos) {
                  blocks.push(S(`canon-ode${odeNum}-cross-studite-irmos`, section, 'hymn', 'choir',
                    t._irmos, { tone: t._irmosTone || tone, label: 'Irmos' }));
                }
              }
              prevCanon = t.canon;
            }
            emitTroparion(t, i);
          });
        } else {
          blocks.push(S(`canon-ode${odeNum}-troparia`, section, 'rubric', null,
            `[Troparia of Ode ${odeNum} — from Octoechos, Menaion, and/or Triodion]`));
        }
      }

      // Katavasia (may have its own tone — e.g. Ascension uses Tone 5 canon
      // but Tone 4 katavasiai borrowed from the 2nd Pentecost canon)
      if (odeData.katavasia) {
        const katTone = odeData.katavasiaTone || canonSpec._katavasiaTone || tone;
        blocks.push(S(`canon-ode${odeNum}-katav`, section, 'hymn', 'choir',
          odeData.katavasia, { tone: katTone, label: 'Katavasia' }));
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

    // Second saint's kontakion at the after-Ode-3 slot (joint commemorations
    // sometimes place each saint's kontakion at a different ode — e.g. 06-06
    // Bessarion + Hilarion places Hilarion's kontakion here and Bessarion's
    // at the standard after-Ode-6 slot).
    if (odeNum === 3 && canonSpec.kontakionAfterOde3) {
      const k = canonSpec.kontakionAfterOde3;
      blocks.push(S('canon-kontakion-ode3', 'Kontakion', 'hymn', 'choir',
        k.text, { tone: k.tone, label: k.label }));
      if (k.ikos) {
        // Accept both authored shapes: bare string or { text: ... } object.
        const ikosText = typeof k.ikos === 'string' ? k.ikos : k.ikos.text;
        blocks.push(S('canon-ikos-ode3', 'Kontakion', 'hymn', 'reader', ikosText));
      }
    }

    // Kontakion + Ikos after Ode 6
    if (odeNum === 6 && canonSpec.kontakion) {
      blocks.push(S('canon-kontakion', 'Kontakion', 'hymn', 'choir',
        canonSpec.kontakion.text, { tone: canonSpec.kontakion.tone, label: canonSpec.kontakion.label }));
      if (canonSpec.ikos) {
        const ikosText = typeof canonSpec.ikos === 'string' ? canonSpec.ikos : canonSpec.ikos.text;
        blocks.push(S('canon-ikos', 'Kontakion', 'hymn', 'reader', ikosText));
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
    makeBlock('ml-bow-prayer', section, 'prayer', 'priest', matinsFixed.prayers.bowHeadsMorning.prayer),
    makeBlock('ml-bow-excl', section, 'prayer', 'priest', matinsFixed.prayers.bowHeadsMorning.exclamation),
    makeBlock('ml-bow-amen', section, 'response', 'choir', 'Amen.'),
  );
  return blocks;
}

module.exports = assembleMatins;
