'use strict';

const path = require('path');
const { loadJSON } = require('../_shared/load-json');

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Great Feast Variants ─────────────────────────────────────────────────────
// Liturgy variants for each Great Feast — antiphons, troparia/kontakia,
// prokeimenon, alleluia, entrance hymn, megalynarion, communion hymn.
// Data lives in variable-sources/great-feast-variants.json; keys match
// calendar-rules.getGreatFeastKey().
const GREAT_FEAST_VARIANTS = loadJSON('variable-sources/great-feast-variants.json');

// ─── Pentecostarion Sunday Overrides ──────────────────────────────────────────
// Per-week overrides for the Pentecost-to-All-Saints window (Sundays only).
const PENTECOSTARION_SUNDAY_OVERRIDES = loadJSON('variable-sources/pentecostarion-sunday-overrides.json');

// ─── Co-celebrated Saints Overlay ─────────────────────────────────────────────
// Date-keyed overlay mechanism used for Pascha+39..+47 substitutions etc.
const COCELEBRATED_OVERLAYS = loadJSON('variable-sources/cocelebrated-overlays.json');

// ─── Daily Liturgy Propers ────────────────────────────────────────────────────
// Day-of-week patrons, communion hymns, prokeimena, alleluia verses.
const DAILY_PROPERS = loadJSON('variable-sources/daily-propers.json');

// ─── Liturgical Day Display Labels ────────────────────────────────────────────
const LITURGICAL_DAY_LABELS = loadJSON('variable-sources/liturgical-day-labels.json');
delete LITURGICAL_DAY_LABELS._meta;

// ─── Liturgy Defaults ─────────────────────────────────────────────────────────
// Default entrance hymns / paschal megalynarion / We-Have-Seen substitutions
// used when no feast or Pentecostarion override applies.
const LITURGY_DEFAULTS = loadJSON('variable-sources/liturgy-defaults.json');
delete LITURGY_DEFAULTS._meta;

// ─── General Menaion Propers ──────────────────────────────────────────────────
// Prokeimenon, alleluia, koinonikon by saint category. Attached as
// .secondary on the prokeimenon/alleluia/communionHymn when a polyeleos+ saint
// of that category is the principal commemoration. String values are aliases:
// resolved transitively below so consumers always get the resolved block.
const _GMP_RAW = loadJSON('variable-sources/general-menaion-propers.json');
const GENERAL_MENAION_PROPERS = (() => {
  const out = {};
  for (const key of Object.keys(_GMP_RAW)) {
    if (key.startsWith('_')) continue;
    let resolved = _GMP_RAW[key];
    const seen = new Set([key]);
    while (typeof resolved === 'string') {
      if (seen.has(resolved)) {
        throw new Error(`general-menaion-propers.json: alias cycle at ${key}`);
      }
      seen.add(resolved);
      resolved = _GMP_RAW[resolved];
    }
    if (!resolved) throw new Error(`general-menaion-propers.json: ${key} resolves to nothing`);
    out[key] = resolved;
  }
  return out;
})();

const DAY_PATRONS              = DAILY_PROPERS.dayPatrons;
const COMMUNION_HYMNS          = DAILY_PROPERS.communionHymns;
const SUNDAY_PROKEIMENA        = DAILY_PROPERS.sundayProkeimena;
const SUNDAY_ALLELUIA          = DAILY_PROPERS.sundayAlleluia;
const WEEKDAY_PROKEIMENA       = DAILY_PROPERS.weekdayProkeimena;
const WEEKDAY_ALLELUIA         = DAILY_PROPERS.weekdayAlleluia;
const LENTEN_SUNDAY_PROKEIMENA = DAILY_PROPERS.lentenSundayProkeimena;
const LENTEN_SUNDAY_ALLELUIA   = DAILY_PROPERS.lentenSundayAlleluia;
const LENTEN_SUNDAY_COMMUNION  = DAILY_PROPERS.lentenSundayCommunion;

// ─── Data file validation ─────────────────────────────────────────────────────
// Light schema checks on the JSON data files. Throws on missing/mistyped fields
// so drift fails loud rather than producing silently broken services. Runs at
// module-load time (= server boot). See data-validators.js for the rules.
require(path.join(ROOT, 'data-validators')).validateAll({
  greatFeastVariants:      GREAT_FEAST_VARIANTS,
  pentecostarionOverrides: PENTECOSTARION_SUNDAY_OVERRIDES,
  cocelebratedOverlays:    COCELEBRATED_OVERLAYS,
  dailyPropers:            DAILY_PROPERS,
  liturgicalDayLabels:     LITURGICAL_DAY_LABELS,
  liturgyDefaults:         LITURGY_DEFAULTS,
  menaionDir:              path.join(ROOT, 'variable-sources', 'menaion'),
});

module.exports = {
  GREAT_FEAST_VARIANTS,
  PENTECOSTARION_SUNDAY_OVERRIDES,
  COCELEBRATED_OVERLAYS,
  DAILY_PROPERS,
  LITURGICAL_DAY_LABELS,
  LITURGY_DEFAULTS,
  DAY_PATRONS,
  COMMUNION_HYMNS,
  SUNDAY_PROKEIMENA,
  SUNDAY_ALLELUIA,
  WEEKDAY_PROKEIMENA,
  WEEKDAY_ALLELUIA,
  LENTEN_SUNDAY_PROKEIMENA,
  LENTEN_SUNDAY_ALLELUIA,
  LENTEN_SUNDAY_COMMUNION,
  GENERAL_MENAION_PROPERS,
};
