'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');
const { getPsalter, psalmBody } = require('../oca-psalter');

const ODES = ['ode1', 'ode3', 'ode4', 'ode5', 'ode6', 'ode7', 'ode8', 'ode9'];
const ODE_NAMES = { ode1:'Ode I', ode3:'Ode III', ode4:'Ode IV', ode5:'Ode V',
                    ode6:'Ode VI', ode7:'Ode VII', ode8:'Ode VIII', ode9:'Ode IX' };
const BRIEF_ODES = new Set(['ode3', 'ode6', 'ode9']);

/**
 * Pick the inflection form for the departed. Plural whenever there is more
 * than one name (or no name at all — the generic "servants of God" form);
 * singular masculine/feminine when exactly one name is given.
 */
function pickForm(names, gender) {
  if (names.length !== 1) return 'plural';
  return gender === 'f' ? 'feminine' : 'masculine';
}

/**
 * Resolve the {servant}/{their}/{N}/… tokens in a text against one of the
 * `forms` tables in panikhida-fixed.json. `{N}` becomes the actual names when
 * supplied, else the table's placeholder — "(N.)" / "(NN.)".
 */
function inflect(text, form, names) {
  return text.replace(/\{(\w+)\}/g, (m, key) => {
    if (key === 'N' && names.length) return names.join(', ');
    return Object.prototype.hasOwnProperty.call(form, key) ? form[key] : m;
  });
}

/**
 * Assembles the Panikhida (Memorial Service for the Departed), parish form.
 * Nearly all fixed content; the only runtime inputs are the names of the
 * departed and the canon length. Texts from fixed-texts/panikhida-fixed.json;
 * Psalms 90 and 50 from the shared Psalter.
 *
 * @param {Object} f - Parsed panikhida-fixed.json
 * @param {Object} [opts]
 * @param {string[]} [opts.names=[]]   Names of the departed, already trimmed
 * @param {string}   [opts.gender]     'm' | 'f' — used only when one name is given
 * @param {string}   [opts.canon]      'full' (8 heirmoi) | 'brief' (Odes 3, 6, 9)
 * @param {boolean}  [opts.psalm90=true]  Include Psalm 90 after the opening
 * @returns {ServiceBlock[]}
 */
function assemblePanikhida(f, opts = {}) {
  warnings.reset();
  const names  = (opts.names || []).filter(Boolean);
  const form   = f.forms[pickForm(names, opts.gender)];
  const brief  = opts.canon === 'brief';
  const withPs90 = opts.psalm90 !== false;
  const psalter = getPsalter();

  const blocks = [];
  const S = (id, section, type, speaker, text, extras) =>
    blocks.push(makeBlock(id, section, type, speaker, inflect(text, form, names), extras));

  // Little Litany for the Departed — after the Evlogitaria, Ode III, Ode VI.
  const littleLitany = (prefix) => {
    const l = f.litanyLittle, sec = 'Litany for the Departed';
    S(`${prefix}-open`, sec, 'prayer', 'deacon', l.opening);
    S(`${prefix}-open-r`, sec, 'response', 'choir', l.response);
    l.petitions.forEach((p, i) => {
      S(`${prefix}-p${i}`, sec, 'prayer', 'deacon', p);
      S(`${prefix}-p${i}-r`, sec, 'response', 'choir', l.response);
    });
    S(`${prefix}-ask`, sec, 'prayer', 'deacon', l.askPetition);
    S(`${prefix}-ask-r`, sec, 'response', 'choir', l.askResponse);
    S(`${prefix}-call`, sec, 'prayer', 'deacon', l.deaconCall);
    S(`${prefix}-call-r`, sec, 'response', 'choir', l.response);
    prayerForTheDeparted(prefix, sec);
  };

  const prayerForTheDeparted = (prefix, sec) => {
    const p = f.prayerForTheDeparted;
    S(`${prefix}-prayer`, sec, 'prayer', 'priest', p.text, { label: 'Prayer for the Departed' });
    S(`${prefix}-excl`, sec, 'prayer', 'priest', p.exclamation);
    S(`${prefix}-amen`, sec, 'response', 'choir', p.amen);
  };

  // 1. Opening
  S('pk-bless', 'Opening', 'prayer', 'deacon', f.opening.deaconBless);
  S('pk-excl', 'Opening', 'prayer', 'priest', f.opening.exclamation);
  S('pk-amen', 'Opening', 'response', 'choir', f.opening.amen);

  // 2. Trisagion prayers → Our Father
  S('pk-tris', 'Trisagion', 'prayer', 'choir', f.trisagion.holyGod + ' (Thrice)');
  S('pk-tris-gn', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow);
  S('pk-tris-ht', 'Trisagion', 'prayer', 'reader', f.trisagion.holyTrinity);
  S('pk-tris-lhm', 'Trisagion', 'response', 'reader', f.trisagion.lordHaveMercy + ' (Thrice)');
  S('pk-tris-gn2', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow);
  S('pk-of', 'Our Father', 'prayer', 'reader', f.ourFather.text);
  S('pk-of-excl', 'Our Father', 'prayer', 'priest', f.ourFather.exclamation);
  S('pk-of-amen', 'Our Father', 'response', 'reader', f.ourFather.amen);

  // 3. Psalm 90 (with its own preamble); parishes often omit it.
  if (withPs90) {
    S('pk-lhm12', 'Psalm 90', 'response', 'reader', f.lordHaveMercy12);
    S('pk-ps90-gn', 'Psalm 90', 'prayer', 'reader', f.gloryNow);
    f.comeLetUsWorship.forEach((t, i) => S(`pk-ocluw-${i}`, 'Psalm 90', 'prayer', 'reader', t));
    const ps90 = psalter['90'];
    if (ps90) S('pk-ps90', 'Psalm 90', 'prayer', 'reader', psalmBody(ps90).join('\n'));
    else warnings.push({ source: 'psalter', key: '90' });
    S('pk-ps90-gn2', 'Psalm 90', 'prayer', 'reader', f.gloryNow);
    S('pk-ps90-all', 'Psalm 90', 'response', 'reader', f.alleluiaGlory + ' (Thrice)');
  }

  // 4. Alleluia, Tone 8, with the verses for the departed
  const al = f.alleluia;
  al.verses.forEach((v, i) => {
    S(`pk-al-v${i}`, 'Alleluia', 'verse', 'deacon', `V. ${v}`, { tone: al.tone });
    S(`pk-al-r${i}`, 'Alleluia', 'response', 'choir', al.response, { tone: al.tone });
  });

  // 5. Troparion "Thou only Creator" + Theotokion
  S('pk-trop', 'Troparion', 'hymn', 'choir', f.troparion.text, { tone: f.troparion.tone, label: 'Troparion' });
  S('pk-trop-gn', 'Troparion', 'doxology', 'choir', f.gloryNow);
  S('pk-trop-theot', 'Troparion', 'hymn', 'choir', f.troparion.theotokion, { tone: f.troparion.tone, label: 'Theotokion' });

  // 6. Evlogitaria of the Departed
  const ev = f.evlogitaria, evSec = 'Evlogitaria';
  ev.troparia.forEach((t, i) => {
    S(`pk-ev-ref-${i}`, evSec, 'verse', 'choir', ev.refrain, { tone: ev.tone });
    S(`pk-ev-${i}`, evSec, 'hymn', 'choir', t, { tone: ev.tone });
  });
  S('pk-ev-glory', evSec, 'doxology', 'choir', f.glory);
  S('pk-ev-triad', evSec, 'hymn', 'choir', ev.triadikon, { tone: ev.tone, label: 'Triadikon' });
  S('pk-ev-now', evSec, 'doxology', 'choir', f.now);
  S('pk-ev-theot', evSec, 'hymn', 'choir', ev.theotokion, { tone: ev.tone, label: 'Theotokion' });
  S('pk-ev-all', evSec, 'response', 'choir', f.alleluiaGlory + ' (Thrice)');

  // 7. Little Litany
  littleLitany('pk-lit1');

  // 8. Kathisma hymn "Give rest with the just" + Theotokion
  const kh = f.kathismaHymn;
  S('pk-kath', 'Kathisma Hymn', 'hymn', 'choir', kh.text, { tone: kh.tone, label: 'Kathisma Hymn' });
  S('pk-kath-gn', 'Kathisma Hymn', 'doxology', 'choir', f.gloryNow);
  S('pk-kath-theot', 'Kathisma Hymn', 'hymn', 'choir', kh.theotokion, { tone: kh.tone, label: 'Theotokion' });

  // 9. Psalm 50
  const ps50 = psalter['50'];
  if (ps50) S('pk-ps50', 'Psalm 50', 'prayer', 'reader', psalmBody(ps50).join('\n'));
  else warnings.push({ source: 'psalter', key: '50' });

  // 10. Canon (heirmoi only) with litanies after III and VI, kontakion after VI
  const c = f.canon;
  for (const ode of ODES) {
    if (brief && !BRIEF_ODES.has(ode)) continue;
    const sec = `Canon — ${ODE_NAMES[ode]}`;
    S(`pk-${ode}-irm`, sec, 'hymn', 'choir', c.odes[ode], { tone: c.tone, label: 'Heirmos' });
    S(`pk-${ode}-ref`, sec, 'verse', 'choir', c.refrain + ' (Twice)');
    S(`pk-${ode}-glory`, sec, 'doxology', 'choir', ode === 'ode8' ? c.ode8Glory : f.glory);
    S(`pk-${ode}-now`, sec, 'doxology', 'choir', f.now);

    if (ode === 'ode3') littleLitany('pk-lit2');
    if (ode === 'ode6') {
      littleLitany('pk-lit3');
      S('pk-kont', 'Kontakion', 'hymn', 'choir', f.kontakion.text, { tone: f.kontakion.tone, label: 'Kontakion' });
      S('pk-ikos', 'Kontakion', 'hymn', 'reader', f.kontakion.ikos, { tone: f.kontakion.tone, label: 'Ikos' });
    }
  }

  // 11. Trisagion → Our Father
  S('pk-cl-tris', 'Trisagion', 'prayer', 'choir', f.trisagion.holyGod + ' (Thrice)');
  S('pk-cl-gn', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow);
  S('pk-cl-ht', 'Trisagion', 'prayer', 'reader', f.trisagion.holyTrinity);
  S('pk-cl-lhm', 'Trisagion', 'response', 'reader', f.trisagion.lordHaveMercy + ' (Thrice)');
  S('pk-cl-gn2', 'Trisagion', 'prayer', 'reader', f.trisagion.gloryNow);
  S('pk-cl-of', 'Our Father', 'prayer', 'reader', f.ourFather.text);
  S('pk-cl-of-excl', 'Our Father', 'prayer', 'priest', f.ourFather.exclamation);
  S('pk-cl-of-amen', 'Our Father', 'response', 'reader', f.ourFather.amen);

  // 12. Troparia, Tone 4 "With the souls of the righteous"
  const tr = f.troparia, trSec = 'Troparia';
  tr.hymns.forEach((t, i) => S(`pk-tr-${i}`, trSec, 'hymn', 'choir', t, { tone: tr.tone }));
  S('pk-tr-glory', trSec, 'doxology', 'choir', f.glory);
  S('pk-tr-g', trSec, 'hymn', 'choir', tr.glory, { tone: tr.tone });
  S('pk-tr-now', trSec, 'doxology', 'choir', f.now);
  S('pk-tr-n', trSec, 'hymn', 'choir', tr.now, { tone: tr.tone, label: 'Theotokion' });

  // 13. Augmented Litany for the Departed
  {
    const l = f.litanyAugmented, sec = 'Augmented Litany for the Departed', p = 'pk-lit4';
    S(`${p}-open`, sec, 'prayer', 'deacon', l.opening);
    S(`${p}-open-r`, sec, 'response', 'choir', l.tripleResponse);
    l.petitions.forEach((t, i) => {
      S(`${p}-p${i}`, sec, 'prayer', 'deacon', t);
      S(`${p}-p${i}-r`, sec, 'response', 'choir', l.tripleResponse);
    });
    S(`${p}-ask`, sec, 'prayer', 'deacon', l.askPetition);
    S(`${p}-ask-r`, sec, 'response', 'choir', l.askResponse);
    S(`${p}-call`, sec, 'prayer', 'deacon', l.deaconCall);
    S(`${p}-call-r`, sec, 'response', 'choir', l.response);
    prayerForTheDeparted(p, sec);
  }

  // 14. Dismissal + Memory Eternal
  const d = f.dismissal, dSec = 'Dismissal';
  S('pk-dis-wis', dSec, 'prayer', 'deacon', d.wisdom);
  S('pk-dis-mht', dSec, 'prayer', 'priest', d.theotokosSaveUs);
  S('pk-dis-mh', dSec, 'hymn', 'choir', d.moreHonorable);
  S('pk-dis-gl', dSec, 'prayer', 'priest', d.gloryToThee);
  S('pk-dis-gn', dSec, 'response', 'choir', d.gloryNowLhmBless);
  S('pk-dis', dSec, 'prayer', 'priest', d.text);
  S('pk-dis-amen', dSec, 'response', 'choir', d.amen);
  S('pk-me-call', 'Memory Eternal', 'prayer', 'deacon', d.memoryEternalCall);
  S('pk-me', 'Memory Eternal', 'hymn', 'choir', d.memoryEternal);
  S('pk-me-dwell', 'Memory Eternal', 'hymn', 'choir', d.dwellWithTheBlessed);

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assemblePanikhida;
module.exports.pickForm = pickForm;
module.exports.inflect  = inflect;
