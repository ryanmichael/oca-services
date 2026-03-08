/**
 * Generate the service sheet HTML for a given calendar day.
 * Usage: node render.js [output.html]
 */

const fs   = require('fs');
const path = require('path');
const { assembleVespers } = require('./assembler');
const { renderVespers }   = require('./renderer');

function loadJSON(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), 'utf8'));
}

// ── Load data ─────────────────────────────────────────────────────────────────
const calendarDay = loadJSON('variable-sources/calendar/2026-03-07.json');
const fixedTexts  = loadJSON('fixed-texts/vespers-fixed.json');
const prokeimena  = loadJSON('variable-sources/prokeimena.json');
const octoechos   = loadJSON('variable-sources/octoechos.json');
const triodionRaw = loadJSON('variable-sources/triodion/lent-soul-saturday-2.json');
const menaionRaw  = loadJSON('variable-sources/menaion/march-07.json');

const sources = {
  prokeimena,
  octoechos: { tone5: octoechos.tone5 },
  triodion:  { lent: { soulSaturday2: triodionRaw.vespers } },
  menaion:   { 'march-07': menaionRaw.vespers },
};

// ── Assemble + Render ─────────────────────────────────────────────────────────
const blocks = assembleVespers(calendarDay, fixedTexts, sources);
const html   = renderVespers(blocks, {
  title: 'Great Vespers',
  date:  'Saturday, March 7, 2026 — Soul Saturday II / Hieromartyrs of Cherson',
});

// ── Write output ──────────────────────────────────────────────────────────────
const outFile = process.argv[2] || 'vespers-2026-03-07.html';
fs.writeFileSync(path.join(__dirname, outFile), html, 'utf8');
console.log(`Written: ${outFile}  (${blocks.length} blocks)`);
