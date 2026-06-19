'use strict';

// Resolves a parish's stable patron natural key (e.g. "12-04/john-of-damascus")
// to the current menaion `commemorations.id`. The natural key survives menaion
// DB rebuilds because it's derived from (month, day) + a name slug — the int
// id is not stable (see CLAUDE.md / Track B / Track E / Synaxis-NA migration
// 2026-06-13 evidence). Resolution at request time means a future menaion
// rebuild doesn't silently re-point Tyler's patron.
//
// Format: "MM-DD/<slug>" — e.g. "12-04/john-of-damascus".
//   MM    — feast month, zero-padded
//   DD    — feast day, zero-padded
//   slug  — kebab-case form of the patron's name (or a unique substring)
//
// Match strategy: filter by (month, day), then accept the row whose
// slugified-title CONTAINS the natural-key slug. If multiple match, prefer
// the one with the longer/closer match; if none, return null and let the
// caller warn.

const { openDb } = require('../cache/sqlite');

function parseNaturalKey(naturalKey) {
  const m = /^(\d{2})-(\d{2})\/([a-z0-9-]+)$/.exec(naturalKey || '');
  if (!m) return null;
  return { month: parseInt(m[1], 10), day: parseInt(m[2], 10), slug: m[3] };
}

function slugify(title) {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolvePatronByNaturalKey(naturalKey) {
  const parsed = parseNaturalKey(naturalKey);
  if (!parsed) return null;

  const db = openDb();
  if (!db) return null;
  try {
    const rows = db.prepare(
      'SELECT id, month, day, title, oca_slug FROM commemorations WHERE month = ? AND day = ?'
    ).all(parsed.month, parsed.day);

    let best = null;
    let bestScore = -1;
    for (const row of rows) {
      const slug = (row.oca_slug && row.oca_slug.length) ? row.oca_slug : slugify(row.title);
      let score = -1;
      if (slug === parsed.slug) score = 100;
      else if (slug.includes(parsed.slug)) score = 50 + parsed.slug.length;
      else if (parsed.slug.includes(slug)) score = 30 + slug.length;
      if (score > bestScore) { bestScore = score; best = row; }
    }
    return best;
  } finally {
    db.close();
  }
}

module.exports = { resolvePatronByNaturalKey, parseNaturalKey, slugify };
