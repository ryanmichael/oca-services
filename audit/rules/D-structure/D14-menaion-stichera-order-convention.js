'use strict';

// Menaion stichera order convention check. After 2026-06-20 cleanup the
// project convention is:
//   order = -1   Stavrotheotokion alternative (saint-specific theotokion)
//   order =  0   Glory / doxasticon
//   order >= 1   regular idiomelon stichera, ascending against psalm verses
//
// Catches scraper drift where a saint's data is imported with the old
// pattern (order 0..N as regular stichera + order 90 as the Glory). That
// pattern caused the assembler — which uses `order === 0` for Glory and
// `order >= 1` for verse-stichera — to render the wrong sticheron as
// Glory across 152 saints' Vespers until the bulk migration.
//
// Anchored on Jan 1 vespers; reads the stichera table directly,
// independent of any rendered output.

const path = require('path');

module.exports = {
  id:             'D14-menaion-stichera-order-convention',
  family:         'structure',
  severity:       'high',
  description:    'No menaion stichera row uses order≥90 — those slots were the legacy "Glory at tail" pattern that has been migrated to order=0 (Glory) / order=-1 (Stavrotheotokion alt).',
  needsAssembled: false,
  appliesTo: (ctx) => ctx.date === '2026-01-01' && ctx.service === 'vespers',
  check: () => {
    const findings = [];
    const { openDb } = require(path.resolve(__dirname, '..', '..', '..', 'server-lib', 'cache', 'sqlite'));
    const db = openDb();
    if (!db) return [];                                  // DB absent → skip
    try {
      const exists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='stichera'"
      ).get();
      if (!exists) return [];

      const rows = db.prepare(`
        SELECT s.commemoration_id, c.title, s.section, COUNT(*) AS legacy_rows
        FROM stichera s LEFT JOIN commemorations c ON c.id = s.commemoration_id
        WHERE s."order" >= 90
        GROUP BY s.commemoration_id, s.section
      `).all();

      for (const r of rows) {
        findings.push({
          message:
            `Commemoration #${r.commemoration_id} "${r.title || '(unknown)'}" still has ` +
            `${r.legacy_rows} stichera row(s) at order>=90 in section "${r.section}". ` +
            `Migrate to canonical convention (90 → 0, 91 → -1, shift remaining orders up by 1).`,
          hint:
            'See storage migration template at /tmp/order-convention-fix.sql (2026-06-20).',
        });
      }
      return findings;
    } finally {
      db.close();
    }
  },
};
