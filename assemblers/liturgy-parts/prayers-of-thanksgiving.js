'use strict';

const makeBlock = require('../_shared/make-block');

/**
 * Prayers of Thanksgiving After Holy Communion — Appendix II.
 *
 * Read by the reader AFTER the dismissal, while the faithful venerate the cross
 * and receive the priest's blessing. Described by the choir director of St John
 * of Damascus, Tyler (2026-10-01):
 *
 *   "this occurs at the very end of the service. While everyone kisses the cross
 *    and is blessed by the priest, the Reader is reading what are called the
 *    prayers of Thanksgiving or the post-communion prayers… It is customary to
 *    end with 3 Lord have mercy's and some parishes sing it instead of the
 *    reader saying it. It is also customary to sing the troparion of the church
 *    at the end. If it were a feast day or the week following a feast we would
 *    not sing to St John but do the troparion of the feast."
 *
 * Text: Service Books of the Orthodox Church, 2nd ed., St. Tikhon's Seminary
 * Press, 2010, Appendix II. The Trisagion and Our Father reuse the keys this
 * service already renders, so one Liturgy never mixes two renderings of them.
 *
 * Off unless a parish opts in. Two rubrics, because they are two decisions:
 *   prayersOfThanksgiving  — print the prayers at all
 *   sungVenerationEnding   — the choir sings the close rather than the reader
 *                            saying it, and the temple's troparion is sung
 *
 * @param {object} f        liturgy fixed texts
 * @param {object} rubrics  overlay rubrics
 * @param {object} opts     { patronTroparion, feastTroparion, isBasil }
 */
function _litPrayersOfThanksgiving(f, rubrics = {}, opts = {}) {
  // The registry's `namespace` becomes a dotted path, so these arrive under
  // `liturgy.` — the same shape as rubrics.vespers.omitReadKathisma.
  const lit = rubrics.liturgy || {};
  if (!lit.prayersOfThanksgiving) return [];
  const p = f['prayers-of-thanksgiving'];
  if (!p) return [];

  const section = 'Prayers of Thanksgiving';
  const blocks = [];

  blocks.push(makeBlock('pot-rubric', section, 'rubric', null,
    'After the dismissal, while the faithful venerate the cross and receive the '
    + "priest's blessing, the reader says the Prayers of Thanksgiving."));

  if (p.priestExclamation?.text) {
    blocks.push(makeBlock('pot-glory', section, 'response', 'priest',
      p.priestExclamation.text,
      { repetitions: p.priestExclamation.repetitions || 1 }));
  }

  for (const prayer of p.prayers || []) {
    if (prayer.label) {
      blocks.push(makeBlock(`pot-${prayer.id}-label`, section, 'rubric', null, `${prayer.label}:`));
    }
    blocks.push(makeBlock(`pot-${prayer.id}`, section, 'prayer', 'reader', prayer.text));
  }

  // Trisagion → Trinity prayer → Our Father, from the keys already in use.
  const tri = f.trisagion;
  if (tri?.text) {
    blocks.push(makeBlock('pot-trisagion', section, 'prayer', 'reader', tri.text,
      { repetitions: tri.repetitions || 3 }));
    if (tri.glory) blocks.push(makeBlock('pot-trisagion-glory', section, 'doxology', null, tri.glory));
  }
  if (p.trinityPrayer) {
    blocks.push(makeBlock('pot-trinity', section, 'prayer', 'reader', p.trinityPrayer));
  }
  blocks.push(makeBlock('pot-lhm', section, 'response', 'reader', 'Lord, have mercy.',
    { repetitions: 3 }));
  if (tri?.glory) blocks.push(makeBlock('pot-glory-2', section, 'doxology', null, tri.glory));

  const lp = f['lords-prayer'];
  if (lp?.text) {
    blocks.push(makeBlock('pot-lords-prayer', section, 'prayer', 'reader', lp.text));
    if (lp.doxology) {
      blocks.push(makeBlock('pot-lp-doxology', section, 'prayer', 'priest', lp.doxology));
      blocks.push(makeBlock('pot-lp-amen', section, 'response', 'choir', 'Amen.'));
    }
  }

  // ── The sung ending ─────────────────────────────────────────────────────
  //
  // The book appoints twelve "Lord, have mercy" here and the troparion of the
  // Liturgy's author. The parish that sings this ending does three, aloud, and
  // sings the troparion of its own temple — displaced by the feast's troparion
  // on a feast or in the week after one. Both shapes are offered; neither is
  // invented, and the parish rubric decides.
  if (!lit.sungVenerationEnding) {
    const lhm = p.lordHaveMercy;
    if (lhm?.text) {
      blocks.push(makeBlock('pot-lhm-close', section, 'response', 'reader', lhm.text,
        { repetitions: lhm.repetitions || 12 }));
    }
    return blocks;
  }

  blocks.push(makeBlock('pot-lhm-sung', section, 'response', 'choir', 'Lord, have mercy.',
    { repetitions: 3 }));

  // The feast displaces the temple's patron — "we would not sing to St John but
  // do the troparion of the feast."
  const closing = opts.feastTroparion || opts.patronTroparion;
  if (closing?.text) {
    if (closing.rubric) {
      blocks.push(makeBlock('pot-close-rubric', section, 'rubric', null, closing.rubric));
    }
    blocks.push(makeBlock('pot-close-troparion', section, 'hymn', 'choir', closing.text,
      { tone: closing.tone ?? null }));
  }

  return blocks;
}

module.exports = { _litPrayersOfThanksgiving };
