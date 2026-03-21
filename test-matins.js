/**
 * Test harness for assembleMatins() — Annunciation, March 25, 2026.
 *
 * A great feast of the Theotokos falling on a Lenten Wednesday:
 *   - God is the Lord (not Alleluia — feast overrides Lent)
 *   - Troparion ×3
 *   - Polyeleios + Magnification
 *   - Prokeimenon + Gospel + Post-Gospel sticheron
 *   - Canon (heirmoi only)
 *   - Kontakion
 *   - 2 Exapostilaria
 *   - Lauds (read, 4 stichera)
 *   - Small Doxology (Lenten weekday, even on great feast)
 *   - Aposticha (Triodion + feast Glory)
 *
 * Run: node test-matins.js
 */

const { assembleMatins } = require('./assembler');
const matinsFixed  = require('./fixed-texts/matins-fixed.json');
const vespersFixed = require('./fixed-texts/vespers-fixed.json');
const menaion      = require('./variable-sources/menaion/march-25.json');

// Build a calendar entry for the Annunciation
const calendarDay = {
  date: '2026-03-25',
  dayOfWeek: 'wednesday',
  liturgicalContext: {
    season: 'greatLent',
    week: 4,
  },
  matins: {
    isSunday: false,
    feastRank: 'greatFeast',
    feastType: 'theotokos',
    tone: 4,
    alleluia: false, // feast overrides Lenten Alleluia
    useSmallDoxology: true, // Lenten weekday — even great feasts use read doxology

    // Troparion ×3
    troparion: menaion.troparion,

    // Kathisma (stubbed — schedule TBD)
    kathismaCount: 2,
    kathismaNumbers: [],

    // Magnification at Polyeleios
    magnification: menaion.matins.magnification,

    // Prokeimenon
    prokeimenon: menaion.matins.prokeimenon,

    // Gospel
    gospel: menaion.matins.gospel,

    // Post-Gospel sticheron
    postGospelSticheron: menaion.matins.postGospelSticheron,

    // Canon with heirmoi + kontakion
    canon: {
      tone: 4,
      author: menaion.matins.canon.author,
      ...Object.fromEntries(
        Object.entries(menaion.matins.canon)
          .filter(([k]) => k.startsWith('ode'))
      ),
      kontakion: menaion.kontakion,
      skipMagnificat: true, // great feast has its own Ode 9 megalynarion
    },

    // Exapostilaria
    exapostilaria: menaion.matins.exapostilaria,

    // Lauds (read, 4 stichera)
    lauds: {
      read: true,
      tone: 1,
      stichera: menaion.matins.lauds.stichera,
      doxastikon: menaion.matins.lauds.doxastikon,
    },

    // Aposticha (feast Glory only — Triodion stichera TBD)
    aposticha: {
      glory: menaion.matins.aposticha.glory,
    },

    // Final troparion (feast)
    finalTroparion: menaion.troparion,
  },
};

const sources = {
  menaion,
  octoechos: {},
  triodion: {},
};

// ── Assemble ─────────────────────────────────────────────────────────────────
const blocks = assembleMatins(calendarDay, matinsFixed, vespersFixed, sources);

// ── Report ───────────────────────────────────────────────────────────────────
console.log(`\n✔ Assembled ${blocks.length} blocks\n`);

// Group by section
const sections = new Map();
for (const b of blocks) {
  if (!sections.has(b.section)) sections.set(b.section, []);
  sections.get(b.section).push(b);
}

console.log('Sections:');
let sectionNum = 0;
for (const [name, sectionBlocks] of sections) {
  sectionNum++;
  console.log(`  ${sectionNum}. ${name} (${sectionBlocks.length} blocks)`);
}

console.log(`\nTotal sections: ${sections.size}`);
console.log(`Total blocks:   ${blocks.length}`);

// Spot-check key blocks
console.log('\n── Spot Checks ──');
const gitl = blocks.find(b => b.id === 'gitl-refrain');
console.log(`God is the Lord: ${gitl ? '✔' : '✘'} ${gitl?.text?.substring(0, 50)}...`);

const trop = blocks.find(b => b.id === 'trop-1');
console.log(`Troparion: ${trop ? '✔' : '✘'} Tone ${trop?.tone} — ${trop?.text?.substring(0, 40)}...`);

const mag = blocks.find(b => b.id === 'magnification');
console.log(`Magnification: ${mag ? '✔' : '✘'} ${mag?.text?.substring(0, 50)}...`);

const prok = blocks.find(b => b.id === 'mat-prok-refrain');
console.log(`Prokeimenon: ${prok ? '✔' : '✘'} Tone ${prok?.tone} — ${prok?.text?.substring(0, 40)}...`);

const gospel = blocks.find(b => b.id === 'gospel-reading');
console.log(`Gospel: ${gospel ? '✔' : '✘'} ${gospel?.label}`);

const irmos1 = blocks.find(b => b.id === 'canon-ode1-irmos');
console.log(`Canon Ode 1: ${irmos1 ? '✔' : '✘'} ${irmos1?.text?.substring(0, 40)}...`);

const kont = blocks.find(b => b.id === 'canon-kontakion');
console.log(`Kontakion: ${kont ? '✔' : '✘'} Tone ${kont?.tone} — ${kont?.text?.substring(0, 40)}...`);

const exapost = blocks.filter(b => b.id.startsWith('exapost'));
console.log(`Exapostilaria: ${exapost.length === 2 ? '✔' : '✘'} (${exapost.length} found)`);

const lauds = blocks.filter(b => b.id.startsWith('lauds-hymn'));
console.log(`Lauds stichera: ${lauds.length >= 3 ? '✔' : '✘'} (${lauds.length} hymns)`);

const smallDox = blocks.find(b => b.id === 'small-doxology');
console.log(`Small Doxology: ${smallDox ? '✔' : '✘'} (Lenten weekday — no Great Doxology)`);

const greatDox = blocks.find(b => b.id === 'great-doxology');
console.log(`Great Doxology: ${greatDox ? '✘ (correctly absent)' : '✔ (correctly absent)'}`);

const apostGlory = blocks.find(b => b.id === 'apost-glory-hymn');
console.log(`Aposticha Glory: ${apostGlory ? '✔' : '✘'} Tone ${apostGlory?.tone}`);

const finalTrop = blocks.find(b => b.id === 'final-trop');
console.log(`Final Troparion: ${finalTrop ? '✔' : '✘'}`);

// Warnings
if (blocks._warnings && blocks._warnings.length > 0) {
  console.log(`\n⚠ ${blocks._warnings.length} warnings:`);
  blocks._warnings.forEach(w => console.log(`  - ${w.source}.${w.key}`));
}
