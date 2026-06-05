'use strict';

/**
 * Matins-style Little Litany emitter. Pushes the standard Little-Litany
 * block sequence (opening, response, petition, commemoration, exclamation,
 * amen) into an existing blocks[] array using the caller-supplied `S` block
 * factory.
 *
 * Used by Holy Week matins assemblers (Bridegroom Matins, Passion Gospels,
 * Lamentations, Paschal Matins) — each calls this at multiple points (after
 * Kathisma, Ode 3, Ode 6, Ode 9) with a different `excKey` to pick the
 * appropriate priest's exclamation from `ll.exclamations`.
 */
function emitLittleLitany(blocks, S, section, ll, excKey) {
  blocks.push(S(`ll-${excKey}-opening`, section, 'prayer', 'deacon', ll.opening));
  blocks.push(S(`ll-${excKey}-response`, section, 'response', 'choir', ll.response));
  blocks.push(S(`ll-${excKey}-petition`, section, 'prayer', 'deacon', ll.petition));
  blocks.push(S(`ll-${excKey}-commem`, section, 'prayer', 'deacon', ll.commemoration));
  blocks.push(S(`ll-${excKey}-commem-resp`, section, 'response', 'choir', ll.commemorationResponse));
  const exc = ll.exclamations[excKey] || ll.exclamations.afterKathisma1;
  blocks.push(S(`ll-${excKey}-excl`, section, 'prayer', 'priest', exc));
  blocks.push(S(`ll-${excKey}-amen`, section, 'response', 'choir', 'Amen.'));
}

module.exports = emitLittleLitany;
