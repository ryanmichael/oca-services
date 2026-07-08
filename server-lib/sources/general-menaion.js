'use strict';

const { openDb } = require('../cache/sqlite');

/**
 * Extracts a short name from a commemoration title for (name) substitution.
 * "Hieromartyr Silvanus of Gaza" → "Silvanus"
 * "Venerable Seraphim, Wonderworker of Sarov" → "Seraphim"
 */
function extractShortName(title) {
  let name = title
    // Strip rank prefixes
    .replace(/^(Holy,?\s*Glorious\s+)?/i, '')
    .replace(/^(Saint|Venerable|Hieromartyr|Hieromartyrs?|Martyr|Martyrs|Great[- ]Martyr|New Martyr|Virgin Martyr|Maiden Martyr|Monastic Martyr|Nun Martyr|Prophet|Apostle|Apostles|Blessed|Righteous)\s+/i, '')
    .replace(/^(Holy|Glorious|Great|New)\s+/i, '');
  // Strip "of Location", "at Location", "in Location", "near Location" suffixes
  name = name.replace(/\s+(?:of|at|in|near)\s+.*$/i, '');
  // Strip parenthetical and comma suffixes
  name = name.replace(/\s*\(.*$/, '');
  name = name.replace(/,\s+.*$/, '');
  return name.trim() || title;
}

/**
 * Fallback mapping for saint types that don't have their own General Menaion PDF
 * to a type that does.
 */
const GENERAL_MENAION_FALLBACK = {
  'hieromartyrs': 'hieromartyr',   // plural → singular as fallback
  'hierarchs':    'hierarch',
  'monastics':    'monastic',
  'monasticMartyrs': 'monasticMartyr',
  'maidenMartyrs':   'maidenMartyr',
  'nuns':            'nun',
  'apostles':        'apostle',
};

/**
 * Fetches General Menaion texts for a given saint type, substituting
 * the (name) placeholder with the actual saint's name.
 *
 * Returns stichera-compatible rows or null if none found.
 */
function getGeneralMenaionTexts(saintType, title) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    // Try exact type, then fallback
    const types = [saintType];
    if (GENERAL_MENAION_FALLBACK[saintType]) types.push(GENERAL_MENAION_FALLBACK[saintType]);

    for (const type of types) {
      const rows = db.prepare(`
        SELECT saint_type, section, "order", tone, label, verse, text
        FROM general_menaion WHERE saint_type = ?
        ORDER BY section, "order"
      `).all(type);

      if (rows.length > 0) {
        const shortName = extractShortName(title);
        const sub = t => t.replace(/\(name(?:\s+of\s+the\s+event\/Icon)?\)/gi, shortName);
        // Order-convention reconcile: general_menaion uses order 0–2 = numbered
        // stichera, 90 = Glory doxastikon, 91 = Now/Theotokion. But the assembler
        // (for-date.js) expects the proper-stichera convention — order 0 = Glory,
        // order ≥1 = numbered stichera. Without remapping, the Glory/Theotokion
        // (90/91) render as extra numbered stichera and, since 90==91 for most
        // saint types, surface as a duplicate theotokion (July 12 audit). So:
        // stichera 0/1/2 → 1/2/3; Glory 90 → 0; drop the redundant Now (91) — the
        // Now is supplied by the Octoechos week-Theotokion, and combinesGloryNow
        // renders "Glory…, Now…: Theotokion" when no distinct week Theotokion.
        return rows
          .filter(r => r.order !== 91)
          .map(r => ({
            order:    r.order === 90 ? 0 : r.order + 1,
            section:  r.section,
            tone:     r.tone,
            label:    r.label,
            text:     sub(r.text),
            verse:    r.verse ? sub(r.verse) : null,
            dbSource: 'stSergius-general',
          }));
      }
    }
    return null;
  } catch (err) {
    console.error('getGeneralMenaionTexts error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

module.exports = { extractShortName, GENERAL_MENAION_FALLBACK, getGeneralMenaionTexts };
