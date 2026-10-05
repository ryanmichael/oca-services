'use strict';

function resolveTranslation(query) {
  return query?.translation || process.env.LITURGY_TRANSLATION || null;
}

const { familyOf, LABEL } = require('../sources/translation-provenance');

/**
 * Recursively tag hymn-like objects with the translation they came from.
 *
 * A node's own `_source` governs everything beneath it, and overrides the
 * caller's default. Until 2026-10-05 this blanket-tagged every hymn in a source
 * file `'OCA'`, so the weekday Octoechos — whose day-nodes all carry
 * `_source: 'stSergius'` — displayed as OCA on every weekday service. That is
 * the larger half of the provenance defect; the Menaion half lived in
 * for-date.js.
 */
function tagProvenance(obj, label, inherited) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => tagProvenance(item, label, inherited)); return; }

  const own  = typeof obj._source === 'string' ? LABEL[familyOf(obj._source)] : null;
  const here = own || inherited || label;

  if (obj.text && typeof obj.text === 'string' && !obj.provenance) obj.provenance = here;
  if (obj.hymns) obj.hymns.forEach(h => { if (h && !h.provenance) h.provenance = here; });
  for (const v of Object.values(obj)) tagProvenance(v, label, here);
}

module.exports = { resolveTranslation, tagProvenance };
