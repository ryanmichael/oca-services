'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

/**
 * Akathist of Thanksgiving ("Glory to God for All Things").
 *
 * 100% fixed. The order is the St John of Damascus (Tyler) choir booklet:
 * Kontakion 1, Ikos 1 … Ikos 12, Kontakion 13, then Ikos 1 and Kontakion 1
 * repeated. Each Ikos is its prose, then the "Glory to Thee for…" acclamations
 * one per block, then the people's refrain; each Kontakion ends on its refrain
 * ("Alleluia!", or "Glory to Thee, O God, from age to age" for Kontakion 1).
 *
 * The opening is the usual beginning (blessing through the Lord's Prayer),
 * taken from the Vespers fixed texts so it reads exactly as every other
 * service does. Added 2026-11-25 — the parish served it that evening in place
 * of Daily Vespers.
 *
 * @param {Object} f  - fixed-texts/akathist-thanksgiving-fixed.json
 * @param {Object} vf - fixed-texts/vespers-fixed.json (opening prayers)
 * @param {Object} [opts]
 * @param {boolean} [opts.beginning=true] - include the opening prayers
 * @returns {ServiceBlock[]}
 */
function assembleAkathistThanksgiving(f, vf, opts = {}) {
  warnings.reset();
  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    makeBlock(id, section, type, speaker, text, extras);

  if (opts.beginning !== false) {
    const sec = 'Opening Prayers';
    const p = (vf && vf.prayers) || {};
    const dox = (vf && vf.doxology) || {};
    const lhm3 = (vf && vf.responses && vf.responses.lordHaveMercyThrice) || 'Lord, have mercy. (3)';
    const rows = [
      ['op-blessing', 'prayer',   'priest', 'Blessed is our God, always, now and ever, and unto ages of ages.'],
      ['op-amen',     'response', 'reader', 'Amen.'],
      ['op-glory',    'prayer',   'reader', 'Glory to Thee, our God, glory to Thee.'],
      ['op-king',     'prayer',   'reader', p.heavenlyKing],
      ['op-trisagion','prayer',   'reader', p.trisagion],
      ['op-gn1',      'doxology', null,     dox.gloryNow],
      ['op-trinity',  'prayer',   'reader', p.mostHolyTrinity],
      ['op-lhm3',     'response', 'reader', lhm3],
      ['op-gn2',      'doxology', null,     dox.gloryNow],
      ['op-father',   'prayer',   'reader', p.ourFather],
      ['op-excl',     'prayer',   'priest', p['ourFather.doxology']],
      ['op-amen2',    'response', 'reader', 'Amen.'],
    ];
    for (const [id, type, speaker, text] of rows) {
      if (!text) { warnings.push(`akathist: opening text ${id} missing from vespers-fixed.json`); continue; }
      blocks.push(S(id, sec, type, speaker, text));
    }
  }

  const byName = new Map();
  const emit = (e, repeated) => {
    const name = `${e.kind === 'ikos' ? 'Ikos' : 'Kontakion'} ${e.number}`;
    const sec  = repeated ? `${name} (repeated)` : name;
    const id   = `${e.kind}${e.number}${repeated ? '-r' : ''}`;
    blocks.push(S(`${id}-text`, sec, 'hymn', null, e.text));
    (e.acclamations || []).forEach((a, i) => {
      blocks.push(S(`${id}-acc${i + 1}`, sec, 'verse', null, a));
    });
    if (e.refrain) blocks.push(S(`${id}-refrain`, sec, 'response', 'all', e.refrain));
  };

  for (const e of (f.sections || [])) {
    if (e.repeat) {
      const orig = byName.get(e.repeat.toLowerCase());
      if (!orig) throw new Error(`akathist: "Repeat: ${e.repeat}" names no earlier section`);
      emit(orig, true);
      continue;
    }
    byName.set(`${e.kind === 'ikos' ? 'ikos' : 'kontakion'} ${e.number}`, e);
    emit(e, false);
  }

  return blocks;
}

module.exports = assembleAkathistThanksgiving;
