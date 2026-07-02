#!/usr/bin/env node
'use strict';

// CLI: node scripts/drift-check.js
// Runs all drift validators and exits non-zero on any warnings.
// Suitable for CI / pre-push gating once Phase 1 parish data exists.

const {
  validateVariantLibrary,
  validateParishVariantPicks,
  validateCommemorationDupes,
  validateRankSaintTypePopulated,
  validateSticheraTextIntegrity,
  validateTropariaTransformIntegrity,
} = require('../server-lib/overlays/drift');

let totalWarnings = 0;

const checks = [
  ['variant library', validateVariantLibrary],
  ['parish variant picks', validateParishVariantPicks],
  ['commemoration dupes', validateCommemorationDupes],
  ['rank-bearing saint_type populated', validateRankSaintTypePopulated],
  ['sticheron text integrity', validateSticheraTextIntegrity],
  ['troparia transformer integrity', validateTropariaTransformIntegrity],
];

for (const [label, fn] of checks) {
  try {
    const result = fn();
    totalWarnings += result.warnings || 0;
  } catch (err) {
    console.error(`[drift:check] ${label} crashed: ${err.message}`);
    totalWarnings += 1;
  }
}

if (totalWarnings > 0) {
  console.error(`[drift:check] FAIL — ${totalWarnings} warning(s)`);
  process.exit(1);
}
console.log('[drift:check] OK');
process.exit(0);
