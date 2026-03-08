/**
 * Test: Assemble Great Vespers for March 7, 2026
 * Run: node test-assembly.js
 */

const fs = require('fs');
const path = require('path');
const { assembleVespers } = require('./assembler');

function loadJSON(relPath) {
  const full = path.join(__dirname, relPath);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

// ── Load all data files ───────────────────────────────────────────────────────
const calendarDay  = loadJSON('variable-sources/calendar/2026-03-07.json');
const fixedTexts   = loadJSON('fixed-texts/vespers-fixed.json');
const prokeimena   = loadJSON('variable-sources/prokeimena.json');
const octoechos    = loadJSON('variable-sources/octoechos.json');

// Load triodion and menaion as flat objects keyed by their 'key' field
const triodionRaw  = loadJSON('variable-sources/triodion/lent-soul-saturday-2.json');
const menahionRaw  = loadJSON('variable-sources/menaion/march-07.json');

// ── Build source lookup objects ───────────────────────────────────────────────
// The resolveSource function uses dot-notation on these objects.
// We structure them to match the key paths used in the calendar entry.
//
// e.g. "lent.soulSaturday2.lordICall.glory" → triodion.lent.soulSaturday2.lordICall.glory

const sources = {
  prokeimena,
  octoechos: {
    tone5: octoechos.tone5
  },
  triodion: {
    lent: {
      soulSaturday2: triodionRaw.vespers
    }
  },
  menaion: {
    'march-07': menahionRaw.vespers
  }
};

// ── Assemble ──────────────────────────────────────────────────────────────────
console.log('Assembling Great Vespers for March 7, 2026...\n');
const blocks = assembleVespers(calendarDay, fixedTexts, sources);

// ── Print output ──────────────────────────────────────────────────────────────
let currentSection = null;
let blockCount = 0;

for (const block of blocks) {
  if (block.section !== currentSection) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${block.section.toUpperCase()}`);
    console.log('═'.repeat(60));
    currentSection = block.section;
  }

  const speakerTag = block.speaker ? `[${block.speaker.toUpperCase()}]` : '';
  const toneTag = block.tone ? ` {Tone ${block.tone}}` : '';
  const sourceTag = block.source ? ` (${block.source})` : '';
  const labelTag = block.label ? ` — ${block.label}` : '';

  console.log(`\n  ${speakerTag}${toneTag}${sourceTag}${labelTag}`);
  // Truncate long texts for readability in the test
  const displayText = block.text.length > 200
    ? block.text.substring(0, 200) + '…'
    : block.text;
  console.log(`  ${displayText.replace(/\n/g, '\n  ')}`);

  blockCount++;
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Total blocks: ${blockCount}`);
console.log(`Sections: ${[...new Set(blocks.map(b => b.section))].length}`);

// ── Summary of variable blocks ────────────────────────────────────────────────
console.log('\nVariable content resolved:');
const variableBlocks = blocks.filter(b => b.source);
for (const b of variableBlocks) {
  console.log(`  • [${b.source}] ${b.section} — ${b.label || b.id}`);
}
