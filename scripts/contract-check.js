#!/usr/bin/env node
/**
 * Contract check — warns when a code surface declared by a feature contract
 * is modified without updating the spec or contract tests.
 *
 * Parses every `features/*.md` for backtick-quoted file paths under the
 * `## Code surface` heading. Compares those against the set of files changed
 * since the merge base with origin/main (or origin/staging if pushing to
 * staging). For each feature whose code surface is touched but whose spec
 * and tests are not, prints a reminder.
 *
 * Does NOT exit non-zero — this is a reminder, not a gate. Pass --strict to
 * exit 1 when any feature is flagged.
 *
 * Run: node scripts/contract-check.js [--strict] [--base <ref>]
 * Wired into: .git/hooks/pre-push (after npm test).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const FEATURES_DIR = path.join(REPO, 'features');
const CONTRACTS_DIR = path.join(REPO, 'test', 'contracts');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const baseIdx = args.indexOf('--base');
const explicitBase = baseIdx >= 0 ? args[baseIdx + 1] : null;

// ── Parse feature specs ────────────────────────────────────────────────────

function listFeatures() {
  if (!fs.existsSync(FEATURES_DIR)) return [];
  return fs.readdirSync(FEATURES_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => ({ name: f.replace(/\.md$/, ''), specPath: path.join(FEATURES_DIR, f) }));
}

/**
 * Extract backtick-quoted file paths from the "## Code surface" section of a
 * feature spec. Stops at the next `## ` heading. Returns paths relative to
 * the repo root.
 */
function parseCodeSurface(specPath) {
  const md = fs.readFileSync(specPath, 'utf8');
  const startRe = /^## Code surface\b/m;
  const start = md.search(startRe);
  if (start < 0) return [];
  const tail = md.slice(start);
  const nextHeading = tail.slice(2).search(/^## /m);
  const section = nextHeading < 0 ? tail : tail.slice(0, nextHeading + 2);
  // Match every `path/like/this.ext` — must contain a slash AND a dot so
  // generic identifiers like `feastOnly` don't match.
  const paths = new Set();
  const re = /`([^`\n]+)`/g;
  let m;
  while ((m = re.exec(section)) !== null) {
    const candidate = m[1].trim();
    if (candidate.includes('/') && /\.[a-zA-Z0-9]+(\b|$)/.test(candidate)) {
      paths.add(candidate);
    }
  }
  return [...paths];
}

/**
 * Parse `**Last verified:** <commit-ish>` from the spec body. When present,
 * the contract-check skips warnings for code-surface files that haven't
 * actually changed between that ref and HEAD — so cosmetic/unrelated touches
 * to liturgy.js stop nagging once the spec is re-verified.
 *
 * Returns the ref string (e.g. a SHA) or null. The ref must resolve via
 * `git rev-parse` for the suppression to take effect.
 */
function parseLastVerified(specPath) {
  const md = fs.readFileSync(specPath, 'utf8');
  // Match `**Last verified:** SHA` (bold) or plain `Last verified: SHA`.
  // Allow optional `**` either side of the colon and backticks around the
  // SHA. Anchor to start-of-line to avoid matching the same phrase inside
  // a sentence.
  const re = /^\s*\*{0,2}Last verified\*{0,2}:\*{0,2}\s*`?([0-9a-f]{7,40}|HEAD(?:~\d+)?)`?\s*$/mi;
  const m = md.match(re);
  return m ? m[1] : null;
}

// ── Diff resolution ────────────────────────────────────────────────────────

function resolveBase() {
  if (explicitBase) return explicitBase;
  // Try origin/main, then origin/staging, then HEAD~10 as a soft fallback.
  for (const ref of ['origin/main', 'origin/staging']) {
    try {
      execSync(`git rev-parse --verify --quiet ${ref}`, { cwd: REPO, stdio: 'ignore' });
      return ref;
    } catch (_) {}
  }
  return 'HEAD~10';
}

function changedFilesSince(base) {
  try {
    const out = execSync(`git diff --name-only ${base}...HEAD`, { cwd: REPO, encoding: 'utf8' });
    return out.split('\n').map(s => s.trim()).filter(Boolean);
  } catch (err) {
    console.error(`contract-check: git diff failed against ${base}: ${err.message}`);
    return [];
  }
}

// ── Match logic ────────────────────────────────────────────────────────────

function intersect(surfacePaths, changedPaths) {
  // Exact match, OR changed file ends with surface path (since specs may list
  // a partial path like `server-lib/sources/menaion.js` while git reports the
  // same path verbatim from repo root).
  const hits = [];
  const changedSet = new Set(changedPaths);
  for (const surface of surfacePaths) {
    if (changedSet.has(surface)) { hits.push(surface); continue; }
    const hit = changedPaths.find(c => c === surface || c.endsWith('/' + surface));
    if (hit) hits.push(hit);
  }
  return hits;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const features = listFeatures();
  if (features.length === 0) {
    return 0;
  }

  const base = resolveBase();
  const changed = changedFilesSince(base);
  if (changed.length === 0) {
    return 0;
  }

  const flagged = [];
  for (const f of features) {
    const surfaces = parseCodeSurface(f.specPath);
    if (surfaces.length === 0) continue;
    let hits = intersect(surfaces, changed);
    if (hits.length === 0) continue;

    // Honor `**Last verified:** <ref>` in the spec: if the code-surface hits
    // haven't actually changed since that ref, suppress the warning. The ref
    // must resolve. Failures (bad SHA, etc.) fall through to the original
    // base..HEAD behavior so a typo doesn't silently disable the check.
    const verifiedRef = parseLastVerified(f.specPath);
    if (verifiedRef) {
      try {
        execSync(`git rev-parse --verify --quiet ${verifiedRef}`, { cwd: REPO, stdio: 'ignore' });
        const sinceVerified = changedFilesSince(verifiedRef);
        const stillTouched = intersect(surfaces, sinceVerified);
        if (stillTouched.length === 0) continue; // verified — no warning
        hits = stillTouched;
      } catch (_) { /* unresolvable ref: ignore, keep original hits */ }
    }

    const specRel = path.join('features', `${f.name}.md`);
    const testRel = path.join('test', 'contracts', `${f.name}.test.js`);
    const specTouched = changed.includes(specRel);
    const testTouched = changed.includes(testRel);

    if (!specTouched || !testTouched) {
      flagged.push({ name: f.name, hits, specTouched, testTouched, specRel, testRel });
    }
  }

  if (flagged.length === 0) {
    return 0;
  }

  console.error('');
  console.error(`⚠  contract-check: ${flagged.length} feature contract(s) may need updating (base: ${base})`);
  console.error('');
  for (const f of flagged) {
    console.error(`  Feature: ${f.name}`);
    console.error(`    Code surfaces touched: ${f.hits.join(', ')}`);
    if (!f.specTouched) console.error(`    ⚠ spec NOT updated:  ${f.specRel}`);
    if (!f.testTouched) console.error(`    ⚠ tests NOT updated: ${f.testRel}`);
    console.error('');
  }
  console.error('  If the changes don\'t affect feature behavior, this is fine — proceed.');
  console.error('  If they do, update the spec\'s behavior table + invariants and the contract tests.');
  console.error('  Bypass once: git push --no-verify');
  console.error('');

  return strict ? 1 : 0;
}

process.exit(main());
