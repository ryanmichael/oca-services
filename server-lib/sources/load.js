'use strict';

const fs   = require('fs');
const path = require('path');

const { loadJSON }      = require('../_shared/load-json');
const { tagProvenance } = require('../overlays/provenance');

const ROOT = path.resolve(__dirname, '..', '..');

function loadSources() {
  const octoechos  = loadJSON('variable-sources/octoechos.json');
  const prokeimena = loadJSON('variable-sources/prokeimena.json');

  // Variable-source Octoechos overlays, keyed by stack id. Cascaded per-request
  // onto the base by resolveOctoechos() when a parish selects that stack.
  const octoechosOverlays = {};
  for (const id of ['myrrhbearers']) {
    const rel = `variable-sources/octoechos-${id}.json`;
    if (fs.existsSync(path.join(ROOT, rel))) octoechosOverlays[id] = loadJSON(rel);
  }

  // Load all available menaion files
  const menaion = {};
  const menaionDir = path.join(ROOT, 'variable-sources', 'menaion');
  if (fs.existsSync(menaionDir)) {
    for (const file of fs.readdirSync(menaionDir).filter(f => f.endsWith('.json'))) {
      const key  = file.replace('.json', '');         // e.g. "march-07"
      const data = loadJSON(`variable-sources/menaion/${file}`);
      menaion[key] = data.vespers || data;
    }
  }

  // Load all available triodion files, keyed by each file's "key" field.
  // e.g. lent-soul-saturday-2.json has key "lent.soulSaturday2"
  //   → triodion.lent.soulSaturday2 = raw.vespers
  const triodion = {};
  const triodionDir = path.join(ROOT, 'variable-sources', 'triodion');
  if (fs.existsSync(triodionDir)) {
    for (const file of fs.readdirSync(triodionDir).filter(f => f.endsWith('.json'))) {
      const raw = loadJSON(`variable-sources/triodion/${file}`);
      const key = raw.key;
      if (!key) { console.warn(`triodion/${file}: missing "key" field, skipping`); continue; }
      // Navigate/create the nested path: "lent.soulSaturday2" → triodion.lent.soulSaturday2
      const parts = key.split('.');
      let cur = triodion;
      for (let i = 0; i < parts.length - 1; i++) {
        cur[parts[i]] ??= {};
        cur = cur[parts[i]];
      }
      const sourceData = raw.vespers || raw;
      // Tag all hymn objects with provenance so dev-mode shows the publisher
      tagProvenance(sourceData, 'OCA');
      cur[parts[parts.length - 1]] = sourceData;
    }
  }

  // 'db' source is populated in Step 2; include empty object now so the
  // assembler doesn't warn on unresolved db: references in generated entries.
  // Load eothinon cycle data
  const eothinonPath = path.join(ROOT, 'variable-sources', 'eothinon.json');
  const eothinon = fs.existsSync(eothinonPath) ? loadJSON('variable-sources/eothinon.json') : {};

  return { octoechos, octoechosOverlays, prokeimena, menaion, triodion, eothinon, db: {} };
}

module.exports = { loadSources };
