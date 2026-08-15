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

/** Composite blends — a date whose Beatitudes draw troparia from more than one
 *  book, and from an ode the single-file override mechanism above cannot reach
 *  (it reads ode3/ode6 only).
 *
 *  `octoechosTroparia` is how many of the tone's resurrectional Beatitudes to
 *  keep. The flat Octoechos shape is N resurrection troparia followed by the
 *  Glory and the Theotokion; taking the first N drops that Octoechos tail so
 *  the feast's own last two troparia land in the Glory / Now-and-ever slots
 *  (the renderer right-aligns the list into 12 slots). Same reasoning as
 *  `beatitudesReplaceGloryNow` above, which does this for a single file.
 *
 *  `parts` are appended in order, each naming a file and a dot-path to a canon
 *  ode. `take` caps how many of that ode's troparia are used. */
const FEAST_BEATITUDES_BLENDS = {
  // Sunday 8-16: Afterfeast of the Dormition + Translation of the Image
  // Not-Made-by-Hands. reference/orders/2026-0816-order-services.txt appoints
  // 4 Resurrection (T2) + 2 from Ode 1 of the Dormition's 1st canon (T1)
  // + 2 from Ode 1 of its 2nd canon (T4) + 4 from Ode 6 of the Image's canon (T4).
  //
  // GAP: the 1st canon's Ode 1 troparia are NOT in the corpus — the Dormition
  // canon in variable-sources/menaion/august-15.json carries irmos + irmos2 for
  // every ode and no troparia at all. So this blend renders 10 of the appointed
  // 12. Do not paper over the hole by padding from the 2nd canon: the two canons
  // are different compositions (Cosmas T1, John of Damascus T4) and the order
  // names them separately.
  '8-16': {
    octoechosTroparia: 4,
    parts: [
      { file: 'variable-sources/feast-canons/dormition.json',
        at: 'ode1', tone: 4, label: 'For the Dormition' },
      // Ode 6 troparia 1-4 are Canon I (Tone 4), which is what the order names;
      // 5-8 are marked `canon: secondCanon` and are Tone 6. `take: 4` keeps the
      // Canon I set, whose last entry is its Theotokion.
      { file: 'variable-sources/menaion/august-16.json',
        at: 'matins.canon.ode6', take: 4, tone: 4, label: 'For the Image' },
    ],
  },
};

/** Reads `parts` into a flat troparia list. A part that cannot be resolved is
 *  skipped with a warning rather than throwing — a missing book should cost the
 *  day its feast troparia, not its Liturgy. */
function loadBlendParts(parts) {
  const out = [];
  for (const part of parts || []) {
    const filePath = path.join(ROOT, part.file);
    let ode;
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      ode = part.at.split('.').reduce((o, k) => (o == null ? o : o[k]), data);
    } catch (err) {
      console.warn(`loadBlendParts: failed to read ${part.file}:`, err.message);
      continue;
    }
    if (!ode || !Array.isArray(ode.troparia)) {
      console.warn(`loadBlendParts: ${part.file} has no troparia at ${part.at}`);
      continue;
    }
    const chosen = part.take ? ode.troparia.slice(0, part.take) : ode.troparia;
    for (const t of chosen) {
      const text = typeof t === 'string' ? t : t?.text;
      if (!text || !text.trim()) continue;
      // Keep a per-troparion tone when the book records one (the Image's odes
      // mix Tone 4 and Tone 6 in a single array), and surface a Theotokion in
      // the label so the Now-and-ever slot reads correctly.
      const itemTone  = (typeof t === 'object' && t.tone) ? t.tone : part.tone;
      const itemLabel = (typeof t === 'object' && t.label)
        ? `${part.label} (${t.label})` : part.label;
      out.push({ tone: itemTone, label: itemLabel, source: 'feast', text });
    }
  }
  return out;
}

/** Builds the composite Beatitudes list for a blend date, or null when the date
 *  has no blend configured. */
function buildBlendedBeatitudes(dateStr, tone, beatData) {
  if (!dateStr) return null;
  const [, mm, dd] = dateStr.split('-').map(Number);
  if (!mm || !dd) return null;
  const blend = FEAST_BEATITUDES_BLENDS[`${mm}-${dd}`];
  if (!blend) return null;
  if (!beatData || !Array.isArray(beatData.troparia)) return null;

  const feast = loadBlendParts(blend.parts);
  if (!feast.length) return null;   // nothing gained; fall through to plain Octoechos

  const out = [];
  pushTroparia(out, beatData.troparia.slice(0, blend.octoechosTroparia),
    tone, 'octoechos', 'Beatitude');
  out.push(...feast);
  return out;
}

/** Returns the feast-canon override for a given date (M-D), or an explicitly
 *  named canon file, or null when none is configured / the file's odes are
 *  scaffold-empty. An explicit `fnameOverride` (used for movable feasts such
 *  as the Holy Fathers Sunday, which has no fixed M-D key) takes precedence. */
function loadFeastBeatitudesOverride(dateStr, fnameOverride) {
  let fname = fnameOverride || null;
  if (!fname) {
    if (!dateStr) return null;
    const [, mm, dd] = dateStr.split('-').map(Number);
    if (!mm || !dd) return null;
    fname = FEAST_BEATITUDES_OVERRIDES[`${mm}-${dd}`];
  }
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
function buildBeatitudesTroparia(isSunday, tone, srcs, dateStr, feastCanonName) {
  if (!isSunday) return []; // weekday beatitudes not yet implemented

  const tk = `tone${tone}`;
  const oct = srcs?.octoechos;
  const beatData = oct?.[tk]?.sunday?.liturgy?.beatitudes;

  // A composite blend is keyed by fixed date only; an explicitly named canon
  // (a movable feast such as the Holy Fathers Sunday) still wins.
  if (!feastCanonName) {
    const blended = buildBlendedBeatitudes(dateStr, tone, beatData);
    if (blended) return blended;
  }

  const override = loadFeastBeatitudesOverride(dateStr, feastCanonName);

  if (override && override.beatitudesMode === 'replace') {
    const ot = override.tone ?? tone;
    return buildOdes(override.ode3, override.ode6, ot, 'feast', null, null);
  }

  // Correct shape: dedicated resurrectional Beatitudes as a flat troparia list.
  // The last two entries are the Glory (Trinitarian) and the Both-now
  // Theotokion; the renderer maps them to the Glory / Now slots.
  if (beatData && Array.isArray(beatData.troparia)) {
    const out = [];
    if (override && override.beatitudesReplaceGloryNow) {
      // The feast canon supplies its own Glory/Theotokion tail (e.g. Holy
      // Fathers Sunday: 6 Resurrection troparia + 4 from the Fathers' Ode 3,
      // the last being the Theotokion → exactly "on 10"). Drop the Octoechos
      // Glory+Theotokion (always the trailing two of the flat shape) and append
      // the feast troparia so the render's Glory/Now slots land on the feast set.
      pushTroparia(out, beatData.troparia.slice(0, -2), tone, 'octoechos', 'Beatitude');
      pushTroparia(out, override.ode3?.troparia, override.tone ?? tone, 'feast', 'For the Fathers');
      pushTroparia(out, override.ode6?.troparia, override.tone ?? tone, 'feast', 'For the Fathers');
      return out;
    }
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
