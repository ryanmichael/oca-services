'use strict';

const makeBlock                           = require('./_shared/make-block');
const warnings                            = require('./_shared/warnings');
const { getVespersFixed, getMatinsFixed } = require('./_shared/fixed-text-loader');
const { getPsalter, psalmBody }           = require('../oca-psalter');
const _emitLittleLitany                   = require('./common-parts/emit-little-litany');

/**
 * Matins of Great Friday — The Twelve Passion Gospels. Served on Holy
 * Thursday evening. Twelve gospel readings interspersed with antiphons,
 * sessional hymns, beatitudes, prokeimenon, canon, lauds, and aposticha.
 * Content lives in fixed-texts/passion-gospels-fixed.json.
 */
function assemblePassionGospels(f) {
  warnings.reset();
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

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assemblePassionGospels;
