'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

/**
 * Assembles the Paschal Midnight Office, sung before Paschal Matins on the
 * eve of Pascha. 100% fixed content; texts come from
 * fixed-texts/midnight-office-fixed.json.
 *
 * @param {Object} f - Parsed midnight-office-fixed.json
 * @returns {ServiceBlock[]}
 */
function assembleMidnightOffice(f) {
  warnings.reset();
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

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleMidnightOffice;
