'use strict';

const makeBlock                           = require('./_shared/make-block');
const warnings                            = require('./_shared/warnings');
const { getVespersFixed, getMatinsFixed } = require('./_shared/fixed-text-loader');
const { getPsalter, psalmBody }           = require('../oca-psalter');
const { assembleKathismaReading }         = require('./vespers-parts/kathisma');
const _emitLittleLitany                   = require('./common-parts/emit-little-litany');

/**
 * Bridegroom Matins — served Mon/Tue/Wed evenings of Holy Week.
 * Each night has its own set of variable hymns; the structural skeleton
 * is fixed. Content lives in fixed-texts/bridegroom-matins-fixed.json.
 */
function assembleBridegroomMatins(f, night) {
  warnings.reset();
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
    const eph = require('../fixed-texts/presanctified-fixed.json')['prayer-of-st-ephrem'];
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

  blocks._warnings = warnings.get();
  return blocks;
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

module.exports = assembleBridegroomMatins;
