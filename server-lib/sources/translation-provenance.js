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
  // The General Menaion's category stand-ins (250 rows, every one of them
  // `stSergius-general`). Unmapped until 2026-10-29, so familyOf() returned
  // 'unknown' for all of them and the book was unattributable anywhere in the
  // corpus. It stayed invisible because the fallback only fires where a saint
  // has no service of his own; tagging the angelic commemorations routed four
  // blocks through it on 7-12, which is how it surfaced.
  //
  // Its OWN family, not folded into 'stsergius'. The assembler already names
  // it separately on the aposticha path (menaionProvenance = 'St. Sergius
  // (General)') and the sweep already counts the pair as distinct, so merging
  // them here would contradict both. A category stand-in addressed to "O holy
  // one" is also not the same artifact as that saint's own translated service.
  'stSergius-general': 'stsergius-general',
  'raphaela':      'raphaela',
  // The parish's weekday book. A distinct translation, NOT an OCA artifact:
  // giving it the 'oca' family would make a weekday service mixing it with an
  // OCA Menaion saint look single-translation when it is two books. That
  // pairing IS what the parish sings, but D23 should still say so plainly.
  'mtMaryDailyOctoechos': 'mtmary',
  // The Sunday Beatitudes of all eight tones, from saintjonah.org's Octoechos
  // Beatitude Verses. Its OWN family, not folded into 'lambertsen': a
  // different artifact, and the detector's job is to report the seam, not to
  // decide the two are close enough.
  //
  // Unmapped until 2026-11-02, and the miss was worse than 'unknown' would
  // have been — the tag lives on a bare `source` key, which the index walker
  // below did not read, so every one of these texts inherited the file's
  // no-tag default and reported as 'oca'. The whole resurrectional half of
  // every Sunday's Third Antiphon was laundered into the OCA family, which is
  // exactly why nothing flagged the 2026-11-01 mix a reader heard aloud.
  'htm-octoechos-sunday-beatitudes': 'htm',
};

const LABEL = {
  oca:        'OCA',
  lambertsen: 'Lambertsen',
  stsergius:  'St. Sergius',
  // Matches the string the assembler already uses on the aposticha path, so
  // the two routes name the same book the same way.
  'stsergius-general': 'St. Sergius (General)',
  raphaela:   'Myrrh-bearers (Raphaela)',
  mtmary:     'Daily Octoechos',
  htm:        'Holy Transfiguration Monastery',
  unknown:    'unknown',
};

/** `oca-packet-2026-0919` and friends are OCA; anything unmapped is unknown. */
function familyOf(dbSource) {
  if (!dbSource) return 'unknown';
  if (FAMILY[dbSource]) return FAMILY[dbSource];
  if (/^oca[-_]/i.test(dbSource)) return 'oca';
  return 'unknown';
}

/** The DB's `source` column is a controlled vocabulary, so `familyOf` can match
 *  it exactly. A variable-source file's `_meta._source` is freeform prose
 *  written by whoever ingested it — "Matins: St-Sergius Emenaion 11-01.pdf",
 *  "OCA service texts 2025-0806-texts-tt.docx". Attribute those by pattern.
 *  Checked most-specific first; an unrecognised string stays 'unknown' rather
 *  than guessing, because a wrong attribution hides a mix. */
function familyOfProse(prose) {
  const t = String(prose || '');
  if (!t.trim()) return 'unknown';
  if (FAMILY[t]) return FAMILY[t];                 // some files use a DB-style tag
  if (/lambertsen/i.test(t))                 return 'lambertsen';
  if (/raphaela/i.test(t))                   return 'raphaela';
  if (/st[-_\s]*sergius/i.test(t))           return 'stsergius';
  if (/\b(htm|holy\s+transfiguration)\b/i.test(t)) return 'htm';
  if (/\boca\b/i.test(t))                    return 'oca';
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

  // A node's provenance tag governs the hymns beneath it. BOTH spellings are
  // read: `_source` is the convention, but the Sunday Beatitudes nodes tag
  // themselves with a bare `source`, and reading only `_source` meant those
  // eight nodes silently inherited the file default and reported as OCA.
  // `resolve` maps a tag to a family; non-clobbering so an earlier, more
  // specific attribution wins.
  const walkTagged = (node, inherited, resolve) => {
    if (!node || typeof node !== 'object') return;
    const tag = (typeof node._source === 'string' && node._source)
      || (typeof node.source === 'string' && node.source)
      || inherited;
    if (typeof node.text === 'string' && node.text.trim()) {
      const fam = resolve(tag);
      if (!map.has(norm(node.text))) map.set(norm(node.text), fam);
      // Some books print the genre heading INSIDE the text ("Theotokion: O
      // Bride of God…"). The Beatitudes blend lifts that prefix into the
      // block's label before rendering, so the rendered text no longer matches
      // the stored text and the hymn came back 'unknown' — 3 of the 4
      // Unmercenaries troparia attributed on 2026-11-01, not 4. Index the
      // stripped form too, mirroring the same strip in
      // sources/beatitudes.js loadBlendParts().
      const stripped = node.text.replace(
        /^(Theotokion|Stavrotheotokion|Triadicon|Martyricon)\s*[:\u2014-]\s*/i, '');
      if (stripped !== node.text && stripped.trim() && !map.has(norm(stripped))) {
        map.set(norm(stripped), fam);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === '_source' || k === 'source' || k === 'text') continue;
      if (Array.isArray(v)) v.forEach(x => walkTagged(x, tag, resolve));
      else if (v && typeof v === 'object') walkTagged(v, tag, resolve);
    }
  };

  // 1. Octoechos. No tag on a node means the OCA Obikhod — the file's own
  //    convention.
  try {
    const octo = require(path.join(ROOT, 'variable-sources', 'octoechos.json'));
    walkTagged(octo, 'oca-menaion', familyOf);
  } catch (_) { /* a missing source file is not a finding */ }

  // 1b. Menaion day-files and feast-canons. Never indexed before 2026-11-02, so
  //     every canon-ode troparion in the corpus was 'unknown' — including the
  //     four the Beatitudes blend pulls into the Third Antiphon on a saint's
  //     Sunday. Indexed BEFORE the DB below, which uses a plain `set` and so
  //     still wins on a text collision: the DB's controlled vocabulary is the
  //     better attribution than a file's freeform prose.
  //     An untagged file stays 'unknown' here — unlike the Octoechos there is
  //     no file-wide default that would be honest to assume.
  for (const sub of ['menaion', 'feast-canons']) {
    const dir = path.join(ROOT, 'variable-sources', sub);
    let files = [];
    try { files = require('fs').readdirSync(dir).filter(f => f.endsWith('.json')); }
    catch (_) { continue; }
    for (const f of files) {
      try {
        const data = require(path.join(dir, f));
        walkTagged(data, data?._meta?._source || '', familyOfProse);
      } catch (_) { /* one unreadable day-file is not a finding */ }
    }
  }

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
    // 2a. The General Menaion, indexed FIRST so a saint's own stichera win on
    // a text collision — the specific service is the better attribution than
    // the category stand-in. Added 2026-10-29: this table was never indexed,
    // so every one of its 250 rows was unattributable and the fallback showed
    // up as "unresolved" wherever it fired. Same shape as the better-sqlite3
    // failure recorded above — the index was missing a whole book, and a
    // missing book reads as a cleaner corpus than we have.
    for (const r of db.prepare('SELECT text, source FROM general_menaion').all()) {
      if (r && r.text) { map.set(norm(r.text), familyOf(r.source)); dbRows++; }
    }
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

module.exports = { FAMILY, LABEL, familyOf, familyOfProse, familyOfText, index, norm };
