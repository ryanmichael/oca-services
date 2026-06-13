'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

/** Date keys (M-D) for principal feasts that override the Octoechos resurrection
 *  canon at the Liturgy Beatitudes. Files live in variable-sources/feast-canons/
 *  and use the standard feast-canon shape; only ode3 + ode6 are read here.
 *  When a file's strings are empty (scaffold-only), the override is skipped
 *  and the assembler falls back to Octoechos — so adding scaffold entries is
 *  safe even before texts are sourced. */
const FEAST_BEATITUDES_OVERRIDES = {
  '6-14': 'synaxis-na-saints',
};

/** Returns the feast-canon override for a given date (M-D), or null when none
 *  is configured or when the file's odes are scaffold-empty. */
function loadFeastBeatitudesOverride(dateStr) {
  if (!dateStr) return null;
  const [, mm, dd] = dateStr.split('-').map(Number);
  if (!mm || !dd) return null;
  const key = `${mm}-${dd}`;
  const fname = FEAST_BEATITUDES_OVERRIDES[key];
  if (!fname) return null;
  const filePath = path.join(ROOT, 'variable-sources', 'feast-canons', `${fname}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!hasPopulatedOde(data.ode3) && !hasPopulatedOde(data.ode6)) return null;
    return data;
  } catch (err) {
    console.warn(`loadFeastBeatitudesOverride: failed to read ${filePath}:`, err.message);
    return null;
  }
}

function hasPopulatedOde(ode) {
  if (!ode) return false;
  if (ode.irmos && ode.irmos.trim()) return true;
  if (ode.theotokion && ode.theotokion.trim()) return true;
  if (Array.isArray(ode.troparia) && ode.troparia.some(t => t?.text?.trim())) return true;
  return false;
}

/**
 * Build Beatitudes troparia array for the Liturgy Third Antiphon.
 * On Sundays: 8 troparia from Octoechos Canon of the Resurrection (Odes 3+6).
 * When a per-date feast-canon override exists (FEAST_BEATITUDES_OVERRIDES)
 * and its Odes are populated, the feast canon replaces the Octoechos source.
 * Each item has { tone, label, source, text }.
 */
function buildBeatitudesTroparia(isSunday, tone, srcs, dateStr) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const override = loadFeastBeatitudesOverride(dateStr);
  if (override) {
    const ot = override.tone ?? tone;
    return collectOdeTroparia(override.ode3, override.ode6, ot, 'feast');
  }

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;
  if (!beatData) return [];
  return collectOdeTroparia(beatData.ode3, beatData.ode6, tone, 'octoechos');
}

function collectOdeTroparia(ode3, ode6, tone, src) {
  const troparia = [];
  if (ode3) {
    if (ode3.irmos)      troparia.push({ tone, label: 'Irmos of Ode 3', source: src, text: ode3.irmos });
    pushTroparia(troparia, ode3.troparia, tone, src, 'Troparion of Ode 3');
    if (ode3.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 3', source: src, text: ode3.theotokion });
  }
  if (ode6) {
    if (ode6.irmos)      troparia.push({ tone, label: 'Irmos of Ode 6', source: src, text: ode6.irmos });
    pushTroparia(troparia, ode6.troparia, tone, src, 'Troparion of Ode 6');
    if (ode6.theotokion) troparia.push({ tone, label: 'Theotokion of Ode 6', source: src, text: ode6.theotokion });
  }
  return troparia;
}

function pushTroparia(out, troparia, tone, source, label) {
  if (!Array.isArray(troparia)) return;
  for (const t of troparia) {
    const text = typeof t === 'string' ? t : t?.text;
    if (text && text.trim()) out.push({ tone, label, source, text });
  }
}

module.exports = { buildBeatitudesTroparia };
