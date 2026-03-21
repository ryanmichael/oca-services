#!/usr/bin/env node
/**
 * Merge extracted Beatitudes troparia into octoechos.json
 *
 * Adds toneN.sunday.liturgy.beatitudes for each tone, containing
 * Ode 3 and Ode 6 troparia from the Canon of the Resurrection.
 *
 * At the Liturgy, the standard Sunday assignment "On 8" maps:
 *   Verse 8 → Ode 3 Irmos
 *   Verse 7 → Ode 3 Troparion 1
 *   Verse 6 → Ode 3 Troparion 2
 *   Verse 5 → Ode 3 Theotokion
 *   Verse 4 → Ode 6 Irmos
 *   Verse 3 → Ode 6 Troparion 1
 *   Glory   → Ode 6 Troparion 2
 *   Now     → Ode 6 Theotokion
 */

const fs = require('fs');
const path = require('path');

const octPath = path.join(__dirname, 'variable-sources', 'octoechos.json');
const beatPath = path.join(__dirname, 'variable-sources', 'beatitudes-raw.json');

const oct = JSON.parse(fs.readFileSync(octPath, 'utf-8'));
const beat = JSON.parse(fs.readFileSync(beatPath, 'utf-8'));

for (let tone = 1; tone <= 8; tone++) {
  const key = `tone${tone}`;
  const src = beat[key];
  if (!src) {
    console.error(`Missing beatitudes data for ${key}`);
    continue;
  }

  // Ensure sunday.liturgy path exists
  if (!oct[key].sunday) oct[key].sunday = {};
  if (!oct[key].sunday.liturgy) oct[key].sunday.liturgy = {};

  oct[key].sunday.liturgy.beatitudes = {
    source: 'stSergius-octoechos',
    note: 'Canon of the Resurrection, Odes 3 and 6. Standard Sunday "On 8" assignment.',
    ode3: {
      irmos: src.ode3.irmos,
      troparia: [
        src.ode3.troparion1,
        src.ode3.troparion2,
      ],
      theotokion: src.ode3.theotokion,
    },
    ode6: {
      irmos: src.ode6.irmos,
      troparia: [
        src.ode6.troparion1,
        src.ode6.troparion2,
      ],
      theotokion: src.ode6.theotokion,
    },
  };

  console.log(`  ${key}: added sunday.liturgy.beatitudes`);
}

fs.writeFileSync(octPath, JSON.stringify(oct, null, 2) + '\n');
console.log(`\nWrote ${octPath}`);
