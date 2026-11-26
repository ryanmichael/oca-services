'use strict';

/**
 * Seasonal layers — a parish's texts for a DATED WINDOW.
 *
 * Added 2026-11-26. St John of Damascus (Tyler) sings a second Liturgy set
 * ("Liturgy #2": Greek-chant antiphons and Beatitudes in the Royster
 * translation, Zakkak's It Is Truly Meet, …) from 2026-11-29 until Great Lent,
 * then returns to its standing set. Nothing in the overlay cascade could say
 * "from this date to that date": translation overlays and parish variant picks
 * are all-year, so a swap would also rewrite every past and Lenten Liturgy, and
 * would have to be remembered and undone by hand at Clean Monday.
 *
 * A parish opts in through its rubrics (parish_settings.rubrics_extra_json):
 *
 *   "seasonalLayers": [
 *     { "layer": "greek-chant-royster-liturgy",
 *       "from": "2026-11-29", "to": "2027-03-14", "note": "…" }
 *   ]
 *
 * `from`/`to` are inclusive YYYY-MM-DD, compared against the date of the
 * service being rendered (the Liturgy is not date-shifted). A layer file
 * (fixed-texts/seasonal-layers/<layer>.json) is named for its CONTENT, never a
 * parish, and holds per-service sections:
 *
 *   liturgy.fixed          sparse liturgy-fixed overlay, deep-merged ON TOP of
 *                          the parish's resolved texts (arrays replace whole)
 *   liturgy.entranceHymn   { resurrection } — replaces only the Sunday entrance
 *                          hymn, never a feast's, the Paschal or the weekday one
 *   liturgy.communionHymns [{ id, label, hymns:[{text,tone}|{doxology}] }] —
 *                          sung while the clergy commune, after any seasonal
 *                          ones from seasonal-communion-hymns.json
 *
 * Only the route that renders the dated service applies a layer, so anything
 * dateless (the Parish Book, the translation diff) keeps the standing texts.
 * drift.js validates every window: unknown layer, bad dates, from > to.
 */

const fs   = require('fs');
const path = require('path');
const { deepMergeOverlay } = require('./cascade');

const LAYER_DIR = path.resolve(__dirname, '..', '..', 'fixed-texts', 'seasonal-layers');
const ID_RE     = /^[a-z0-9][a-z0-9-]*$/;
const DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;

const layerCache = new Map();

/** Load a layer file by id; null when absent or malformed. Cached. */
function loadSeasonalLayer(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) return null;
  if (layerCache.has(id)) return layerCache.get(id);
  let layer = null;
  try {
    layer = JSON.parse(fs.readFileSync(path.join(LAYER_DIR, `${id}.json`), 'utf8'));
  } catch (_) {
    layer = null;
  }
  layerCache.set(id, layer);
  return layer;
}

/** Problems with a parish's `seasonalLayers` rubric, as strings (empty = ok). */
function validateSeasonalLayers(list) {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return ['seasonalLayers must be an array'];
  const errs = [];
  list.forEach((w, i) => {
    const at = `seasonalLayers[${i}]`;
    if (!w || typeof w !== 'object') { errs.push(`${at} is not an object`); return; }
    if (!DATE_RE.test(w.from || '')) errs.push(`${at}.from "${w.from}" is not YYYY-MM-DD`);
    if (!DATE_RE.test(w.to || ''))   errs.push(`${at}.to "${w.to}" is not YYYY-MM-DD`);
    if (DATE_RE.test(w.from || '') && DATE_RE.test(w.to || '') && w.from > w.to)
      errs.push(`${at} ends (${w.to}) before it starts (${w.from})`);
    const layer = loadSeasonalLayer(w.layer);
    if (!layer) errs.push(`${at}.layer "${w.layer}" has no file fixed-texts/seasonal-layers/${w.layer}.json`);
  });
  return errs;
}

/**
 * The layers whose window contains `date` and which carry a section for
 * `service`, in the order the parish lists them (a later one wins on overlap).
 */
function activeSeasonalLayers(rubrics, date, service) {
  const list = rubrics && rubrics.seasonalLayers;
  if (!Array.isArray(list) || !DATE_RE.test(date || '')) return [];
  const out = [];
  for (const w of list) {
    if (!w || !DATE_RE.test(w.from || '') || !DATE_RE.test(w.to || '')) continue;
    if (date < w.from || date > w.to) continue;
    const layer = loadSeasonalLayer(w.layer);
    if (!layer || !layer[service]) continue;
    out.push({ id: w.layer, from: w.from, to: w.to, section: layer[service] });
  }
  return out;
}

/** Deep-merge each active layer's fixed texts over the resolved ones. Pure. */
function applySeasonalFixed(fixed, active) {
  let out = fixed;
  for (const a of active) {
    if (a.section.fixed) out = deepMergeOverlay(out, a.section.fixed);
  }
  return out;
}

/**
 * Apply the active layers' non-fixed parts to a Liturgy spec. Returns a new
 * spec; the input is not mutated (it may be a cached calendar entry).
 */
function applySeasonalLiturgySpec(spec, active) {
  if (!spec || !active.length) return spec;
  let out = spec;
  for (const a of active) {
    const s = a.section;
    const eh = s.entranceHymn && s.entranceHymn.resurrection;
    if (eh && out.entranceHymn && out.entranceHymn.kind === 'resurrection') {
      out = { ...out, entranceHymn: { ...out.entranceHymn, text: eh, seasonalLayer: a.id } };
    }
    if (Array.isArray(s.communionHymns) && s.communionHymns.length) {
      const extra = s.communionHymns.map(g => ({ ...g, seasonalLayer: a.id }));
      out = { ...out, communionHymnsExtra: [...(out.communionHymnsExtra || []), ...extra] };
    }
  }
  return out;
}

module.exports = {
  loadSeasonalLayer,
  validateSeasonalLayers,
  activeSeasonalLayers,
  applySeasonalFixed,
  applySeasonalLiturgySpec,
};
