'use strict';

// Matins spec builder. Constructs the full matins spec for a given date by
// composing festal-matins overlays, octoechos resurrectional matins, the
// Cross-Sunday overlay, and after-feast canon merging.

const fs   = require('fs');
const path = require('path');

const { loadJSON } = require('../_shared/load-json');
const {
  getEothinon,
  getGreatFeastKey,
  getWeekOfLent,
  fixedFeastDate,
} = require('../../calendar-rules');
const { getMatinsKathismata } = require('../../kathisma');

const { getMenaionRanked }     = require('./menaion');
const { GREAT_FEAST_VARIANTS } = require('./propers');

const ROOT = path.resolve(__dirname, '..', '..');

// ─── Matins Spec Builder ──────────────────────────────────────────────────────

/**
 * Builds the matins spec for a given date from available menaion data.
 * Currently supports:
 *   - Fixed-calendar Great Feasts with menaion matins data (e.g. Annunciation)
 *
 * Returns null if no matins data is available for the date.
 */

/**
 * Build Sunday Matins spec from Octoechos data.
 * Sundays always use the Great Doxology path and have a Gospel.
 */
function _loadFestalMatins(feastKey, season, dow, tone) {
  const festalPath = path.join(ROOT, 'variable-sources', 'festal-matins', `${feastKey}.json`);
  if (!fs.existsSync(festalPath)) return null;

  const data = loadJSON(`variable-sources/festal-matins/${feastKey}.json`);
  const isSunday = dow === 'sunday';

  const spec = {
    isSunday,
    feastRank: data.feastRank || 'greatFeast',
    feastType: data.feastType || null,
    tone: data.tone || (data.troparion && data.troparion.tone) || tone || 1,
    useSmallDoxology: false,
    // Great feasts follow the Sunday kathisma layout (2+3) regardless of weekday.
    kathismaCount: 2,
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion: data.sedalion || [],
  };

  if (data.troparion)              spec.troparion              = data.troparion;
  if (data.magnification)          spec.magnification          = data.magnification;
  if (data.prokeimenon)            spec.prokeimenon            = data.prokeimenon;
  if (data.gospel)                 spec.gospel                 = data.gospel;
  if (data.postGospelSticheron)    spec.postGospelSticheron    = data.postGospelSticheron;
  if (data.canon)                  spec.canon                  = data.canon;
  if (data.exapostilaria)          spec.exapostilaria          = data.exapostilaria;
  if (data.exapostilarion)         spec.exapostilarion         = data.exapostilarion;
  if (data.lauds)                  spec.lauds                  = data.lauds;
  if (data.troparionAfterDoxology) spec.troparionAfterDoxology = data.troparionAfterDoxology;
  if (data.finalTroparion)         spec.finalTroparion         = data.finalTroparion;
  if (data.venerationStichera)     spec.venerationStichera     = data.venerationStichera;
  if (data.isGreatFeastOfLord != null) spec.isGreatFeastOfLord = data.isGreatFeastOfLord;
  if (data.includeHavingBeheld != null) spec.includeHavingBeheld = data.includeHavingBeheld;

  return spec;
}

function _buildGreatFeastMatinsStub(feastKey, season, date) {
  const variant = GREAT_FEAST_VARIANTS[feastKey];
  if (!variant) return null;

  const trop = variant.troparia?.[0];
  const kont = variant.kontakia?.[0];

  const spec = {
    isSunday: true,
    feastRank: 'greatFeast',
    feastType: variant.type || null,
    tone: trop?.tone || kont?.tone || 1,
    useSmallDoxology: false,
    kathismaCount: 2,
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion: [],
    _stub: true,
    _stubNote: `Festal Matins propers for ${variant.label} are a known content gap; serving troparion + kontakion only.`,
  };

  if (trop) spec.troparion = { text: trop.text, tone: trop.tone, label: variant.label };
  if (kont) spec.kontakion = { text: kont.text, tone: kont.tone, label: variant.label };
  if (variant.prokeimenon) spec.prokeimenon = variant.prokeimenon;

  if (spec.troparion) spec.finalTroparion = spec.troparion;

  return spec;
}

function _buildSundayMatinsFromOctoechos(tone, season, menaionData, date, sources) {
  const tk = `tone${tone}`;
  const oct = sources.octoechos[tk];
  if (!oct?.sunday?.matins) return null;

  const matins = oct.sunday.matins;
  const vespers = oct.saturday?.vespers;

  // ── Resurrectional troparion (from Saturday Vespers data) ──────────────
  const troparionRaw = vespers?.troparion;
  const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;

  // ── Sessional hymns → sedalion array ──────────────────────────────────
  // The assembler expects spec.sedalion[0] = after K2, spec.sedalion[1] = after K3
  const sedalion = [];
  if (matins.sessionalHymns?.afterKathisma2?.[0]) {
    const h = matins.sessionalHymns.afterKathisma2[0];
    sedalion[0] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }
  if (matins.sessionalHymns?.afterKathisma3?.[0]) {
    const h = matins.sessionalHymns.afterKathisma3[0];
    sedalion[1] = { text: h.text, tone, source: 'octoechos', label: 'Sessional Hymn' };
  }

  // ── Antiphons of Degrees ──────────────────────────────────────────────
  // Combine all antiphon troparia into one text block
  let antiphonsText = '';
  if (matins.antiphonsOfDegrees) {
    const parts = [];
    matins.antiphonsOfDegrees.forEach((ant, i) => {
      parts.push(`Antiphon ${i + 1}`);
      ant.troparia.forEach(t => parts.push(t));
    });
    antiphonsText = parts.join('\n\n');
  }

  // ── Prokeimenon ───────────────────────────────────────────────────────
  const prokeimenon = matins.prokeimenon ? {
    refrain: matins.prokeimenon.refrain,
    verse: matins.prokeimenon.verse,
    tone,
  } : null;

  // ── Canon irmoi + troparia → canon spec ──────────────────────────────
  const canonSpec = { tone };
  if (matins.canonIrmoi) {
    for (const [odeStr, irmosText] of Object.entries(matins.canonIrmoi)) {
      canonSpec[`ode${odeStr}`] = { irmos: irmosText };
    }
  }
  if (matins.canonTroparia) {
    for (const [odeStr, troparia] of Object.entries(matins.canonTroparia)) {
      const odeKey = `ode${odeStr}`;
      if (!canonSpec[odeKey]) canonSpec[odeKey] = {};
      canonSpec[odeKey].troparia = troparia;
    }
  }
  // Kontakion from Octoechos (resurrectional)
  const kontakionRaw = vespers?.kontakion || oct.sunday?.liturgy?.kontakion;
  if (kontakionRaw) {
    canonSpec.kontakion = typeof kontakionRaw === 'object'
      ? kontakionRaw : { text: kontakionRaw, tone };
  }

  const matinsSource = matins._source || 'oca-parma-stsergius';

  // ── Post-Gospel sticheron ─────────────────────────────────────────────
  const postGospelSticheron = matins.postGospelSticheron ? {
    text: matins.postGospelSticheron,
    tone: 6, // always Tone 6
    source: 'octoechos',
    _source: matinsSource,
  } : null;

  // ── Lauds stichera ───────────────────────────────────────────────────
  const lauds = matins.laudsStichera ? {
    read: false,
    tone,
    stichera: matins.laudsStichera.map(s => ({
      text: s.text,
      verse: s.verse,
      tone,
    })),
  } : null;

  // ── Build spec ────────────────────────────────────────────────────────
  const spec = {
    isSunday: true,
    feastRank: null,
    tone,
    useSmallDoxology: false,
    kathismaCount: 2, // Sundays: Kathisma 2 and 3 (17th read separately at Vigil)
    kathismaNumbers: getMatinsKathismata('sunday', season),
    sedalion,
  };

  if (troparionText) {
    spec.troparion = { text: troparionText, tone };
  }

  if (antiphonsText) {
    spec.antiphons = { text: antiphonsText, tone, _source: matinsSource };
  }

  if (prokeimenon) {
    prokeimenon._source = matinsSource;
    spec.prokeimenon = prokeimenon;
  }

  // ── Eothinon cycle (Gospel, Exapostilarion, Doxastikon) ────────────────
  const eothinonNum = date ? getEothinon(date) : null;
  const eothinonData = eothinonNum ? sources.eothinon?.[String(eothinonNum)] : null;

  if (eothinonData) {
    spec.gospel = {
      reading: eothinonData.gospel.reading,
      text: null, // Scripture text not yet sourced
      source: 'eothinon',
      _eothinon: eothinonNum,
      _source: eothinonData._source,
    };

    // Exapostilarion + theotokion
    spec.exapostilaria = [
      {
        text: eothinonData.exapostilarion,
        tone: eothinonData.tone,
        label: `Eothinon ${eothinonNum}`,
        source: 'eothinon',
        _source: eothinonData._source,
      },
      ...(eothinonData.theotokion ? [{
        text: eothinonData.theotokion,
        tone: eothinonData.tone,
        label: 'Theotokion',
        source: 'eothinon',
        _source: eothinonData._source,
      }] : []),
    ];

    // Post-Gospel sticheron is tone-6 fixed (from Octoechos), not eothinon-specific
    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }

    // Lauds doxastikon (the eothinon sticheron sung after "Glory..." at Lauds)
    if (lauds && eothinonData.doxastikon) {
      lauds.doxastikon = {
        text: eothinonData.doxastikon,
        tone: eothinonData.tone,
        author: `Eothinon ${eothinonNum}`,
        _source: eothinonData._source,
      };
    }
  } else {
    // No eothinon data (Triodion period or missing data)
    spec.gospel = {
      reading: eothinonNum
        ? `[Eothinon ${eothinonNum} — data not loaded]`
        : '[Sunday Matins Gospel — Eothinon suspended during Triodion]',
      text: null,
      source: 'eothinon',
    };

    if (postGospelSticheron) {
      spec.postGospelSticheron = postGospelSticheron;
    }
  }

  spec.canon = canonSpec;

  if (lauds) {
    spec.lauds = lauds;
  }

  return spec;
}

// When a simple- or doxology-rank menaion saint coincides with Sunday, the
// menaion-driven branch above produces a weekday-shaped spec (Small Doxology,
// no Gospel, no Lauds). Sunday Matins always uses Great Doxology, always has
// the eothinon Gospel, and always sings Lauds. Layer those defaults on top of
// whatever the menaion file supplied — keeping the saint's troparion / canon /
// sessional hymns intact while restoring the resurrectional skeleton.
function _overlaySundayDefaults(spec, tone, season, date, sources) {
  spec.useSmallDoxology = false;

  if (!spec.gospel) {
    const eothinonNum  = date ? getEothinon(date) : null;
    const eothinonData = eothinonNum ? sources.eothinon?.[String(eothinonNum)] : null;
    if (eothinonData) {
      spec.gospel = {
        reading: eothinonData.gospel.reading,
        text:    null,
        source:  'eothinon',
        _eothinon: eothinonNum,
        _source: eothinonData._source,
      };
    } else {
      spec.gospel = {
        reading: eothinonNum
          ? `[Eothinon ${eothinonNum} — data not loaded]`
          : '[Sunday Matins Gospel — Eothinon suspended during Triodion]',
        text:   null,
        source: 'eothinon',
      };
    }
  }

  const oct       = sources.octoechos?.[`tone${tone}`];
  const octMatins = oct?.sunday?.matins;

  // Fill missing Lauds stichera. The menaion-driven branch sets spec.lauds
  // when the menaion file has only a doxastikon (Glory hymn) — leaving
  // spec.lauds present but spec.lauds.stichera undefined. The Sunday-default
  // path used to early-exit because spec.lauds was truthy; now we restore
  // the Octoechos resurrection stichera so they aren't silently dropped.
  if (!spec.lauds || !spec.lauds.stichera || spec.lauds.stichera.length === 0) {
    const stichera = octMatins?.laudsStichera;
    if (stichera?.length) {
      const matinsSource = octMatins._source || 'oca-parma-stsergius';
      const eothinonNum  = date ? getEothinon(date) : null;
      const eothinonData = eothinonNum ? sources.eothinon?.[String(eothinonNum)] : null;
      const eothinonDoxastikon = eothinonData?.doxastikon ? {
        text:    eothinonData.doxastikon,
        tone:    eothinonData.tone,
        author:  `Eothinon ${eothinonNum}`,
        _source: eothinonData._source,
      } : null;

      if (!spec.lauds) {
        // No Lauds at all from the menaion path — synthesize the whole section
        // from Octoechos + eothinon doxastikon (existing behavior preserved).
        spec.lauds = {
          read: false,
          tone,
          stichera: stichera.map(s => ({ text: s.text, verse: s.verse, tone })),
          _source: matinsSource,
        };
        if (eothinonDoxastikon) spec.lauds.doxastikon = eothinonDoxastikon;
      } else {
        // Lauds exists but stichera are missing (menaion supplied only a
        // doxastikon). Restore the resurrection-stichera blend without
        // disturbing the saint's doxastikon / theotokion.
        spec.lauds.stichera = stichera.map(s => ({ text: s.text, verse: s.verse, tone }));
        if (!spec.lauds.tone) spec.lauds.tone = tone;
        if (!spec.lauds._source) spec.lauds._source = matinsSource;
      }
    }
  }

  // Fill missing Post-Gospel sticheron. Same class of bug — the menaion-driven
  // branch only sets postGospelSticheron when the menaion file has one; on
  // Sunday the Octoechos tone-6 default should always render.
  if (!spec.postGospelSticheron) {
    const text = octMatins?.postGospelSticheron;
    if (text) {
      spec.postGospelSticheron = {
        text,
        tone:    6,
        source:  'octoechos',
        _source: octMatins._source || 'oca-parma-stsergius',
      };
    }
  }
}

let _crossSundayOverlay = null;
function _applyCrossSundayOverlay(spec) {
  if (!_crossSundayOverlay) {
    _crossSundayOverlay = loadJSON('variable-sources/triodion/lent-sunday-cross.json');
  }
  const ov = _crossSundayOverlay.matins;
  if (!ov) return;

  // Sessional hymn of the Cross — sung after Polyeleios + Evlogitaria,
  // before the Antiphons of Degrees.
  if (ov.sessionalHymnAfterPolyeleios) {
    spec.sessionalHymnAfterPolyeleios = ov.sessionalHymnAfterPolyeleios;
  }

  // Cross Canon by St Theodore the Studite — interleaved as a third sub-canon
  // after the Octoechos resurrection / cross-resurrection / theotokos groups.
  // Each Cross-Theodore troparion is tagged `canon: 'crossOfTheStudite'`; the
  // first troparion of each ode carries the ode's irmos via `_irmos` so the
  // assembler can emit the header rubric + Irmos block before the troparia.
  if (ov.crossCanon?.odes) {
    spec.canon = spec.canon || {};
    const cc = ov.crossCanon;
    for (const [odeStr, ode] of Object.entries(cc.odes)) {
      const odeKey = `ode${odeStr}`;
      const odeSpec = spec.canon[odeKey] = spec.canon[odeKey] || {};
      odeSpec.troparia = odeSpec.troparia || [];
      const ccTroparia = [];
      (ode.troparia || []).forEach((text, i) => {
        const trop = { canon: 'crossOfTheStudite', text, tone: cc.tone };
        if (i === 0 && ode.irmos) {
          trop._irmos = ode.irmos;
          trop._irmosTone = cc.tone;
        }
        ccTroparia.push(trop);
      });
      if (ode.theotokion) {
        ccTroparia.push({
          canon: 'crossOfTheStudite',
          text: ode.theotokion,
          tone: cc.tone,
          type: 'theotokion',
        });
      }
      odeSpec.troparia = odeSpec.troparia.concat(ccTroparia);
    }
  }

  // Cross kontakion + ikos (placed after Ode 6 by the canon assembler)
  spec.canon = spec.canon || {};
  if (ov.kontakion) {
    spec.canon.kontakion = {
      text: ov.kontakion.text,
      tone: ov.kontakion.tone,
      label: ov.kontakion._label,
      _source: ov.kontakion._source,
    };
  }
  if (ov.ikos) {
    spec.canon.ikos = {
      text: ov.ikos.text,
      tone: ov.ikos.tone,
      label: ov.ikos._label,
      _source: ov.ikos._source,
    };
  }

  // Cross exapostilarion at Glory + Theotokion at Both now —
  // appended after the eothinon exapostilaria already in the array.
  if (ov.exapostilarion) {
    spec.exapostilaria = spec.exapostilaria || [];
    if (ov.exapostilarion.glory) {
      spec.exapostilaria.push({
        text: ov.exapostilarion.glory.text,
        label: 'Glory — ' + (ov.exapostilarion.glory._label || 'Exapostilarion of the Cross'),
        source: 'triodion',
        _source: ov.exapostilarion._source,
      });
    }
    if (ov.exapostilarion.bothNow) {
      spec.exapostilaria.push({
        text: ov.exapostilarion.bothNow.text,
        label: 'Both now — ' + (ov.exapostilarion.bothNow._label || 'Theotokion'),
        source: 'triodion',
        _source: ov.exapostilarion._source,
      });
    }
  }

  // Cross Lauds stichera — appended after the Octoechos Resurrection
  // stichera; doxastikon (Tone 8) replaces the eothinon; theotokion is
  // added at Both now.
  if (ov.laudsStichera && spec.lauds) {
    const cross = ov.laudsStichera;
    spec.lauds.stichera = (spec.lauds.stichera || []).concat(
      (cross.stichera || []).map(st => ({
        text: st.text,
        tone: st.tone,
        verse: st.verse,
        _source: cross._source,
      }))
    );
    if (cross.doxastikon) {
      spec.lauds.doxastikon = {
        text: cross.doxastikon.text,
        tone: cross.doxastikon.tone,
        author: cross.doxastikon._label || 'Doxastikon of the Cross',
        _source: cross._source,
      };
    }
    if (cross.theotokion) {
      spec.lauds.theotokion = {
        text: cross.theotokion.text,
        tone: cross.theotokion.tone,
        label: cross.theotokion._label || 'Theotokion',
        _source: cross._source,
      };
    }
  }

  // Cross troparion sung after the Great Doxology.
  if (ov.troparionAfterDoxology) {
    spec.troparionAfterDoxology = {
      text: ov.troparionAfterDoxology.text,
      tone: ov.troparionAfterDoxology.tone,
    };
  }

  // Veneration of the Cross — stichera after the Great Doxology + troparion.
  if (ov.venerationStichera) {
    const v = ov.venerationStichera;
    spec.venerationStichera = {
      section: v.section || 'Veneration of the Cross',
      rubric: v.rubric,
      stichera: (v.stichera || []).map(s => ({
        text: s.text,
        tone: s.tone,
        label: s.label || s.author || s._label,
        _source: v._source,
      })).concat(v.closingSticheron ? [{
        text: v.closingSticheron.text,
        tone: v.closingSticheron.tone,
        label: v.closingSticheron.label,
        _source: v._source,
      }] : []),
      closingRubric: v.closingRubric,
    };
  }
}

const AFTERFEAST_CANON_ODES = ['ode1', 'ode3', 'ode4', 'ode5', 'ode6', 'ode7', 'ode8', 'ode9'];

// Merge a shared feast canon (Canon I) with a saint's canon (Canon II).
// `saintCanon` is mat.canon from a menaion file that has `afterfeastOf: "<key>"`.
// Returns a merged canon object shaped exactly like a two-canon menaion file
// (irmos = feast, irmos2 = saint, secondCanon-tagged troparia = saint's).
function _mergeAfterFeastCanon(saintCanon) {
  const feastKey = saintCanon.afterfeastOf;
  const feastCanon = loadJSON(`variable-sources/feast-canons/${feastKey}.json`);

  const merged = {
    tone: feastCanon.tone,
    _secondCanonTone: saintCanon.tone,
  };
  if (saintCanon._thirdCanonTone) merged._thirdCanonTone = saintCanon._thirdCanonTone;

  // Copy all non-ode saint-canon fields (kontakion, ikos, kontakionAfterOde3,
  // sedalenAfterOde3, skipMagnificat, joint flags, etc.)
  for (const [k, v] of Object.entries(saintCanon)) {
    if (k === 'afterfeastOf' || k === 'tone' || AFTERFEAST_CANON_ODES.includes(k)) continue;
    merged[k] = v;
  }

  for (const ode of AFTERFEAST_CANON_ODES) {
    const fOde = feastCanon[ode] || {};
    const sOde = saintCanon[ode] || {};
    if (!fOde.irmos && !sOde.troparia?.length) continue;

    const mergedOde = {};
    if (fOde.irmos)  mergedOde.irmos  = fOde.irmos;
    if (sOde.irmos2) mergedOde.irmos2 = sOde.irmos2;
    if (sOde.irmos3) mergedOde.irmos3 = sOde.irmos3;

    mergedOde.troparia = [
      ...(fOde.troparia || []),
      ...(sOde.troparia || []),
    ];

    if (fOde.katavasia) mergedOde.katavasia = fOde.katavasia;
    // Saint's sessional hymn takes precedence; fall back to feast's
    const sedalen = sOde.sedalenAfterOde3 || fOde.sedalenAfterOde3;
    if (sedalen) mergedOde.sedalenAfterOde3 = sedalen;

    merged[ode] = mergedOde;
  }

  return merged;
}

function buildMatinsSpec(dateStr, date, dow, season, tone, sources, style = 'new') {
  // For Old Style, the menaion / Great Feast / Vigil-saint lookups consult the
  // Julian (M, D), not the Gregorian civil date. Day-of-week, Pascha-relative
  // math, and the URL field continue to use the unadjusted civil date.
  const adjDate = fixedFeastDate(date, style);
  const mo = adjDate.getUTCMonth() + 1;
  const dy = adjDate.getUTCDate();
  const mm = String(mo).padStart(2, '0');
  const dd = String(dy).padStart(2, '0');

  // ── Check for great feast menaion data ──────────────────────────────────
  const feastKey = getGreatFeastKey(date, style);
  const monthNames = ['', 'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const menaionKey = `${monthNames[mo]}-${dd}`;
  const menaionPath = path.join(ROOT, 'variable-sources', 'menaion', `${menaionKey}.json`);

  let menaionData = null;
  if (fs.existsSync(menaionPath)) {
    menaionData = loadJSON(`variable-sources/menaion/${menaionKey}.json`);
  }

  const isSunday = dow === 'sunday';
  const isLent = season === 'greatLent';
  const isLentenWeekday = isLent && !isSunday && dow !== 'saturday';

  // ── Holy Week / Bright Week: no regular Matins ─────────────────────────
  // Mon–Sat of Holy Week have special services (Bridegroom, Passion Gospels,
  // Lamentations). Bright Week has Paschal Matins/Hours.
  // Palm Sunday keeps regular Sunday Matins (with festal content).
  // EXCEPTION: a Great Feast falling in this window keeps its festal propers
  // (Typikon rubric for "Annunciation on Holy ___"). The canonical case is
  // Old-Style Annunciation — Julian Mar 25 maps to early-to-mid-April civil,
  // which can land inside Holy Week (e.g. 2026-04-07 = Holy Tuesday).
  const isHolyWeekday = season === 'holyWeek' && !isSunday;
  const isBright      = season === 'brightWeek';
  if ((isHolyWeekday || isBright) && !feastKey) return null;

  // ── Moveable-feast / weekday festal matins (Pentecost, Ascension, …) ────
  // Tried first so that a feast falling on a weekday gets full festal
  // propers rather than the DB-injected weekday stub below. A festal-matins
  // file (great feast of the Lord) ALWAYS wins over a coincident menaion
  // saint — e.g. Ascension (May 21 in 2026) overrides Sts Constantine &
  // Helena. Saints with their own menaion files but no festal-matins file
  // (Theophany, Nativity, Transfiguration, Forerunner-feasts, etc.) fall
  // through to the menaion branch below.
  if (feastKey) {
    const festalSpec = _loadFestalMatins(feastKey, season, dow, tone);
    if (festalSpec) return festalSpec;
    // No festal file AND the menaion has no matins data either — nothing
    // meaningful to render in Holy/Bright Week; bail rather than emit a
    // weekday stub through the fallback below.
    if ((isHolyWeekday || isBright) && !menaionData?.matins) return null;
  }

  // ── Sunday Matins from Octoechos ──────────────────────────────────────────
  if (isSunday && (!menaionData || !menaionData.matins)) {
    const sundaySpec = _buildSundayMatinsFromOctoechos(tone, season, menaionData, date, sources);
    if (sundaySpec) {
      // Cross-Sunday Triodion overlay (3rd Sunday of Great Lent)
      if (isLent && getWeekOfLent(date) === 3) {
        _applyCrossSundayOverlay(sundaySpec);
      }
      return sundaySpec;
    }

    // Octoechos returned null and no festal matins data — fall back to a
    // minimal stub from GREAT_FEAST_VARIANTS so the service is at least
    // browsable; this signals a content gap rather than a 404.
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]) {
      return _buildGreatFeastMatinsStub(feastKey, season, date);
    }
    return null;
  }

  // ── Weekday/Saturday Matins (no menaion matins data) ────────────────────
  // Build a minimal spec with fixed content + Menaion DB troparion/kontakion
  if (!menaionData || !menaionData.matins) {
    const kathNums = getMatinsKathismata(dow, season);
    const menaionRanked = getMenaionRanked(mo, dy);
    const principal = menaionRanked?.principal;

    const spec = {
      isSunday: false,
      feastRank: null,
      tone,
      alleluia: isLentenWeekday,
      useSmallDoxology: true,
      kathismaCount: kathNums.length || 2,
      kathismaNumbers: kathNums,
    };

    // Troparion from Menaion DB
    if (principal?.hasTroparion) {
      const trop = principal.troparia.find(t => t.type === 'troparion');
      if (trop) {
        spec.troparion = { text: trop.text, tone: trop.tone, label: principal.title };
      }
    }

    // Kontakion from Menaion DB (placed after Ode 6 if we have a canon stub)
    if (principal) {
      const kont = principal.troparia.find(t => t.type === 'kontakion');
      if (kont) {
        spec.kontakion = { text: kont.text, tone: kont.tone, label: principal.title };
      }
    }

    // Final troparion for small doxology path
    if (spec.troparion) {
      spec.finalTroparion = spec.troparion;
    }

    // Octoechos weekday Matins Aposticha for stub dates (no menaion matins file)
    if (!isSunday && !isLentenWeekday) {
      const weekdayAposticha = sources?.octoechos?.[`tone${tone}`]?.[dow]?.matins?.aposticha;
      if (weekdayAposticha) spec.aposticha = weekdayAposticha;
    }

    return spec;
  }

  const mat = menaionData.matins;

  // ── Determine doxology type ─────────────────────────────────────────────
  // During Lent on weekdays, even great feasts use the Small (read) Doxology.
  // Simple-rank (six-stichera) services also use Small Doxology by definition —
  // they have no Lauds and end with Small Doxology + festal troparion +
  // Octoechos Aposticha.
  const resolvedFeastRank = menaionData._meta?.feastRank
    || mat?._meta?.feastRank
    || (feastKey ? 'greatFeast' : null);
  const useSmallDoxology = isLentenWeekday || resolvedFeastRank === 'simple';

  // ── Build the spec ──────────────────────────────────────────────────────
  const spec = {
    isSunday,
    feastRank: resolvedFeastRank,
    feastType: menaionData._meta?.feastType || null,
    tone: menaionData._meta?.tone || tone,
    alleluia: false, // great feasts override Lenten Alleluia
    useSmallDoxology,
  };

  // Troparion — for afterfeast dates feastTroparion drives "God is the Lord"
  // and the saint's troparion fills the Glory slot
  if (menaionData.feastTroparion) {
    spec.feastTroparion = menaionData.feastTroparion;
  }
  if (menaionData.troparion) {
    spec.troparion = menaionData.troparion;
  }

  // Kathismata
  const kathNums = getMatinsKathismata(dow, season);
  spec.kathismaCount = kathNums.length || (isSunday ? 3 : 2);
  spec.kathismaNumbers = kathNums;

  // Magnification (at Polyeleios)
  if (mat.magnification) {
    spec.magnification = mat.magnification;
  }

  // Prokeimenon
  if (mat.prokeimenon) {
    spec.prokeimenon = mat.prokeimenon;
  }

  // Gospel
  if (mat.gospel) {
    spec.gospel = mat.gospel;
  }

  // Post-Gospel sticheron
  if (mat.postGospelSticheron) {
    spec.postGospelSticheron = mat.postGospelSticheron;
  }

  // Sessional hymns after Kathismata (rendered at the kathisma reading points)
  if (mat.sedalion) {
    spec.sedalion = mat.sedalion;
  }

  // Canon
  if (mat.canon) {
    // Afterfeast: merge shared feast canon (Canon I) with saint's canon (Canon II)
    const srcCanon = mat.canon.afterfeastOf
      ? _mergeAfterFeastCanon(mat.canon)
      : mat.canon;

    const canonSpec = {
      tone: srcCanon.tone || spec.tone,
      author: srcCanon.author,
    };
    // Copy ode data + every canon-level field (metadata, skipMagnificat,
    // sedalenAfterOde3, etc.). `tone`/`author` are already set above.
    for (const [k, v] of Object.entries(srcCanon)) {
      if (k === 'tone' || k === 'author') continue;
      canonSpec[k] = v;
    }
    // Sessional hymns after Ode 3 (matins-level overrides canon-level)
    if (mat.sessionalHymns) {
      canonSpec.sedalenAfterOde3 = mat.sessionalHymns;
    } else if (mat.sedalen) {
      canonSpec.sedalenAfterOde3 = mat.sedalen;
    }
    // Kontakion/ikos (placed inside canon spec so they appear after Ode 6).
    // Prefer the matins-canon kontakion if present (festal-specific text);
    // otherwise fall back to the top-level menaion kontakion.
    if (srcCanon.kontakion) {
      canonSpec.kontakion = srcCanon.kontakion;
    } else if (menaionData.kontakion) {
      canonSpec.kontakion = menaionData.kontakion;
    }
    // Skip Magnificat on great feasts that have their own Ode 9 megalynarion
    if (srcCanon.ode9?.megalynarion) {
      canonSpec.skipMagnificat = true;
    }
    spec.canon = canonSpec;
  }

  // Exapostilaria (array or singular with `repeat: N`)
  if (mat.exapostilaria) {
    spec.exapostilaria = mat.exapostilaria;
  } else if (mat.exapostilarion) {
    spec.exapostilarion = mat.exapostilarion;
  }

  // Festal troparion after the Great Doxology (overrides Sunday default)
  if (mat.troparionAfterDoxology) {
    spec.troparionAfterDoxology = mat.troparionAfterDoxology;
  }

  // Veneration stichera (Elevation procession after the Great Doxology, etc.)
  if (mat.venerationStichera) {
    spec.venerationStichera = mat.venerationStichera;
  }

  // Sessional hymn after Polyeleios (polyeleos-rank menaion files supply this)
  if (mat.sessionalHymnAfterPolyeleios) {
    spec.sessionalHymnAfterPolyeleios = mat.sessionalHymnAfterPolyeleios;
  }

  // Flags forwarded from the festal matins data
  if (mat._meta?.feastRank)        spec.feastRank        = mat._meta.feastRank;
  if (mat._meta?.feastType)        spec.feastType        = mat._meta.feastType;
  if (mat.isGreatFeastOfLord != null) spec.isGreatFeastOfLord = mat.isGreatFeastOfLord;
  if (mat.includeHavingBeheld != null) spec.includeHavingBeheld = mat.includeHavingBeheld;

  // Lauds
  if (mat.lauds) {
    spec.lauds = {
      read: isLentenWeekday, // read on Lenten weekdays, sung otherwise
      tone: mat.lauds.stichera?.[0]?.tone || spec.tone,
      stichera: mat.lauds.stichera,
      doxastikon: mat.lauds.doxastikon,
      theotokion: mat.lauds.theotokion,
    };
  }

  // Aposticha — two sources:
  //   1. Menaion file's own aposticha (Lenten weekday feasts, if authored)
  //   2. Octoechos weekday aposticha (ordinary time Mon–Sat, small-doxology path)
  if (isLentenWeekday && mat.aposticha) {
    spec.aposticha = mat.aposticha;
  } else if (useSmallDoxology && !isSunday) {
    // Inject Octoechos weekday Matins Aposticha for simple-rank weekday services
    const weekdayAposticha = sources?.octoechos?.[`tone${tone}`]?.[dow]?.matins?.aposticha;
    if (weekdayAposticha) {
      spec.aposticha = weekdayAposticha;
      // Menaion saint's Aposticha doxastikon — split the Octoechos `glory`
      // (which is semantically the Now+Theotokion in the OCA Octoechos data
      // shape) into a separate `now` slot and put the saint's doxastikon at
      // `glory`. OCA simple-rank weekday Matins ends Aposticha: 3 Octoechos
      // stichera + Glory + saint's doxastikon (in saint's tone) + Now and
      // ever + Octoechos Theotokion (kept). Cyrus & John 01-31 is the
      // worked example; the doxastikon was previously mis-located under
      // lauds.
      if (mat.aposticha?.doxastikon) {
        spec.aposticha = {
          ...spec.aposticha,
          glory: mat.aposticha.doxastikon,
          now:   spec.aposticha.glory,
        };
      }
    }
  }

  // Final troparion (for aposticha path)
  if (useSmallDoxology && menaionData.troparion) {
    spec.finalTroparion = menaionData.troparion;
  }

  // Sunday-coincident menaion saint: restore the resurrectional Sunday skeleton
  // (Gospel, Lauds, Great Doxology) that the weekday-shaped menaion branch above
  // strips out. The saint's troparion / canon / hymns stay; we only fill the
  // Sunday-required pieces the menaion file doesn't supply.
  if (isSunday) {
    _overlaySundayDefaults(spec, tone, season, date, sources);
  }

  return spec;
}

module.exports = { buildMatinsSpec };

