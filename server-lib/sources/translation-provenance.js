'use strict';

// Which TRANSLATION a sung text came from — as opposed to which BOOK.
//
// `block.source` says octoechos / menaion / triodion: the book. It says nothing
// about whose English it is, and the two are independent. On 2026-10-04 the
// seven Resurrection stichera were the OCA Obikhod's English while St
// Hierotheus's three were st-sergius.org's, and a parishioner heard the seam
// before any check did.
//
// The existing `provenance` field on a block is NOT a reliable answer. It reads
// only the first DB row of the slot and maps everything that is not stSergius to
// 'OCA', so all 1,052 lambertsen rows and 353 raphaela rows report as OCA, and
// the weekday Octoechos (whose nodes carry `_source: 'stSergius'`) does too.
// This module resolves the real translation from the stored text instead, which
// is why the rule that uses it does not trust `block.provenance`.
//
// Ground truth has two homes:
//   * `stichera.source` in the DB — menaion/saint texts
//   * `_source` on a day-node in variable-sources/octoechos.json — the weekday
//     cycle is st-sergius.org; the Saturday/Sunday nodes carry no tag and are
//     the OCA Obikhod.

const path = require('path');

// A translation FAMILY. Rows differing only in which OCA artifact they were
// transcribed from are one family — the question is whether a service mixes
// translations a singer would hear, not where a file came from.
const FAMILY = {
  'oca-menaion':   'oca',
  'oca-feast':     'oca',
  'tyler-booklet': 'oca',   // the parish booklet IS the OCA text: measured
                            // 96.6%–100% against files.oca.org across 5 services
                            // (2026-10-04, and liturgies 09-13/09-20/09-27)
  'lambertsen':    'lambertsen',
  'stSergius':     'stsergius',
  'raphaela':      'raphaela',
  // The parish's weekday book. A distinct translation, NOT an OCA artifact:
  // giving it the 'oca' family would make a weekday service mixing it with an
  // OCA Menaion saint look single-translation when it is two books. That
  // pairing IS what the parish sings, but D23 should still say so plainly.
  'mtMaryDailyOctoechos': 'mtmary',
};

const LABEL = {
  oca:        'OCA',
  lambertsen: 'Lambertsen',
  stsergius:  'St. Sergius',
  raphaela:   'Myrrh-bearers (Raphaela)',
  mtmary:     'Daily Octoechos',
  unknown:    'unknown',
};

/** `oca-packet-2026-0919` and friends are OCA; anything unmapped is unknown. */
function familyOf(dbSource) {
  if (!dbSource) return 'unknown';
  if (FAMILY[dbSource]) return FAMILY[dbSource];
  if (/^oca[-_]/i.test(dbSource)) return 'oca';
  return 'unknown';
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

let _index = null;

/**
 * text -> family, built once from both ground-truth homes.
 *
 * Matching on text rather than on a key because a rendered Menaion block carries
 * `auto.<date>.lordICall`, not a row id — the text is the only thing that
 * travels intact from the row to the block.
 */
function index(opts = {}) {
  if (_index && !opts.force) return _index;
  const ROOT = path.resolve(__dirname, '..', '..');
  const map = new Map();

  // 1. Octoechos. A day-node's `_source` governs the hymns beneath it.
  try {
    const octo = require(path.join(ROOT, 'variable-sources', 'octoechos.json'));
    const walk = (node, inherited) => {
      if (!node || typeof node !== 'object') return;
      const src = typeof node._source === 'string' ? node._source : inherited;
      if (typeof node.text === 'string' && node.text.trim()) {
        if (!map.has(norm(node.text))) map.set(norm(node.text), familyOf(src));
      }
      for (const [k, v] of Object.entries(node)) {
        if (k === '_source' || k === 'text') continue;
        if (Array.isArray(v)) v.forEach(x => walk(x, src));
        else if (v && typeof v === 'object') walk(v, src);
      }
    };
    // No `_source` on a node means the OCA Obikhod — the file's own convention.
    walk(octo, 'oca-menaion');
  } catch (_) { /* a missing source file is not a finding */ }

  // 2. The stichera table. The project opens SQLite through node:sqlite, not
  // better-sqlite3 — an earlier draft of this file required the latter, the
  // catch swallowed "Cannot find module", and the index silently covered only
  // the Octoechos: 1,587 texts instead of 5,000+, with zero lambertsen or
  // raphaela rows. A detector missing two of the four translations would have
  // reported the corpus far cleaner than it is, so the failure is recorded on
  // the index now rather than hidden.
  let dbRows = 0, dbError = null;
  try {
    const { openDb } = require(path.join(ROOT, 'server-lib', 'cache', 'sqlite'));
    const db = openDb();
    if (!db) throw new Error('openDb() returned null — storage/oca.db missing');
    for (const r of db.prepare('SELECT text, source FROM stichera').all()) {
      if (r && r.text) { map.set(norm(r.text), familyOf(r.source)); dbRows++; }
    }
    db.close();
  } catch (err) { dbError = err.message; }

  map._dbRows  = dbRows;
  map._dbError = dbError;
  _index = map;
  return map;
}

/** The translation family of a rendered hymn, or 'unknown'. */
function familyOfText(text) {
  return index().get(norm(text)) || 'unknown';
}

module.exports = { FAMILY, LABEL, familyOf, familyOfText, index, norm };
