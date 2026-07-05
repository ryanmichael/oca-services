'use strict';

// Divine Liturgy ending order + dismissal content (discovered 2026-07-05).
// Two problems, both corrected in the liturgy assembler:
//   1. The ordinary Liturgy dismissal wrongly carried the Vespers/Matins/Hours
//      elements "Most holy Theotokos, save us." + "More honorable than the
//      Cherubim…". The OCA Liturgy dismissal goes straight from the Closing
//      Doxology ("…Father, bless.") to the priest's dismissal.
//   2. Psalm 33 was emitted AFTER the priestly blessing + Closing Doxology; the
//      OCA order is: "Blessed be the name…" → Psalm 33 → blessing → doxology →
//      dismissal.
//
// This rule guards both. Feast/paschal dismissal magnifications (the
// `dismissalTheotokos` override, the paschal "The Angel cried…") are their own
// seasonal texts and are not the "More honorable" default, so they don't trip
// the content check.

module.exports = {
  id:             'L38-liturgy-dismissal-order',
  family:         'structure',
  severity:       'high',
  description:    'Liturgy dismissal has no Vespers "More honorable"/"Most holy Theotokos, save us"; Psalm 33 precedes the Closing Doxology. [discovered 2026-07-05]',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'liturgy',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const issues = [];

    const dismissal = blocks.filter(b => b.section === 'Dismissal');

    // The priest's dismissal names the holy and righteous ancestors of God,
    // Joachim and Anna (fixed commemoration before "and of all the saints").
    const dismissalPrayer = dismissal.find(b => b.speaker === 'priest' && /have mercy on us and save us/i.test(b.text || ''));
    if (dismissalPrayer && !/Joachim and Anna/i.test(dismissalPrayer.text || '')) {
      issues.push({
        message: 'Liturgy dismissal prayer omits the holy and righteous ancestors of God, Joachim and Anna (commemorated before "and of all the saints").',
        hint:    'Add "of the holy and righteous ancestors of God, Joachim and Anna" to the parts in _litDismissal.',
      });
    }

    const leaked = dismissal.find(b =>
      /More honorable than the Cherubim/i.test(b.text || '') ||
      /^Most holy Theotokos, save us\.?$/i.test((b.text || '').trim()));
    if (leaked) {
      issues.push({
        message: 'Liturgy Dismissal contains a Vespers-style magnification ("More honorable…" / "Most holy Theotokos, save us") — the Liturgy dismissal goes straight to the priest\'s dismissal.',
        hint:    'Remove the default Theotokos magnification from _litDismissal (assemblers/liturgy-parts/dismissal.js).',
      });
    }

    // Order: Psalm 33 must precede the Closing Doxology when both are present.
    const psalmIdx  = blocks.findIndex(b => b.section === 'Psalm 33');
    const doxIdx    = blocks.findIndex(b => b.section === 'Closing Doxology');
    if (psalmIdx !== -1 && doxIdx !== -1 && psalmIdx > doxIdx) {
      issues.push({
        message: 'Psalm 33 is emitted after the Closing Doxology; OCA order is "Blessed be the name…" → Psalm 33 → blessing → doxology → dismissal.',
        hint:    'In assemblers/liturgy.js, emit _litPsalm33 before _litClosingDoxology.',
      });
    }

    // Psalm 33 at the Liturgy ending flows straight into the priestly blessing —
    // no concluding "Glory… now and ever…" doxology.
    const psalm33 = blocks.filter(b => b.section === 'Psalm 33');
    if (psalm33.some(b => b.type === 'doxology' && /now and ever/i.test(b.text || ''))) {
      issues.push({
        message: 'Psalm 33 (Liturgy ending) has a trailing "Glory… now and ever…" doxology — it should flow straight into "The blessing of the Lord be upon you…".',
        hint:    'Drop the ps33-glory block in _litPsalm33 (assemblers/liturgy-parts/thanksgiving.js).',
      });
    }

    // Psalm 33 renders the full psalm, one verse per line (≥15 verse blocks) so
    // it doesn't silently revert to the abbreviated single-paragraph form.
    if (psalm33.length) {
      const verseLines = psalm33.filter(b => b.type !== 'rubric' && (b.text || '').trim()).length;
      if (verseLines < 15) {
        issues.push({
          message: `Psalm 33 renders ${verseLines} verse line(s); expected the full psalm one-per-line (≥15).`,
          hint:    'psalm-33 in liturgy-fixed.json should carry the full `verses` array; see _litPsalm33.',
        });
      }
    }
    return issues;
  },
};
