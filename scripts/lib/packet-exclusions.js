'use strict';

/**
 * Pieces a choir packet PRINTS but the service does not SING.
 *
 * A packet page is a LIBRARY, not a rubric. The Menaion day-files and the
 * Octoechos tone pages carry every hymn the day could use, and the director
 * strikes through in pen whatever the rubric does not reach. OCR cannot see a
 * pen stroke, so choir-packet-diff counts a struck hymn as appointed and
 * reports it as a hymn we failed to print. On great-vespers-2026-11-07 the
 * director put one diagonal X through three Aposticha stichera and circled the
 * Tone 8 Glory that survives; we print exactly what survives, and were marked
 * down for it.
 *
 * That now matters beyond the number: the per-sheet ratchet is a BLOCKING
 * pre-push gate, so a false miss on a newly-filed packet stops a push. The
 * only other way to go green would be to refresh the baseline, which is how an
 * oracle rots.
 *
 * ── THIS IS AN ESCAPE HATCH, AND IT IS BUILT TO RESIST BECOMING ONE ─────────
 *
 * An exclusions list can explain away any inconvenient finding, which would
 * destroy the only ground truth we have about what the parish actually sings.
 * Four constraints, all enforced in code, not in etiquette:
 *
 *   1. CLOSED VOCABULARY. `reason` must be one of REASONS. Adding a reason
 *      means editing this file, which means review.
 *   2. CONTENT-ADDRESSED. An entry names the sha256 of the piece's letters.
 *      It cannot drift onto a different hymn, and it cannot be written from an
 *      impression of the scan — you need the piece in front of you
 *      (`--sheet <name> --pieces` prints the sha of each).
 *   3. A STALE ENTRY IS A FINDING. If an entry matches no piece on its sheet,
 *      that is reported and fails `--check`. A list that silently stops
 *      applying is worse than no list.
 *   4. ALWAYS VISIBLE. Every report prints the exclusion count per sheet, so a
 *      sheet carried by exclusions looks like one.
 *
 * `citation` must say WHERE the mark is and WHAT it looks like, so a reviewer
 * can open the scan and disagree. "Read visually" is the standard; the OCR
 * sidecar is an index, never evidence.
 */

const crypto = require('crypto');

/** The only admissible reasons. Deliberately short. */
const REASONS = {
  // An unambiguous pen strikethrough across the hymn in the director's hand.
  // NOT a highlight, box, arrow or marginal note — those are selection aids
  // whose meaning we do not know, and guessing at one put a choir sheet's
  // pen marks onto the wrong part of a service once already.
  struck: 'struck through in the director\'s hand',
};

const letters = (s) => String(s || '').toLowerCase().replace(/[^a-z]+/g, '');
const shaOf = (text) => crypto.createHash('sha256').update(letters(text)).digest('hex');

/**
 * Validate the file's shape. Returns an array of human-readable problems;
 * empty means usable. Called before anything is excluded, so a malformed file
 * is loud rather than silently inert.
 */
function validate(doc) {
  const problems = [];
  const sheets = (doc && doc.sheets) || {};
  for (const [sheet, entries] of Object.entries(sheets)) {
    if (!Array.isArray(entries)) { problems.push(`${sheet}: not an array`); continue; }
    entries.forEach((e, i) => {
      const at = `${sheet}[${i}]`;
      if (!e || typeof e !== 'object') { problems.push(`${at}: not an object`); return; }
      if (!REASONS[e.reason]) problems.push(`${at}: reason "${e.reason}" is not one of ${Object.keys(REASONS).join(', ')}`);
      if (!/^[0-9a-f]{64}$/.test(e.sha256 || '')) problems.push(`${at}: sha256 must be 64 hex chars`);
      if (!e.citation || String(e.citation).trim().length < 20)
        problems.push(`${at}: citation must say where the mark is and what it looks like`);
      if (!e.incipit) problems.push(`${at}: incipit missing (humans read this file too)`);
    });
  }
  return problems;
}

/**
 * Split a sheet's pieces into those that count and those excluded.
 * @returns {{kept: Array, excluded: Array, stale: Array}}
 *          `stale` lists entries that matched nothing — a finding, not a shrug.
 */
function applyTo(sheetName, pieces, doc) {
  const entries = ((doc && doc.sheets) || {})[sheetName] || [];
  if (!entries.length) return { kept: pieces, excluded: [], stale: [] };

  const used = new Set();
  const kept = [], excluded = [];
  for (const p of pieces) {
    const sha = shaOf(p.text);
    const hit = entries.find(e => e.sha256 === sha);
    if (hit) {
      used.add(hit.sha256);
      excluded.push({ reason: hit.reason, citation: hit.citation, head: p.text.slice(0, 60) });
    } else {
      kept.push(p);
    }
  }
  const stale = entries.filter(e => !used.has(e.sha256));
  return { kept, excluded, stale };
}

module.exports = { REASONS, letters, shaOf, validate, applyTo };
