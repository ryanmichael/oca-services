'use strict';

// Don't mix translations within a service (CLAUDE.md, "Translation").
//
// The variable propers in variable-sources/great-feast-variants.json are all
// OCA thee/thy ("incline THINE ear", "before THY face"), except that the
// Nativity of the Theotokos and the Entry of the Theotokos shipped their
// Alleluia verses in a modern-register translation — "Hear, O daughter, and
// consider and incline YOUR ear" / "The rich among the people shall entreat
// YOUR favor". Two feasts out of fourteen, so it read as a normal line until
// placed next to the Tone-3 prokeimenon directly above it in the same service.
//
// Corrected 2026-09-07 to the OCA form printed in 2025-0908-texts-tt.docx:
//   "Hearken, O daughter, and see, and incline thine ear!" (Ps. 44:9a)
//   "Even the rich among the people shall pray before thy face." (Ps. 44:11b)
//
// This rule reads the SOURCE FILE rather than an assembled service, so it holds
// for every feast at once and does not need a date to fire on. It flags
// second-person modern pronouns in the sung propers (prokeimenon refrain/verse
// and alleluia verses) — the fields that sit next to thee/thy text in the same
// section. Scripture-quotation fields and prose notes are out of scope.
//
// NOTE: this is a REGISTER-CONSISTENCY rule, not a translation-preference one.
// A parish that wants modern register throughout gets it from the pronoun layer
// (`defaultPronoun` / applyYouYour), not by one feast's data disagreeing with
// the other thirteen. Choir-director wording preferences route to the
// choir-correction skill instead.

const path = require('path');

const VARIANTS_PATH = path.resolve(__dirname, '..', '..', '..',
  'variable-sources', 'great-feast-variants.json');

// Whole-word modern second-person pronouns.
const MODERN = /\b(your|yours|you)\b/i;

// In the thee/thy register "you/your" is NOT automatically wrong: thee/thou is
// the SINGULAR, ye/you/your the PLURAL. "Oh, clap your hands, all you peoples"
// (Ascension) is correct archaic English addressing a crowd, and flagging it
// would train the reader to ignore this rule. Only a singular addressee — God,
// the Theotokos, a single saint — takes thee/thy.
//
// So a line is exempt when it addresses a plurality. Detected by an explicit
// plural addressee rather than by guessing, so the rule stays quiet only where
// it can point at the plural noun that licenses "you".
const PLURAL_ADDRESSEE = /\b(all (of )?you|you|ye)\s+(peoples?|nations|faithful|righteous|men|children|peoples|angels|peoples)\b|\ball ye\b|\bO peoples\b/i;

function scan(issues, feastKey, field, text) {
  if (typeof text !== 'string') return;
  if (PLURAL_ADDRESSEE.test(text)) return;
  const m = text.match(MODERN);
  if (!m) return;
  issues.push({
    message:
      `great-feast-variants.json ${feastKey}.${field} uses modern-register "${m[0]}" ` +
      `among thee/thy propers: "${text.trim().slice(0, 90)}…"`,
    hint:
      'Restore the OCA thee/thy form for this feast so the register matches the rest of ' +
      'the service. Parish-wide modern register belongs to the pronoun layer, not to one ' +
      "feast's source data.",
  });
}

module.exports = {
  id:             'F2-feast-propers-register',
  family:         'theme',
  severity:       'medium',
  description:    'Great Feast prokeimenon and alleluia propers must stay in the thee/thy register the rest of the file uses. Regression found 2026-09-07 (nativityTheotokos + entryTheotokos alleluia verses).',
  needsAssembled: false,
  // Source-file rule: run it once, on any date, rather than per-service.
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: () => {
    let data;
    try {
      data = require(VARIANTS_PATH);
    } catch (err) {
      return [{
        message: `F2: could not read great-feast-variants.json — ${err.message}`,
        hint:    'The rule cannot verify register while the source file is unreadable.',
      }];
    }

    const issues = [];
    for (const [feastKey, v] of Object.entries(data)) {
      if (!v || typeof v !== 'object' || feastKey.startsWith('_')) continue;
      scan(issues, feastKey, 'prokeimenon.refrain', v.prokeimenon?.refrain);
      scan(issues, feastKey, 'prokeimenon.verse',   v.prokeimenon?.verse);
      (v.alleluia?.verses || []).forEach((t, i) =>
        scan(issues, feastKey, `alleluia.verses[${i}]`, t));
    }
    return issues;
  },
};
