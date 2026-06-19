'use strict';

// Maps repo-relative file paths (or path patterns) to their schema file.
// Used by schemas/index.js and scripts/validate-schemas.js.

const path = require('path');

const SCHEMA_DIR = __dirname;

// Each entry is { match: (relPath) => boolean, schema: 'path/to/schema.json' }
const RULES = [

  // L1 — service-structure
  {
    match: (p) => p.startsWith('service-structure/') && p.endsWith('.json'),
    schema: 'service-structure.schema.json'
  },

  // L2 — fixed-texts base files
  {
    match: (p) => /^fixed-texts\/[^/]+\.json$/.test(p),
    schema: 'fixed-texts/base.schema.json'
  },
  // L2 — translation manifests
  {
    match: (p) => /^fixed-texts\/translations\/[^/]+\/manifest\.json$/.test(p),
    schema: 'fixed-texts/translation-manifest.schema.json'
  },
  // L2 — translation overlay sparse documents
  {
    match: (p) => /^fixed-texts\/translations\/[^/]+\/[^/]+\.json$/.test(p)
              && !p.endsWith('/manifest.json'),
    schema: 'fixed-texts/translation-overlay.schema.json'
  },

  // L3 — variable-sources subdirs
  {
    match: (p) => /^variable-sources\/menaion\/[^/]+\.json$/.test(p),
    schema: 'variable-sources/menaion.schema.json'
  },
  {
    match: (p) => /^variable-sources\/calendar\/[^/]+\.json$/.test(p),
    schema: 'variable-sources/calendar-entry.schema.json'
  },
  {
    match: (p) => /^variable-sources\/feast-canons\/[^/]+\.json$/.test(p),
    schema: 'variable-sources/feast-canon.schema.json'
  },
  {
    match: (p) => /^variable-sources\/triodion\/[^/]+\.json$/.test(p),
    schema: 'variable-sources/triodion-day.schema.json'
  },
  {
    match: (p) => /^variable-sources\/festal-matins\/[^/]+\.json$/.test(p),
    schema: 'variable-sources/festal-matins.schema.json'
  },

  // L3 — variable-sources top-level singletons
  { match: (p) => p === 'variable-sources/octoechos.json',                       schema: 'variable-sources/octoechos.schema.json' },
  { match: (p) => p === 'variable-sources/great-feast-variants.json',            schema: 'variable-sources/great-feast-variants.schema.json' },
  { match: (p) => p === 'variable-sources/great-feasts-liturgy.json',            schema: 'variable-sources/great-feasts-liturgy.schema.json' },
  { match: (p) => p === 'variable-sources/pentecostarion-sunday-overrides.json', schema: 'variable-sources/pentecostarion-overrides.schema.json' },
  { match: (p) => p === 'variable-sources/cocelebrated-overlays.json',           schema: 'variable-sources/cocelebrated-overlays.schema.json' },
  { match: (p) => p === 'variable-sources/daily-propers.json',                   schema: 'variable-sources/daily-propers.schema.json' },
  { match: (p) => p === 'variable-sources/liturgy-defaults.json',                schema: 'variable-sources/liturgy-defaults.schema.json' },
  { match: (p) => p === 'variable-sources/liturgical-day-labels.json',           schema: 'variable-sources/liturgical-day-labels.schema.json' },
  { match: (p) => p === 'variable-sources/prokeimena.json',                      schema: 'variable-sources/prokeimena.schema.json' },
  { match: (p) => p === 'variable-sources/eothinon.json',                        schema: 'variable-sources/eothinon.schema.json' },
  { match: (p) => p === 'variable-sources/beatitudes-raw.json',                  schema: 'variable-sources/beatitudes-raw.schema.json' },
  { match: (p) => p === 'variable-sources/general-menaion-propers.json',         schema: 'variable-sources/general-menaion-propers.schema.json' },
  {
    match: (p) => /^variable-sources\/education-modules.*\.json$/.test(p),
    schema: 'variable-sources/education-modules.schema.json'
  }

];

function resolveSchema(relPath) {
  const norm = relPath.split(path.sep).join('/');
  for (const rule of RULES) {
    if (rule.match(norm)) return path.join(SCHEMA_DIR, rule.schema);
  }
  return null;
}

module.exports = { resolveSchema, SCHEMA_DIR };
