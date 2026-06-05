'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

/**
 * Paschal Matins — the resurrectional matins service of Pascha, sung in
 * the small hours of Pascha morning after the Midnight Office and the
 * procession around the church. 100% fixed content from
 * fixed-texts/paschal-matins-fixed.json.
 */
function assemblePaschalMatins(f) {
  warnings.reset();
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

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assemblePaschalMatins;
