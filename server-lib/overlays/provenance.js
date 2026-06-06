'use strict';

function resolveTranslation(query) {
  return query?.translation || process.env.LITURGY_TRANSLATION || null;
}

/** Recursively tag all hymn-like objects in a source tree with a provenance label. */
function tagProvenance(obj, label) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(item => tagProvenance(item, label)); return; }
  // Tag objects that look like hymns (have a 'text' property)
  if (obj.text && typeof obj.text === 'string' && !obj.provenance) obj.provenance = label;
  // Also tag hymns arrays
  if (obj.hymns) obj.hymns.forEach(h => { if (h && !h.provenance) h.provenance = label; });
  for (const v of Object.values(obj)) tagProvenance(v, label);
}

module.exports = { resolveTranslation, tagProvenance };
