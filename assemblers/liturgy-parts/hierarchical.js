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
// timed to the bishop's actions, which this block model has no way to express —
// the choir director's own annotations on the Theotokos hymn read "After
// welcome Bishop comes", "Deacon will be chanting proper" and "Stop when
// Vladyka 1st cover". Those are emitted as `rubric` blocks naming what happens,
// never as invented text. Where a text exists but we hold only its incipit —
// the bishop's "Look down from heaven, O God…", which the Obikhod page prints
// truncated — the rubric says so rather than guessing the remainder.

const makeBlock          = require('../_shared/make-block');
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
    { tone: 7, label: 'Your Soul Shall Rejoice', source: 'hierarchical' }));
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
 *  that the bishop commemorates aloud while the choir sustains it. */
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
