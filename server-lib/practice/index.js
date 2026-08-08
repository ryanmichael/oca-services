'use strict';

// ── Parish practice layer ────────────────────────────────────────────────────
//
// Declarative, NON-DESTRUCTIVE shape operations a parish can apply to canonical
// text. Where the translation cascade governs *what the words are*, this governs
// *which units are actually sung*.
//
// The distinction matters because the two scale differently. Text customization
// is data-driven — no variant id appears anywhere in code. Shape customization
// has historically meant one bespoke boolean plus one to three hand-written code
// branches per practice; eleven of the twelve parish rubrics are shape.
//
// The critical property is that a selection can never delete canon. It names the
// units it keeps; the canonical array is untouched and one setting-change away.
// Storing the *intent* rather than its output is what c95da45 lacked: a
// replacement array is indistinguishable from a transcription gap six months on.
//
// Narrow scope, deliberately. Only `select` (with an optional `reprise` tail) is
// implemented, because that is what an actual parish needed. `count`, `repeat`,
// `move`, `speaker` and `pick` slot in behind the same addressing and validator
// when a second need appears — see features/practice-layer.md.
//
// Operations are DATA, not a language. No conditionals, no expressions. A
// practice needing logic is a rubric with code, not an entry here.

const crypto = require('crypto');

// ── Addressing ───────────────────────────────────────────────────────────────
//
// Canonical verse arrays already carry sub-verse structure: a `\n` separates
// stichoi (the `*` breath marks of the printed psalter). An address is
// "<verse>.<stichos>", both 1-based, e.g. "2.1".
//
// Index addressing is brittle against upstream re-splitting or re-translation,
// which is what `fingerprint` guards. Never silently re-point an address.

const ADDRESS_RE = /^(\d+)\.(\d+)$/;

function parseAddress(addr) {
  const m = ADDRESS_RE.exec(String(addr).trim());
  if (!m) return null;
  const verse = Number(m[1]);
  const stichos = Number(m[2]);
  if (verse < 1 || stichos < 1) return null;
  return { verse, stichos };
}

/** Split a canonical verse array into addressable stichoi.
 *  Returns Map<"v.s", string> plus the per-verse split for regrouping. */
function explode(verses) {
  const byAddress = new Map();
  const split = verses.map((v) => String(v).split('\n'));
  split.forEach((lines, vi) => {
    lines.forEach((line, si) => {
      byAddress.set(`${vi + 1}.${si + 1}`, line);
    });
  });
  return { byAddress, split };
}

/** Short, stable fingerprint of a canonical array. Changes whenever the text is
 *  re-worded or re-split — which is exactly when a stored selection must be
 *  re-checked against the source it was derived from. */
function fingerprint(verses) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify(verses));
  return h.digest('hex').slice(0, 8);
}

// ── The `select` operation ───────────────────────────────────────────────────

/** Apply a stichos selection, preserving the original verse grouping so refrain
 *  placement is unchanged. Verses left with no surviving stichoi drop out.
 *  `reprise` addresses are appended as their own trailing units. */
function applySelect(verses, entry) {
  const { byAddress, split } = explode(verses);

  const keep = Array.isArray(entry.keep) ? entry.keep : [];
  if (keep.length === 0) {
    return { error: 'select entry has an empty `keep` list' };
  }

  const kept = new Set();
  for (const addr of keep) {
    const parsed = parseAddress(addr);
    if (!parsed) return { error: `malformed address "${addr}"` };
    if (!byAddress.has(addr)) {
      return { error: `address "${addr}" does not resolve against the current text ` +
                      `(${verses.length} verse(s))` };
    }
    kept.add(addr);
  }

  const reprise = Array.isArray(entry.reprise) ? entry.reprise : [];
  for (const addr of reprise) {
    if (!parseAddress(addr)) return { error: `malformed reprise address "${addr}"` };
    if (!byAddress.has(addr)) {
      return { error: `reprise address "${addr}" does not resolve against the current text` };
    }
  }

  const out = [];
  split.forEach((lines, vi) => {
    const surviving = lines.filter((_, si) => kept.has(`${vi + 1}.${si + 1}`));
    if (surviving.length) out.push(surviving.join('\n'));
  });
  for (const addr of reprise) out.push(byAddress.get(addr));

  return { value: out };
}

const OPS = { select: applySelect };

// ── Entry point ──────────────────────────────────────────────────────────────

function getDotted(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

/** Immutably set a dotted key, cloning only the objects along the path so the
 *  shared/cached fixed-text tree is never mutated. */
function setDottedImmutable(root, dotted, value) {
  const parts = dotted.split('.');
  const clone = { ...root };
  let cur = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    cur[k] = Array.isArray(cur[k]) ? cur[k].slice() : { ...cur[k] };
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return clone;
}

/**
 * Apply a parish's practice entries to a resolved fixed-text tree.
 *
 * Returns `{ texts, warnings }`. `texts` is a new object — the input is never
 * mutated. On ANY problem the offending entry is skipped and the canonical text
 * renders unchanged: too much text is a visible, self-correcting error, whereas
 * too little is the silent one that took six weeks to notice last time.
 *
 * @param {object} fixedTexts  resolved fixed texts for one service
 * @param {Array}  practice    parish practice entries (rubrics.practice)
 * @param {string} service     e.g. 'liturgy' — entries not matching are ignored
 */
function applyPractice(fixedTexts, practice, service) {
  const warnings = [];
  if (!fixedTexts || !Array.isArray(practice) || practice.length === 0) {
    return { texts: fixedTexts, warnings };
  }

  let texts = fixedTexts;

  for (const entry of practice) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.service && entry.service !== service) continue;

    const target = entry.target;
    const op     = entry.op;

    if (typeof target !== 'string' || !target) {
      warnings.push('practice entry missing `target`');
      continue;
    }
    if (!OPS[op]) {
      warnings.push(`practice entry for "${target}": unknown op "${op}"`);
      continue;
    }
    if (entry.units && entry.units !== 'stichoi') {
      warnings.push(`practice entry for "${target}": unsupported units "${entry.units}"`);
      continue;
    }

    const current = getDotted(texts, target);
    if (!Array.isArray(current)) {
      warnings.push(`practice entry for "${target}": target is not an array — skipped`);
      continue;
    }

    // Fingerprint mismatch does NOT block the edit. The addresses are validated
    // independently below, and a re-worded but identically-structured text is
    // the common case (e.g. a new translation layer landing beneath). It is
    // still surfaced, because it is the moment a human should re-read the
    // selection against the source it came from.
    if (entry.fingerprint) {
      const actual = fingerprint(current);
      if (actual !== entry.fingerprint) {
        warnings.push(
          `practice entry for "${target}": source fingerprint changed ` +
          `(recorded ${entry.fingerprint}, now ${actual}) — re-verify the selection ` +
          `against the parish source, then update the fingerprint`);
      }
    }

    const result = OPS[op](current, entry);
    if (result.error) {
      warnings.push(`practice entry for "${target}": ${result.error} — skipped, ` +
                    `canonical text renders unchanged`);
      continue;
    }

    texts = setDottedImmutable(texts, target, result.value);
  }

  return { texts, warnings };
}

module.exports = {
  applyPractice,
  applySelect,
  fingerprint,
  parseAddress,
  explode,
};
