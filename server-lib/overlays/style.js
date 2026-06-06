'use strict';

const { loadOverlayManifest } = require('./manifest');
const { resolveExtendsChain } = require('./extends-chain');

const styleCache = new Map();
const ALLOWED = new Set(['new', 'old']);

/** Resolves the calendar `style` ('new' | 'old') from an overlay's extends
 *  chain (parent-first, child wins). Returns null if no overlay is active
 *  or no manifest in the chain declares a `style`. The route layer falls
 *  back to 'new' when this returns null.
 *
 *  The style determines whether fixed-feast lookups (menaion, Vigil saints,
 *  Great Feasts of the Lord/Theotokos) use the civil Gregorian date as-is
 *  ('new', Revised Julian jurisdictions like OCA/GOA/Antiochian) or shift
 *  back 13 days to the Julian (M, D) tuple ('old', ROCOR/Serbian/Georgian).
 *  See docs/old-style-calendar.md.
 */
function getOverlayStyle(overlayId) {
  if (!overlayId) return null;
  if (styleCache.has(overlayId)) return styleCache.get(overlayId);
  const chain = resolveExtendsChain(overlayId);
  let style = null;
  for (const id of chain) {
    const m = loadOverlayManifest(id);
    if (m && typeof m.style === 'string' && ALLOWED.has(m.style)) {
      style = m.style;
    }
  }
  styleCache.set(overlayId, style);
  return style;
}

/** Resolves the effective style for a request from (query string, overlay,
 *  default). Query string wins so staff/audit can override an overlay. */
function resolveStyle(query, overlayId) {
  const fromQuery = query?.style;
  if (typeof fromQuery === 'string' && ALLOWED.has(fromQuery)) return fromQuery;
  return getOverlayStyle(overlayId) || 'new';
}

module.exports = { getOverlayStyle, resolveStyle };
