#!/usr/bin/env node
/**
 * One-time setup: point git at the versioned .githooks/ directory so the
 * pre-push gate (smoke + contracts + contract-check + audits) runs locally
 * for every contributor, not just the one that hand-installed it.
 *
 * Run: npm run setup-hooks
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '..');
const hooksDir = path.join(repoRoot, '.githooks');

if (!fs.existsSync(hooksDir)) {
  console.error(`setup-hooks: .githooks/ not found at ${hooksDir}`);
  process.exit(1);
}

try {
  execSync('git config core.hooksPath .githooks', { cwd: repoRoot, stdio: 'inherit' });
  console.log('✓ git core.hooksPath set to .githooks');
  console.log('  pre-push gate will run on every push from this clone.');
  console.log('  Bypass once with: git push --no-verify');
} catch (err) {
  console.error('setup-hooks: failed to set git config:', err.message);
  process.exit(1);
}
