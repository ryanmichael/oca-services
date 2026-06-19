#!/usr/bin/env node
'use strict';

// CLI: node scripts/grant-parish-token.js <parish_id> [label]
// Issues a new admin token for a parish. Prints the URL to hand to the
// admin out-of-band (email, in person, etc.). The token is shown ONCE.

const { issueToken } = require('../server-lib/parishes/auth');

const parishId = process.argv[2];
const label    = process.argv[3] || null;

if (!parishId) {
  console.error('Usage: node scripts/grant-parish-token.js <parish_id> [label]');
  process.exit(1);
}

try {
  const raw = issueToken({ parishId, label });
  const base = process.env.OCA_PUBLIC_URL || 'http://localhost:3000';
  console.log('\nToken issued.\n');
  console.log(`  Parish: ${parishId}`);
  if (label) console.log(`  Label:  ${label}`);
  console.log(`\n  First-visit URL (token will be set as cookie + URL cleaned):\n`);
  console.log(`    ${base}/parish-admin/${parishId}?token=${raw}`);
  console.log(`\n  Bookmark URL (after first visit):\n`);
  console.log(`    ${base}/parish-admin/${parishId}\n`);
  console.log('  This is the ONLY time the raw token is shown. Save the URL.\n');
} catch (err) {
  console.error('grant-parish-token FAILED:', err.message);
  process.exit(1);
}
