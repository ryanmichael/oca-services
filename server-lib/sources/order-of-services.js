'use strict';

// The OCA "Order of Services" for a given Sunday, as an oracle the assembler
// can consult at runtime.
//
// `reference/orders/YYYY-MMDD-order-services.txt` states the Lord-I-Call split
// in prose:
//
//     Lord, I Call, Tone 1 (Ps. 140/141)
//     7 stichera of the Resurrection, Tone 1
//     3 stichera of St. Hierotheus, Tone 4
//     Glory… St. Hierotheus, Tone 2
//
// ⚠️ SUNDAYS ONLY. The archive is built by the weekly order-rubrics fetch and
// covers 42 of the 52 Sundays in 2026; weekdays are not published in this form.
// A missing file is not a finding — callers fall back to their own logic.
//
// This is the discriminator that saint RANK could not be. `commemorations.rank`
// is NULL for all 2,638 rows and orthocal's `feast_level` does not separate the
// cases (2026-07-12 Proclus is level 0 and correctly takes 4+6; 2026-10-25
// Marcian is level 0 and should take 7+3). The order states the count per date,
// and it does separate them — the Sundays that correctly render 4+6 all read
// "4 stichera of the Resurrection", while 10-04 and 10-25 read 7.
//
// Shared by server-lib/assemble/for-date.js (which uses it to appoint the
// split) and audit/rules/D-structure/D21 (which uses it to check the result).
// One parser, so the rule cannot drift away from the thing it audits.

const fs   = require('fs');
const path = require('path');

const ORDERS_DIR = path.resolve(__dirname, '..', '..', 'reference', 'orders');

/** `2026-10-04` → absolute path of that Sunday's order file. */
function orderPathFor(sundayIso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(sundayIso || ''));
  if (!m) return null;
  return path.join(ORDERS_DIR, `${m[1]}-${m[2]}${m[3]}-order-services.txt`);
}

/**
 * The number of RESURRECTIONAL stichera the published order appoints at
 * Lord I Call for that Sunday, or null when there is no order file or it does
 * not state a count (17 of the 241 archived orders do not).
 */
function orderResurrectionCount(sundayIso) {
  const file = orderPathFor(sundayIso);
  if (!file) return null;
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return null; }
  const m = txt.match(/(\d+)\s+stichera of the Resurrection/i);
  if (!m) return null;
  const n = Number(m[1]);
  // A count outside 1..10 is a parse artifact, not an appointment.
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

module.exports = { ORDERS_DIR, orderPathFor, orderResurrectionCount };
