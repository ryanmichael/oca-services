#!/usr/bin/env node
'use strict';

// CLI: node scripts/drift-check.js
// Runs all drift validators and exits non-zero on any warnings.
// Suitable for CI / pre-push gating once Phase 1 parish data exists.

const {
  validateVariantLibrary,
  validateParishVariantPicks,
  validateParishPractice,
  validateCommemorationDupes,
  validateRankSaintTypePopulated,
  validateSticheraTextIntegrity,
  validateSticheraCommemorationMismatch,
  validateSticheraLabelSubject,
  validateSticheraSourceMixing,
  validateTropariaTransformIntegrity,
  validateTextCosmetics,
  validateRubricBleed,
} = require('../server-lib/overlays/drift');

let totalWarnings = 0;

const checks = [
  ['variant library', validateVariantLibrary],
  ['parish variant picks', validateParishVariantPicks],
  ['parish practice', validateParishPractice],
  ['commemoration dupes', validateCommemorationDupes],
  ['rank-bearing saint_type populated', validateRankSaintTypePopulated],
  ['sticheron text integrity', validateSticheraTextIntegrity],
  ['stichera↔commemoration subject match', validateSticheraCommemorationMismatch],
  ['stichera label↔commemoration subject match', validateSticheraLabelSubject],
  ['stichera source-mixing', validateSticheraSourceMixing],
  ['troparia transformer integrity', validateTropariaTransformIntegrity],
  ['text cosmetics (entities + glued punctuation)', validateTextCosmetics],
  ['rubric bleed in sung text', validateRubricBleed],
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
