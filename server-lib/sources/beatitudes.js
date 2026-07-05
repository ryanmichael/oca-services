'use strict';

const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');

/** Date keys (M-D) for principal feasts whose canon troparia are appended
 *  to the Octoechos resurrection canon at the Liturgy Beatitudes. The
 *  Octoechos remains the spine (Irmos + 2 resurrection troparia + Theotokion
 *  per ode); the feast canon's *troparia only* are inserted between the
 *  resurrection troparia and the Theotokion. This matches the standard
 *  Typikon blend for a polyeleos/vigil saint or major feast on a Sunday.
 *
 *  Files live in variable-sources/feast-canons/ and use the standard
 *  feast-canon shape; only ode3.troparia + ode6.troparia are read in
 *  append mode. When a file's troparia are empty (scaffold-only), the
 *  blend collapses to pure Octoechos.
 *
 *  Future: a feast-canon JSON can opt into full replacement (e.g. for a
 *  Great Feast superseding the Sunday office) by setting top-level
 *  `beatitudesMode: 'replace'`. */
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
 *
 * On an ordinary Sunday the Beatitudes ("Blesseds") are the *dedicated
 * resurrectional set* of the tone from the Octoechos — a flat list of ~8
 * troparia (resurrectional + Glory + Theotokion), NOT the Resurrection canon.
 * Tones carrying a flat `troparia` array use this correct shape; tones still
 * on the legacy `ode3`/`ode6` (canon) shape fall through to buildOdes until
 * they are converted (see server-lib/sources/beatitudes.js history / the
 * per-tone rollout). The dedicated set never includes an irmos.
 *
 * When a per-date feast-canon override exists (FEAST_BEATITUDES_OVERRIDES)
 * and its troparia are populated, the feast (saint) canon troparia are
 * inserted just before the Glory/Theotokion (flat shape) or appended per-ode
 * (legacy shape). A feast-canon JSON may opt into full replacement with
 * `beatitudesMode: 'replace'`. Each item has { tone, label, source, text }.
 */
function buildBeatitudesTroparia(isSunday, tone, srcs, dateStr) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;

  const override = loadFeastBeatitudesOverride(dateStr);

  if (override && override.beatitudesMode === 'replace') {
    const ot = override.tone ?? tone;
    return buildOdes(override.ode3, override.ode6, ot, 'feast', null, null);
  }

  // Correct shape: dedicated resurrectional Beatitudes as a flat troparia list.
  // The last two entries are the Glory (Trinitarian) and the Both-now
  // Theotokion; the renderer maps them to the Glory / Now slots.
  if (beatData && Array.isArray(beatData.troparia)) {
    const out = [];
    pushTroparia(out, beatData.troparia, tone, 'octoechos', 'Beatitude');
    if (override) {
      const feast = [];
      pushTroparia(feast, override.ode3?.troparia, override.tone ?? tone, 'feast', 'Troparion (feast)');
      pushTroparia(feast, override.ode6?.troparia, override.tone ?? tone, 'feast', 'Troparion (feast)');
      if (feast.length) out.splice(Math.max(0, out.length - 2), 0, ...feast);
    }
    return out;
  }

  if (!beatData) {
    if (override) {
      const ot = override.tone ?? tone;
      return buildOdes(override.ode3, override.ode6, ot, 'feast', null, null);
    }
    return [];
  }

  const feastOde3 = override?.ode3 || null;
  const feastOde6 = override?.ode6 || null;
  return buildOdes(beatData.ode3, beatData.ode6, tone, 'octoechos', feastOde3, feastOde6);
}

/** Builds an interleaved troparia list for both odes.
 *  Each ode: spine Irmos + spine troparia + (feast troparia appended) + spine Theotokion. */
function buildOdes(spineOde3, spineOde6, tone, spineSrc, feastOde3, feastOde6) {
  const out = [];
  appendOde(out, spineOde3, tone, spineSrc, feastOde3, 'Ode 3');
  appendOde(out, spineOde6, tone, spineSrc, feastOde6, 'Ode 6');
  return out;
}

function appendOde(out, spine, tone, spineSrc, feast, odeLabel) {
  if (!spine) return;
  if (spine.irmos) {
    out.push({ tone, label: `Irmos of ${odeLabel}`, source: spineSrc, text: spine.irmos });
  }
  pushTroparia(out, spine.troparia, tone, spineSrc, `Troparion of ${odeLabel}`);
  if (feast) {
    pushTroparia(out, feast.troparia, tone, 'feast', `Troparion of ${odeLabel} (feast)`);
  }
  if (spine.theotokion) {
    out.push({ tone, label: `Theotokion of ${odeLabel}`, source: spineSrc, text: spine.theotokion });
  }
}

function pushTroparia(out, troparia, tone, source, label) {
  if (!Array.isArray(troparia)) return;
  for (const t of troparia) {
    const text = typeof t === 'string' ? t : t?.text;
    // Honor a per-item label (e.g. "Glory"/"Theotokion" in the flat Beatitudes
    // shape); fall back to the caller's group label for legacy string troparia.
    const itemLabel = (t && typeof t === 'object' && t.label) ? t.label : label;
    if (text && text.trim()) out.push({ tone, label: itemLabel, source, text });
  }
}

module.exports = { buildBeatitudesTroparia };
