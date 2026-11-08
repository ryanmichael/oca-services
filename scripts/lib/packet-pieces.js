'use strict';

/**
 * How a choir packet's OCR is cut into hymns.
 *
 * The director's sheets number the Lord-I-Call stichera DOWNWARD (6,5,4,3,2,1)
 * and that number is the only reliable boundary between one hymn and the next.
 * There are exactly two printed forms, and the difference matters:
 *
 *   BARE           "6"       — the OCA service-text sheets
 *   PARENTHESISED  "(6)."    — the OCA engraved-music sheets, plus whatever
 *                  "(5).-"     stray marks the scanner reads off the staff
 *                  "(4)"
 *
 * Matching only the bare form collapsed all six Archangel stichera of
 * great-vespers-2026-11-07 into ONE piece. A piece holding six hymns cannot
 * score as verbatim against a single rendered hymn, so that sheet read 2/15
 * verbatim no matter what we printed — the measurement could not see the
 * defect a parishioner heard on 2026-11-07.
 *
 * The parentheses are REQUIRED for the second form. Letting a bare number
 * carry trailing punctuation too ("1.", "2,") also split page footers and
 * numbered lines inside the Liturgy sheets, and cost five sheets a match when
 * measured. Narrowing it to parenthesised-only left exactly one sheet changed.
 */

// Group 1 = bare, group 2 = parenthesised. Either is a position marker.
const POSITION_MARKER = /^(?:(\d{1,2})|\((\d{1,2})\)[.,\-–—·:;'"\s]*)$/;

/**
 * The stichera position a line marks, or null if the line is not a marker.
 * @param {string} line a trimmed OCR line
 * @returns {string|null}
 */
function positionMarker(line) {
  const m = POSITION_MARKER.exec(line);
  return m ? (m[1] || m[2]) : null;
}

module.exports = { POSITION_MARKER, positionMarker };
