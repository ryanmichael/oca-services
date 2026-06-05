'use strict';

const makeBlock      = require('./_shared/make-block');
const warnings       = require('./_shared/warnings');
const { getPsalter } = require('../oca-psalter');

/**
 * Assembles the Royal Hours service (Nativity Eve, Theophany Eve, Holy Friday).
 * 100% fixed — same every year.
 *
 * @param {Object} f - Parsed royal-hours-fixed.json
 * @returns {ServiceBlock[]}
 */
function assembleRoyalHours(f) {
  warnings.reset();
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
      if (hour.stichera[i].verse) {
        blocks.push(S(`${pfx}-stich-${i}-v`, stiSection, 'verse', 'reader',
          hour.stichera[i].verse));
      }
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

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleRoyalHours;
