'use strict';

const cal = require('../../../calendar-rules.js');

// Second Antiphon concluding doxology completeness (discovered 2026-07-05,
// Sun 07-05 Divine Liturgy): `typical-antiphon-2.glory` was authored as only
// "Now and ever, and unto ages of ages. Amen." — the "Glory to the Father,
// and to the Son, and to the Holy Spirit" half was dropped, so the antiphon
// jumped from the last psalm verse straight to "Now and ever" before the
// "Only-begotten Son" hymn. (Antiphon 1's glory is complete.)
//
// The Second Antiphon closes with a full "Glory to the Father … now and ever
// … Amen." doxology immediately before the "Only-begotten Son" hymn, which is
// itself the concluding hymn (no separate refrain follows). This rule asserts
// the doxology preceding "Only-begotten Son" carries both halves.
//
// Scope: skip Great Feasts and the paschal period, where feast/paschal
// antiphons supply their own authored doxologies with a different shape.

module.exports = {
  id:             'L35-liturgy-second-antiphon-doxology',
  family:         'structure',
  severity:       'high',
  description:    'Liturgy Second Antiphon closes with a complete "Glory to the Father … now and ever" doxology before "Only-begotten Son". [discovered 2026-07-05]',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (cal.getGreatFeastKey(ctx.d) !== null) return false;
    if (ctx.isPentecostarion) return false;
    return true;
  },
  check: (ctx) => {
    const second = (ctx.assembled?.blocks || []).filter(b => b.section === 'Second Antiphon');
    if (!second.length) return [];
    const obIdx = second.findIndex(b =>
      b.type === 'hymn' && /^Only-begotten Son/i.test(b.text || '')
    );
    if (obIdx === -1) return [];   // no Only-begotten hymn → not the standard antiphon shape

    // The doxology immediately preceding the Only-begotten hymn.
    const dox = [...second.slice(0, obIdx)].reverse().find(b => b.type === 'doxology');
    if (!dox) {
      return [{ message: 'Second Antiphon has no concluding doxology before "Only-begotten Son".' }];
    }
    const text = dox.text || '';
    const hasGlory = /Glory to the Father, and to the Son, and to the Holy Spirit/i.test(text);
    const hasNow   = /now and ever/i.test(text);
    if (hasGlory && hasNow) return [];
    return [{
      message: `Second Antiphon concluding doxology is incomplete (${hasGlory ? '' : 'missing "Glory to the Father"'}${!hasGlory && !hasNow ? ' + ' : ''}${hasNow ? '' : 'missing "now and ever"'}): "${text.slice(0, 60)}…".`,
      hint:    'Set fixed-texts/liturgy-fixed.json#typical-antiphon-2.glory to the full "Glory to the Father, and to the Son, and to the Holy Spirit, now and ever, and unto ages of ages. Amen."',
    }];
  },
};
