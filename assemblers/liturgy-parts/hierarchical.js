'use strict';

// Hierarchical Divine Liturgy — the Liturgy served by a bishop.
//
// This is a SERVICE TYPE, the same axis Reader's Typika sits on: the mode of
// celebration, chosen by circumstance. It is not the calendar's
// chrysostom/basil variant and not a parish rubric. Typika is on that axis
// because the Liturgy cannot be served at all; this is the opposite direction,
// the Liturgy served by more than usual.
//
// WHAT THE OCA ORDER DOES NOT GIVE YOU. No OCA order of services carries
// hierarchical rubrics — reference/orders/2026-1108 is the ordinary Sunday
// order and says outright that "the ruling bishop should be consulted". So
// none of this is derivable from our usual oracle. It is transcribed from the
// music the parish choir actually sings, published on the St John of Damascus
// choir site under Special Services → Hierarchical Liturgy:
//
//   From the Rising of the Sun   K. Smolsky               (Ps 112:3)
//   Your Soul Shall Rejoice      Kievan Chant, Kovalevsky (Tone 7)
//   Ton Despotin                 Romanian melody, arr. Heckman
//   Eis Polla Eti, Despota       (short, and two trio settings)
//   Holy God — Hierarchical      Obikhod (SVS), via OrthodoxMusicResource
//   Hymn to the Theotokos        Akafist melody
//
// Only the TEXTS are modelled here. The settings are third-party arrangements
// and are not ours to reproduce; the choir sings from its own books.
//
// WHAT IS A CUE AND NOT A TEXT. Much of a hierarchical Liturgy is choreography
// timed to the bishop's actions, which this block model has no way to express.
// Those are emitted as `rubric` blocks naming what happens, never as invented
// text. Where a text exists but we hold only its incipit — the bishop's "Look
// down from heaven, O God…", which the Obikhod page prints truncated — the
// rubric says so rather than guessing the remainder.
//
// WHERE THE THEOTOKOS HYMN BELONGS (corrected 2026-11-05). The director's
// annotations on that sheet were previously read as a cue for the ANAPHORA
// megalynarion. They are not. Read at 300dpi, the page says:
//
//   top:    "After welcome Bishop comes … Softly … Stop when Bishop puts on Mitre"
//   bottom: "Deacon will be chanting proper / Stop when Vlad[yka] Head covered"
//   margin: "Lower to E♭ Major", "moderato → faster"
//
// A welcome, a mitre and a head being covered are the VESTING, not the
// anaphora — the bishop is already vested and standing at the altar by then.
// So "It is truly meet" is sung softly during the vesting, under the deacon's
// vesting prayers, and stops when the mitre goes on. It is emitted there.
// Source: docs/11-8 Hierarchical liturgy/Hymn to Theotokos Hierarchical.pdf.
//
// Its position WITHIN the vesting is the one inference here: last, immediately
// before Ton Despotin, because the mitre is the end of vesting and Ton Despotin
// and Eis Polla acclaim the fully-vested bishop. If the director says otherwise,
// that is a parish correction, not a defect.
//
// What remains UNSOURCED, and is deliberately not invented: the bishop's own
// commemoration at the anaphora (we emit only a minimal cue beside the
// commemoration block that already renders), the hierarchical Great Entrance,
// and the "Eis polla" repeats the rector describes as happening "several times
// throughout the Liturgy" (docs/choir-packets/2026-10-14/body.md). We render
// Eis polla once, at the vesting.

const makeBlock          = require('../_shared/make-block');
const { resolveFixedRef } = require('../_shared/resolve');
const { _trisagionPeace } = require('./trisagion');

/** Served before the Liturgy proper: the bishop is met at the doors and vested
 *  in the centre of the church while the choir sings. */
function _litHierarchicalVesting(f) {
  const section = 'Meeting and Vesting of the Bishop';
  const h = (f && f.hierarchical) || {};
  if (!h.vesting) return [];
  const v = h.vesting;
  const blocks = [];

  blocks.push(makeBlock('hier-rubric', section, 'rubric', null, v.rubric));
  blocks.push(makeBlock('hier-rising', section, 'hymn', 'choir', v.risingOfTheSun,
    { label: 'From the Rising of the Sun', source: 'hierarchical' }));
  blocks.push(makeBlock('hier-vesting-rubric', section, 'rubric', null, v.vestingRubric));
  blocks.push(makeBlock('hier-soul', section, 'hymn', 'choir', v.soulShallRejoice,
    { tone: 7, label: 'Thy Soul Shall Rejoice', source: 'hierarchical' }));
  // "It is truly meet", sung under the deacon's vesting prayers and cut off at
  // the mitre. The sheet for it is the one annotated page in the 11-08 packet;
  // see the header note above for why it sits here and not at the anaphora.
  // The text is a @@-reference to the canonical `it-is-truly-meet`, NOT a
  // second copy: it is the same hymn, so it must follow the parish's register
  // and any parish override of that key rather than drift from them.
  if (v.theotokosRubric) {
    blocks.push(makeBlock('hier-theotokos-rubric', section, 'rubric', null, v.theotokosRubric));
  }
  const theotokosHymn = resolveFixedRef(v.theotokosHymn, f);
  if (theotokosHymn && !theotokosHymn.startsWith('@@')) {
    blocks.push(makeBlock('hier-theotokos', section, 'hymn', 'choir', theotokosHymn,
      { label: 'Hymn to the Theotokos', source: 'hierarchical' }));
  }
  blocks.push(makeBlock('hier-ton-despotin', section, 'hymn', 'choir', v.tonDespotin,
    { label: 'Ton Despotin', source: 'hierarchical' }));
  blocks.push(makeBlock('hier-eis-polla', section, 'hymn', 'choir', v.eisPolla,
    { label: 'Eis Polla Eti, Despota', source: 'hierarchical' }));
  return blocks;
}

/** The hierarchical Trisagion. The Obikhod setting the parish sings alternates
 *  choir / clergy / choir / trio, with the bishop blessing the people between
 *  the third and fourth. The ordinary form is three choir repetitions with the
 *  Glory and the final — a different structure, not a different wording, which
 *  is why this substitutes the section rather than editing its text. */
function _litHierarchicalTrisagion(f) {
  const section = 'Trisagion';
  const h = (f && f.hierarchical) || {};
  if (!h.trisagion) return [];
  const t = h.trisagion;
  const text = t.text;
  const blocks = [];

  // Said once, where the parish's own Trisagion setting would otherwise be
  // sung: Tyler's is trilingual (English / Slavonic / Greek), and the
  // hierarchical alternation has no place for it, so the swap is announced
  // rather than made silently.
  if (t.openingRubric) {
    blocks.push(makeBlock('tris-h-rubric', section, 'rubric', null, t.openingRubric));
  }
  blocks.push(makeBlock('tris-h-1', section, 'hymn', 'choir', text));
  blocks.push(makeBlock('tris-h-clergy-rubric', section, 'rubric', null, t.clergyRubric));
  // The schema's speaker enum is priest/deacon/reader/choir/all — there is no
  // `clergy` or `trio`, and the hierarchical form is not reason enough to widen
  // a contract every consumer reads. Who sings each repetition is carried by
  // the label and by the rubric above it, which is where the rest of this
  // service's choreography already lives.
  blocks.push(makeBlock('tris-h-2', section, 'hymn', 'priest', text,
    { label: 'The clergy, in the altar' }));
  blocks.push(makeBlock('tris-h-3', section, 'hymn', 'choir', text));
  blocks.push(makeBlock('tris-h-bishop-rubric', section, 'rubric', null, t.bishopRubric));
  blocks.push(makeBlock('tris-h-trio', section, 'hymn', 'choir', text, { label: 'Trio' }));
  if (t.glory) blocks.push(makeBlock('tris-h-glory', section, 'doxology', null, t.glory));
  if (t.final) blocks.push(makeBlock('tris-h-final', section, 'hymn', 'choir', t.final));
  blocks.push(makeBlock('tris-h-tail-rubric', section, 'rubric', null, t.tailRubric));
  // Every form of the Trisagion is followed by the priestly blessing.
  blocks.push(..._trisagionPeace(section));
  return blocks;
}

/** A cue at the megalynarion. The hymn itself is unchanged; what differs is
 *  that the bishop commemorates aloud while the choir sustains it — which the
 *  `comm-hierarchs` block immediately after already shows. Kept minimal on
 *  purpose: the detail that used to be here ("the deacon chants the proper
 *  commemoration over it", "the choir stops at the bishop's signal") was read
 *  off the VESTING sheet and did not belong to this moment. See the header. */
function _litHierarchicalTheotokosCue(f) {
  const h = (f && f.hierarchical) || {};
  if (!h.theotokosCue) return [];
  return [makeBlock('hier-theotokos-cue', 'Hymn to the Theotokos', 'rubric', null,
    h.theotokosCue)];
}

module.exports = {
  _litHierarchicalVesting,
  _litHierarchicalTrisagion,
  _litHierarchicalTheotokosCue,
};
