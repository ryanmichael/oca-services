'use strict';

const makeBlock                              = require('./_shared/make-block');
const warnings                               = require('./_shared/warnings');
const { getPsalter, psalmBody, resolveVerse } = require('../oca-psalter');
const { assembleGreatLitany }                 = require('./vespers-parts/litanies');

/**
 * Matins of Great Saturday — The Lamentations. Served on Holy Friday
 * evening. The three Praises (Stases) sung over the Epitaphion in the
 * center of the church, then Resurrectional Evlogetaria, Canon, and the
 * Burial procession around the church. Content from
 * fixed-texts/lamentations-fixed.json with shared texts from
 * vespers-fixed.json.
 */
function assembleLamentations(f, vespersFixed) {
  warnings.reset();
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

  // ── Great Litany ───────────────────────────────────────────────────────────
  blocks.push(...assembleGreatLitany(vespersFixed));

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
  // Ps 118:1-72 across 73 verse pairs (verse 48 split into two)
  {
    const section = 'Stasis 1';
    blocks.push(S('s1-heading', section, 'rubric', null,
      `Tone ${f.stasis1.tone}. "${f.stasis1.refrain.substring(0, 40)}…"`));
    for (let i = 0; i < f.stasis1.verses.length; i++) {
      const v = f.stasis1.verses[i];
      // Map array index to Ps 118 verse index (0-based into psalmBody)
      // Indices 0-47 → Ps verses 0-47; index 48 → split (use inline);
      // indices 49-72 → Ps verses 48-71. Glory/Now entries have no psalm mapping.
      let psIdx = null;
      if (i <= 47) psIdx = i;
      else if (i === 48) psIdx = null; // second half of split Ps 118:48
      else if (i <= 72) psIdx = i - 1;
      // else: Glory/Now — use inline text
      const resolved = psIdx !== null
        ? resolveVerse(118, psIdx, v.psalm)
        : { text: v.psalm, provenance: 'inline' };
      if (resolved.text) {
        blocks.push(S(`s1-ps-${i}`, section, 'verse', 'reader', resolved.text,
          resolved.provenance !== 'inline' ? { provenance: resolved.provenance } : undefined));
      }
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
  // Ps 118:73-131 across 59 verse pairs
  {
    const section = 'Stasis 2';
    blocks.push(S('s2-heading', section, 'rubric', null,
      `Tone ${f.stasis2.tone}. "${f.stasis2.refrain.substring(0, 45)}…"`));
    for (let i = 0; i < f.stasis2.verses.length; i++) {
      const v = f.stasis2.verses[i];
      // Stasis 2 index i → Ps 118 verse 72+i (0-based into psalmBody)
      // Last 2 entries are Glory/Now — no psalm mapping
      const isGloryNow = i >= f.stasis2.verses.length - 2;
      const psIdx = isGloryNow ? null : 72 + i;
      const resolved = psIdx !== null
        ? resolveVerse(118, psIdx, v.psalm)
        : { text: v.psalm, provenance: 'inline' };
      if (resolved.text) {
        blocks.push(S(`s2-ps-${i}`, section, 'verse', 'reader', resolved.text,
          resolved.provenance !== 'inline' ? { provenance: resolved.provenance } : undefined));
      }
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
  // Ps 118:132-176 across 45 verse pairs
  {
    const section = 'Stasis 3';
    blocks.push(S('s3-heading', section, 'rubric', null,
      `Tone ${f.stasis3.tone}. "${f.stasis3.refrain.substring(0, 45)}…"`));
    for (let i = 0; i < f.stasis3.verses.length; i++) {
      const v = f.stasis3.verses[i];
      // Stasis 3 index i → Ps 118 verse 131+i (0-based into psalmBody)
      // Last 2 entries are Glory/Now — no psalm mapping
      const isGloryNow = i >= f.stasis3.verses.length - 2;
      const psIdx = isGloryNow ? null : 131 + i;
      const resolved = psIdx !== null
        ? resolveVerse(118, psIdx, v.psalm)
        : { text: v.psalm, provenance: 'inline' };
      if (resolved.text) {
        blocks.push(S(`s3-ps-${i}`, section, 'verse', 'reader', resolved.text,
          resolved.provenance !== 'inline' ? { provenance: resolved.provenance } : undefined));
      }
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

  // ── Canon of Holy Saturday (Tone 6) ────────────────────────────────────────
  // Full canon text sourced from midnight-office-fixed.json (same canon)
  {
    const moFixed = require('../fixed-texts/midnight-office-fixed.json');
    const canon = moFixed.canon;
    const odes = ['ode1', 'ode3', 'ode4', 'ode5', 'ode6', 'ode7', 'ode8', 'ode9'];
    const odeNames = { ode1:'Ode I', ode3:'Ode III', ode4:'Ode IV', ode5:'Ode V',
                       ode6:'Ode VI', ode7:'Ode VII', ode8:'Ode VIII', ode9:'Ode IX' };

    for (const ode of odes) {
      const o = canon[ode];
      const sec = `Canon — ${odeNames[ode]}`;

      blocks.push(S(`${ode}-irm`, sec, 'hymn', 'choir', o.irmos, { tone: 6, label: 'Irmos' }));

      for (let i = 0; i < o.troparia.length; i++) {
        const t = o.troparia[i];
        blocks.push(S(`${ode}-ref-${i}`, sec, 'verse', 'reader', t.refrain));
        blocks.push(S(`${ode}-trop-${i}`, sec, 'hymn', 'choir', t.text, { tone: 6 }));
      }

      blocks.push(S(`${ode}-kat`, sec, 'hymn', 'choir', o.katavasia, { tone: 6, label: 'Katavasia' }));

      // Sessional hymn after Ode III
      if (ode === 'ode3' && canon.sessionalHymn) {
        blocks.push(S('sess-hymn', 'Sessional Hymn', 'hymn', 'choir', canon.sessionalHymn.text,
          { tone: canon.sessionalHymn.tone }));
      }

      // Kontakion & Ikos after Ode VI
      if (ode === 'ode6') {
        blocks.push(S('kontakion', 'Kontakion', 'hymn', 'choir', f.canon.kontakion.text,
          { tone: f.canon.kontakion.tone }));
        blocks.push(S('ikos', 'Kontakion', 'hymn', 'reader', f.canon.ikos.text));
      }
    }
  }

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
    blocks.push(S('ep-text', section, 'prayer', 'reader', ep.text, { density: 'compact' }));
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

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleLamentations;
