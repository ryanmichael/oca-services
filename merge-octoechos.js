/**
 * merge-octoechos.js
 *
 * Merges octoechos-scraped.json into variable-sources/octoechos.json.
 * Populates all 8 tones with full Saturday Vespers content from OCA Obikhod (TT) PDFs.
 *
 * Usage:  node merge-octoechos.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SCRAPED = path.join(__dirname, 'octoechos-scraped.json');
const OUTPUT  = path.join(__dirname, 'variable-sources', 'octoechos.json');

const scraped  = JSON.parse(fs.readFileSync(SCRAPED, 'utf8'));
const existing = JSON.parse(fs.readFileSync(OUTPUT,  'utf8'));

// ─── Helper: build a sticheron object ────────────────────────────────────────

function sticheron(order, text) {
  return { order, text };
}

// ─── Build a tone entry from scraped data ────────────────────────────────────

function buildTone(n, existingTone) {
  const s = scraped[`tone${n}`];

  // Resurrectional stichera: use 1–6; sticheron 7 (if present) is the Glory
  const rawStichera = s.stichera || [];
  const resurrectional = rawStichera.slice(0, 6).map((text, i) => sticheron(i + 1, text));
  const gloryText      = rawStichera[6] || null;

  // For Tone 8, dogmatikon 404'd — preserve existing
  const dogmatikonText = s.dogmatikon
    || existingTone?.saturday?.vespers?.dogmatikon?.text
    || null;

  const entry = {
    saturday: {
      vespers: {

        dogmatikon: dogmatikonText ? {
          tone:  n,
          label: 'Theotokion — Dogmatikon',
          text:  dogmatikonText,
        } : null,

        lordICall: {
          resurrectional: {
            note: 'Resurrectional stichera from OCA Obikhod (TT). '
                + 'Used at Saturday Great Vespers, Lord I Have Cried, verses 6–1.',
            hymns: resurrectional,
          },
          ...(gloryText ? {
            glory: {
              tone:  n,
              label: 'Resurrectional Doxastichon',
              text:  gloryText,
            },
          } : {}),
          // Preserve hand-curated Soul Saturday fields (not scraped from tone PDFs)
          ...(existingTone?.saturday?.vespers?.lordICall?.martyrs ? {
            martyrs: existingTone.saturday.vespers.lordICall.martyrs,
          } : {}),
          ...(existingTone?.saturday?.vespers?.lordICall?.departedGlory ? {
            departedGlory: existingTone.saturday.vespers.lordICall.departedGlory,
          } : {}),
        },

        aposticha: {
          hymns: (s.apostichaHymns && s.apostichaHymns.length > 0
            ? s.apostichaHymns
            : s.aposticha ? [s.aposticha] : []
          ).map((text, i) => ({
            order: i + 1,
            label: i === 0 ? 'Idiomelon' : `Sticheron ${i + 1}`,
            tone:  n,
            text,
          })),
          ...(s.apostichaGlory ? {
            glory: {
              tone:  n,
              label: 'Resurrectional Doxastichon',
              text:  s.apostichaGlory,
            },
          } : {}),
          ...(s.apostichaTheotokion ? {
            theotokion: {
              tone:  n,
              label: 'Aposticha Theotokion',
              text:  s.apostichaTheotokion,
            },
          } : {}),
        },

        troparion: s.troparion ? {
          tone:  n,
          label: 'Resurrectional Troparion',
          text:  s.troparion,
        } : null,

        dismissalTheotokion: s.dismissalTheotokion ? {
          tone:  n,
          label: 'Resurrectional Dismissal Theotokion',
          text:  s.dismissalTheotokion,
        } : null,

      },
    },
  };

  // Prune nulls from top-level vespers
  const v = entry.saturday.vespers;
  if (v.dogmatikon === null) delete v.dogmatikon;
  if (v.troparion === null) delete v.troparion;
  if (v.dismissalTheotokion === null) delete v.dismissalTheotokion;

  return entry;
}

// ─── Build the merged output ──────────────────────────────────────────────────

const merged = {
  _meta: {
    description: existing._meta.description,
    note: existing._meta.note,
    version: '0.3.0 — all 8 tones populated from OCA Obikhod (TT) PDFs via scrape-octoechos.js',
    sources: {
      'all.saturday.vespers.*': 'OCA Obikhod (TT) PDFs scraped from oca.org/liturgics/music-downloads (2026-03)',
      'tone8.saturday.vespers.dogmatikon': existing._meta.sources['tone8.saturday.vespers.*'],
      'tone4.saturday.vespers.*': existing._meta.sources['tone4.saturday.vespers.*']
        + ' (stichera 1–4 now replaced with Obikhod source; aposticha theotokion populated)',
    },
  },
};

for (let n = 1; n <= 8; n++) {
  merged[`tone${n}`] = buildTone(n, existing[`tone${n}`]);
}

// ─── Write output ─────────────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT, JSON.stringify(merged, null, 2));
console.log(`Written to ${path.relative(__dirname, OUTPUT)}`);
console.log('\nSummary:');
for (let n = 1; n <= 8; n++) {
  const v = merged[`tone${n}`].saturday.vespers;
  const stichCount = v.lordICall?.resurrectional?.hymns?.length ?? 0;
  const gloryNote  = v.lordICall?.glory ? '+ Glory' : '';
  const apostichaGloryNote = v.aposticha?.glory ? '+glory' : '';
  console.log(`  Tone ${n}: ${stichCount} stichera ${gloryNote}, dogmatikon=${!!v.dogmatikon}, aposticha=${!!v.aposticha?.hymns?.[0]} ${apostichaGloryNote}, troparion=${!!v.troparion}, dismissal=${!!v.dismissalTheotokion}`);
}
