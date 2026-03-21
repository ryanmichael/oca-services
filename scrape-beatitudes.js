#!/usr/bin/env node
/**
 * Extract Beatitudes troparia (Canon of the Resurrection, Odes 3 and 6)
 * from St. Sergius Octoechos PDFs (pre-converted to .txt via pdftotext).
 *
 * Source: https://st-sergius.org/services2.html
 *
 * For each tone, extracts from the Resurrection Canon only (not the
 * Cross-and-Resurrection or Theotokos canons):
 *   - Irmos
 *   - Troparion 1
 *   - Troparion 2
 *   - Theotokion
 *
 * Output: JSON ready to merge into octoechos.json
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = '/tmp/octoechos-canons';

function parseOde(lines, startIdx, nextOdeIdx) {
  // Extract only the Resurrection Canon portion (before "Another, of the Cross")
  const odeLines = lines.slice(startIdx, nextOdeIdx);

  // Find "Another, of the Cross" boundary — everything after is a different canon
  let endIdx = odeLines.length;
  for (let i = 0; i < odeLines.length; i++) {
    if (/Another,\s*of the Cross/i.test(odeLines[i])) {
      endIdx = i;
      break;
    }
  }

  const resLines = odeLines.slice(0, endIdx);
  const text = resLines.join('\n');

  // Split by Refrain markers
  const parts = text.split(/\s*Refrain:\s*/);
  // parts[0] = ODE header + Irmos
  // parts[1] = "Glory to Thy holy Resurrection O Lord.\n    Troparion 1..."
  // parts[2] = "Glory to Thy holy Resurrection O Lord.\n    Troparion 2..."
  // parts[3] = "Most holy Theotokos save us.\n    Theotokion: ..."

  // Extract Irmos from parts[0]
  const irmosMatch = parts[0].match(/Irmos:\s*([\s\S]+)/);
  const irmos = irmosMatch ? cleanText(irmosMatch[1]) : '';

  // Extract troparia from subsequent parts
  const troparia = [];
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    // Remove the refrain text at the beginning (first line is the refrain itself)
    const lines2 = part.split('\n');
    // First line is the refrain text, skip it
    const bodyLines = [];
    let pastRefrain = false;
    for (const line of lines2) {
      if (!pastRefrain) {
        // The refrain line: "Glory to Thy holy Resurrection O Lord." or "Most holy Theotokos save us."
        if (/Glory to Thy holy Resurrection|Most holy Theotokos|Glory to Thy precious Cross/.test(line)) {
          pastRefrain = true;
          continue;
        }
        // If no recognized refrain, the first line IS the refrain
        pastRefrain = true;
        continue;
      }
      bodyLines.push(line);
    }
    const bodyText = cleanText(bodyLines.join('\n'));
    if (bodyText) {
      // Check if it's a theotokion
      const isTheotokion = bodyText.startsWith('Theotokion:');
      const cleanBody = bodyText.replace(/^Theotokion:\s*/, '');
      troparia.push({
        type: isTheotokion ? 'theotokion' : 'troparion',
        text: cleanBody,
      });
    }
  }

  return { irmos, troparia };
}

function cleanText(text) {
  return text
    .replace(/\n/g, ' ')     // join all lines
    .replace(/\s{2,}/g, ' ') // collapse multiple spaces
    .replace(/\s*\*\s*/g, ' ') // remove asterisks (phrase markers in text)
    .trim();
}

function findOdeStart(lines, odeNum) {
  // Map roman numerals
  const romanMap = { 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX' };
  const roman = romanMap[odeNum];
  if (!roman) return -1;

  // Match with possible spaces between letters (PDF extraction artifact)
  // e.g. "ODE III", "OD E V", "O D E VI"
  const romanChars = roman.split('').join('\\s*');
  const regex = new RegExp(`^\\s*O\\s*D\\s*E\\s+${romanChars}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) return i;
  }
  return -1;
}

function findNextOdeOrEnd(lines, afterIdx) {
  // Find the next "ODE X" line, or "The Troparia from the Menaion" or "The small litany"
  for (let i = afterIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^ODE [IVX]+$/.test(trimmed)) return i;
    if (/Troparia from the Menaion/i.test(trimmed)) return i;
    if (/The small litany/i.test(trimmed)) return i;
  }
  return lines.length;
}

function processTone(toneNum) {
  const filePath = path.join(SRC_DIR, `Tone${toneNum}.txt`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');

  // Find "Resurrection Canon" section (at Matins, after the Canons begin)
  // The Ode markers we need are within the canon section
  const ode3Start = findOdeStart(lines, 3);
  const ode3End = findNextOdeOrEnd(lines, ode3Start);

  const ode6Start = findOdeStart(lines, 6);
  const ode6End = findNextOdeOrEnd(lines, ode6Start);

  if (ode3Start === -1 || ode6Start === -1) {
    console.error(`  Could not find Ode III or VI in Tone ${toneNum}`);
    return null;
  }

  console.log(`  Tone ${toneNum}: Ode III at line ${ode3Start}, Ode VI at line ${ode6Start}`);

  const ode3 = parseOde(lines, ode3Start, ode3End);
  const ode6 = parseOde(lines, ode6Start, ode6End);

  return {
    ode3: {
      irmos: ode3.irmos,
      troparion1: ode3.troparia[0]?.text || '',
      troparion2: ode3.troparia[1]?.text || '',
      theotokion: ode3.troparia[2]?.text || '',
    },
    ode6: {
      irmos: ode6.irmos,
      troparion1: ode6.troparia[0]?.text || '',
      troparion2: ode6.troparia[1]?.text || '',
      theotokion: ode6.troparia[2]?.text || '',
    },
  };
}

// --- Main ---
console.log('Extracting Beatitudes troparia from St. Sergius Octoechos...\n');

const result = {};
for (let tone = 1; tone <= 8; tone++) {
  const data = processTone(tone);
  if (data) {
    result[`tone${tone}`] = data;
  }
}

// Output
const outPath = path.join(__dirname, 'variable-sources', 'beatitudes-raw.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nWrote ${outPath}`);

// Print summary
for (const [tone, data] of Object.entries(result)) {
  console.log(`\n${tone}:`);
  console.log(`  Ode 3 irmos: ${data.ode3.irmos.substring(0, 60)}...`);
  console.log(`  Ode 3 trop1: ${data.ode3.troparion1.substring(0, 60)}...`);
  console.log(`  Ode 3 trop2: ${data.ode3.troparion2.substring(0, 60)}...`);
  console.log(`  Ode 3 theot: ${data.ode3.theotokion.substring(0, 60)}...`);
  console.log(`  Ode 6 irmos: ${data.ode6.irmos.substring(0, 60)}...`);
  console.log(`  Ode 6 trop1: ${data.ode6.troparion1.substring(0, 60)}...`);
  console.log(`  Ode 6 trop2: ${data.ode6.troparion2.substring(0, 60)}...`);
  console.log(`  Ode 6 theot: ${data.ode6.theotokion.substring(0, 60)}...`);
}
