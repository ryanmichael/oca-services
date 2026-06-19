'use strict';

// Derivation templates for parish overlay materialization.
//
// Templates live in fixed-texts/derivation-templates/ as JSON. Each declares
// the jurisdiction it applies to, the service it targets, the inputs it
// consumes, and a `keys` map where each value is a template string with
// `{input_name}` placeholders.
//
// Phase 1 ships only `hierarch-commemoration-oca.json` (3 Anaphora keys).
// Phase 2 expands to litany short-form keys + ROCOR/Antiochian variants.

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR  = path.join(ROOT, 'fixed-texts', 'derivation-templates');

function listTemplates() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => f.endsWith('.json'));
}

function loadTemplate(file) {
  return JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
}

/** Renders a template object against a set of inputs. Returns a partial
 *  overlay object suitable for deep-merging into the cascade — keys with
 *  dots are exploded into nested objects. */
function applyTemplate(template, inputs) {
  const out = {};
  for (const [dottedKey, tmpl] of Object.entries(template.keys || {})) {
    const text = renderString(tmpl, inputs);
    setDottedKey(out, dottedKey, text);
  }
  return out;
}

function renderString(tmpl, inputs) {
  return String(tmpl).replace(/\{([a-z_]+)\}/g, (_, name) => {
    const v = inputs[name];
    return (v === undefined || v === null) ? `{${name}}` : String(v);
  });
}

function setDottedKey(obj, dotted, value) {
  const parts = dotted.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/** Loads templates that match (jurisdiction, service) and applies them.
 *  Returns an object that can be deep-merged into the overlay data for that
 *  service. Missing inputs are passed through as `{name}` placeholders so
 *  the gap is visible at render time rather than silently dropped. */
function deriveOverlayForService({ jurisdiction, service, inputs }) {
  let merged = {};
  for (const file of listTemplates()) {
    const t = loadTemplate(file);
    if (t.jurisdiction !== jurisdiction) continue;
    if (t.service && t.service !== service) continue;
    merged = deepMergePlain(merged, applyTemplate(t, inputs || {}));
  }
  return merged;
}

function deepMergePlain(a, b) {
  if (a === null || typeof a !== 'object' || Array.isArray(a)) return b;
  if (b === null || typeof b !== 'object' || Array.isArray(b)) return b;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = (k in out) ? deepMergePlain(out[k], v) : v;
  }
  return out;
}

module.exports = { listTemplates, loadTemplate, applyTemplate, deriveOverlayForService };
