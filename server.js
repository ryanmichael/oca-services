/**
 * OCA Service Browser
 *
 * A minimal HTTP server for browsing assembled Vespers services.
 * Uses calendar-rules.js + assembler.js + renderer.js to render
 * a full service (fixed + variable texts) for any date.
 *
 * For regular Saturdays in ordinary time, services are generated
 * automatically. For Lenten/special dates, hand-authored calendar
 * entries are used if available.
 *
 * Usage:
 *   node server.js          — starts on http://localhost:3000
 *   node server.js --port 8080
 */

'use strict';

const http = require('node:http');
const fs   = require('fs');
const path = require('path');

const { assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours, assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins, assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy, assembleRoyalHours, assembleMatins, resolveSource } = require('./assembler');
const { generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
        getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
        isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay, isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
        getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday,
        getEothinon } = require('./calendar-rules');
const { renderService, renderVespers }             = require('./renderer');
const { getMatinsKathismata }                    = require('./kathisma');
const { deduplicateBySource }                    = require('./oca-psalter');

const { loadJSON }       = require('./server-lib/_shared/load-json');
const { escHtml, formatDate } = require('./server-lib/_shared/html');
const { parseQuery }     = require('./server-lib/_shared/parse-query');
const { serveStatic }    = require('./server-lib/_shared/serve-static');

// Translation overlay subsystem. Each overlay lives at
// fixed-texts/translations/<id>/ as a manifest.json plus sparse <service>-fixed.json
// files. Selection priority: ?translation= query > LITURGY_TRANSLATION env > none.
// See server-lib/overlays/ for the cascade, drift, diff, rubrics, and registry layers.
const {
  fixedTextRegistry, registerBaseFixed,
  getOverlayFixed, getLiturgyFixed,
  getOverlayRubrics,
  getTranslationManifests,
  validateAllTranslations,
  tagBlocksWithOverlay, diffOverlay,
  resolveTranslation,
} = require('./server-lib/overlays');

// Variable-source resolvers (calendar entries, menaion, propers, matins-spec,
// liturgy-from-orthocal, db-source) and cache primitives (oca.db, orthocal cache).
const {
  loadSources,
  getCalendarEntry, getNextDateStr,
  getMenaionRanked, getSticheraDay, getMenaionDay, getMenaionDayList,
  GENERAL_MENAION_FALLBACK, getGeneralMenaionTexts,
  GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES, LITURGICAL_DAY_LABELS,
  DAY_PATRONS,
  buildMatinsSpec, buildLiturgyFromOrthocal,
  buildDbSource, getDbBlocks, mapDbBlocks,
} = require('./server-lib/sources');
const { openDb, ensureOrthocalCacheTable, fetchOrthocalDay } = require('./server-lib/cache');

// ─── Config ───────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT    = portIdx !== -1 ? parseInt(args[portIdx + 1], 10)
              : process.env.PORT ? parseInt(process.env.PORT, 10)
              : 3000;

// ─── Home page ────────────────────────────────────────────────────────────────

const HOME_CSS = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: Georgia, "Times New Roman", serif;
    background: #f9f6f2;
    color: #1a1a1a;
    margin: 0;
    padding: 40px 20px;
    min-height: 100vh;
  }
  .layout {
    max-width: 860px;
    margin: 0 auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 32px;
    align-items: start;
  }
  @media (max-width: 640px) { .layout { grid-template-columns: 1fr; } }
  .card {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 36px 40px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.06);
  }
  h1 {
    font-size: 18pt;
    font-weight: bold;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #8b1a1a;
    margin: 0 0 6px;
    text-align: center;
  }
  h2 {
    font-size: 11pt;
    font-weight: bold;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #555;
    margin: 0 0 20px;
    text-align: center;
    border-bottom: 1px solid #e8e0d8;
    padding-bottom: 12px;
  }
  .subtitle {
    text-align: center;
    color: #666;
    font-size: 10pt;
    margin: 0 0 28px;
  }
  label {
    display: block;
    font-size: 9.5pt;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555;
    margin-bottom: 5px;
  }
  input[type=date], select {
    width: 100%;
    font-family: inherit;
    font-size: 12pt;
    padding: 8px 10px;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    color: #1a1a1a;
    margin-bottom: 16px;
    cursor: pointer;
  }
  .pronoun-group {
    display: flex;
    gap: 16px;
    margin-bottom: 20px;
  }
  .pronoun-group label {
    flex: 1;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11pt;
    font-weight: normal;
    cursor: pointer;
    margin: 0;
  }
  .pronoun-group input { margin-right: 6px; }
  button {
    width: 100%;
    padding: 11px;
    background: #8b1a1a;
    color: #fff;
    font-family: inherit;
    font-size: 11.5pt;
    font-weight: bold;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover { background: #a02020; }
  .note {
    font-size: 9pt;
    color: #888;
    margin-top: 16px;
    font-style: italic;
    text-align: center;
  }
  .date-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 480px;
    overflow-y: auto;
  }
  .date-list li { border-bottom: 1px solid #f0ebe4; }
  .date-list li:last-child { border-bottom: none; }
  .date-list a {
    display: block;
    padding: 8px 4px;
    color: #1a1a1a;
    text-decoration: none;
    font-size: 11pt;
  }
  .date-list a:hover { background: #faf7f4; color: #8b1a1a; }
  .date-list .badge {
    float: right;
    font-size: 8.5pt;
    color: #999;
    font-style: italic;
  }
`;

function renderHomePage(collectedDates) {
  // Build list of collected dates (from DB, grouped)
  const byDate = {};
  for (const { date, pronoun } of collectedDates) {
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(pronoun);
  }

  const listItems = Object.keys(byDate).sort().map(d => {
    const p = byDate[d].includes('tt') ? 'tt' : byDate[d][0];
    return `<li><a href="/service?date=${d}&pronoun=${p}">${formatDate(d)} <span class="badge">collected</span></a></li>`;
  }).join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OCA Service Texts</title>
  <style>${HOME_CSS}</style>
</head>
<body>
  <div class="layout">

    <div class="card">
      <h1>Great Vespers</h1>
      <p class="subtitle">Enter any date to view the assembled service</p>

      <form method="GET" action="/service">
        <label for="date-input">Date</label>
        <input type="date" id="date-input" name="date" value="2026-09-26" required />

        <label>Pronouns</label>
        <div class="pronoun-group">
          <label><input type="radio" name="pronoun" value="tt" checked /> Thee / Thy</label>
          <label><input type="radio" name="pronoun" value="yy" /> You / Your</label>
        </div>

        <button type="submit">View Service</button>
      </form>

      <p class="note">
        Regular Saturdays in ordinary time are generated automatically.<br />
        Other dates require a hand-authored calendar file.
      </p>
    </div>

    <div class="card">
      <h2>Collected Dates</h2>
      <ul class="date-list">
        ${listItems || '<li style="padding:8px;color:#999;">No dates collected yet.</li>'}
      </ul>
    </div>

  </div>
</body>
</html>`;
}

// ─── Error / info pages ───────────────────────────────────────────────────────

/**
 * Converts a raw {source, key} warning from assembler.js into a human-readable message.
 * Returns null if the warning is minor/expected and shouldn't be shown.
 */
function formatAssemblyWarning(source, key) {
  const k = key || '';

  if (source === 'octoechos') {
    // Extract tone number
    const toneMatch = k.match(/^tone(\d)/);
    const toneNum = toneMatch ? toneMatch[1] : '?';

    if (k.includes('lordICall.martyrs')) {
      return `Martyrs stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.departedGlory')) {
      return `Doxastichon "For the Departed" at Lord, I Have Cried (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('lordICall.resurrectional')) {
      return `Resurrectional stichera at Lord, I Have Cried (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('dogmatikon')) {
      return `Dogmatikon (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('aposticha')) {
      return `Aposticha stichera (Tone ${toneNum}) are not yet in the Octoechos data.`;
    }
    if (k.includes('troparion')) {
      return `Resurrectional troparion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    if (k.includes('dismissalTheotokion')) {
      return `Dismissal theotokion (Tone ${toneNum}) is not yet in the Octoechos data.`;
    }
    return `Octoechos Tone ${toneNum} data is incomplete (${k}).`;
  }

  if (source === 'triodion') {
    if (k.includes('lordICall')) return `Lord, I Have Cried stichera from the Triodion are missing (${k}).`;
    if (k.includes('aposticha')) return `Aposticha stichera from the Triodion are missing (${k}).`;
    if (k.includes('troparia')) return `Troparia from the Triodion are missing (${k}).`;
    return `Triodion texts are missing (${k}).`;
  }

  if (source === 'menaion') {
    if (k.includes('lordICall')) return `Menaion Lord, I Have Cried stichera are not available for this date.`;
    if (k.includes('troparion')) return `Menaion troparion is not available for this date.`;
    return `Menaion texts are not available for this date (${k}).`;
  }

  if (source === 'prokeimena') {
    return `Evening prokeimenon text is missing (${k}).`;
  }

  // 'db' source is the SQLite Lenten/Pentecostarion DB — suppress from user-facing banners
  // (the server handles these separately via its own coverage checks)
  if (source === 'db') return null;

  return `Missing liturgical text: ${source} → ${k}`;
}

function renderErrorPage(message, detail = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Error — OCA Service Texts</title>
  <style>
    body { font-family: Georgia, serif; padding: 60px; color: #1a1a1a; max-width: 640px; margin: 0 auto; }
    h1 { color: #8b1a1a; font-size: 16pt; }
    p { font-size: 12pt; line-height: 1.6; }
    a { color: #8b1a1a; }
    .detail { font-size: 10.5pt; color: #666; font-style: italic; }
  </style>
</head>
<body>
  <h1>Service Unavailable</h1>
  <p>${escHtml(message)}</p>
  ${detail ? `<p class="detail">${escHtml(detail)}</p>` : ''}
  <p><a href="/">← Back</a></p>
</body>
</html>`;
}

/**
 * Renders blocks as a standalone HTML service sheet with back-bar and warnings.
 * Used by all service routes when format=html is requested.
 */
function renderServiceHTML(res, blocks, title, date, pronoun) {
  const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
  const html = renderService(blocks, { title, date: `${date}${pronounLabel}` });
  const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
  const rawWarnings = blocks._warnings || [];
  const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
  const uniqueWarnings = [...new Set(warningMessages)];
  const warningBanner = uniqueWarnings.length > 0
    ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
         <strong>⚠ Some portions of this service are incomplete:</strong>
         <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
       </div>`
    : '';
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html.replace('<body>', '<body>' + backBar + warningBanner));
}


function getCollectedDates() {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    return db.prepare(`
      SELECT DISTINCT date, pronoun FROM source_files
      WHERE date IS NOT NULL ORDER BY date, pronoun
    `).all();
  } catch { return []; }
  finally { db?.close(); }
}

// ─── assembleForDate helper ───────────────────────────────────────────────────

/**
 * Core assembly function. Returns { blocks, calendarEntry, serviceTitle, tone }
 * or null if no calendar entry exists for the date.
 * Throws on assembly error.
 */
function assembleForDate(date, pronoun, entryOverride, vespersFixedOverride) {
  const calendarEntry = entryOverride || getCalendarEntry(date);
  if (!calendarEntry) return null;
  const vespersFixed = vespersFixedOverride || fixedTexts;

  const dbSource = buildDbSource(date, pronoun);

  let menaionOverride = sources.menaion;

  // ── Pentecostarion Sunday vespers override: inject LIC stichera from JSON ─
  // PENTECOSTARION_SUNDAY_OVERRIDES[N].vespers.lordICall replaces DB-sourced
  // slots so the assembler emits the correct feast idiomela + Tone 8 doxastichon
  // instead of falling through to Menaion (May 31 = Hermias, etc.).
  {
    const [yy, mo, dd] = date.split('-').map(Number);
    const dObj = new Date(Date.UTC(yy, mo - 1, dd));
    const pa = calculatePascha(yy);
    const dsp = Math.round((dObj - pa) / (24 * 60 * 60 * 1000));
    const pentLic = PENTECOSTARION_SUNDAY_OVERRIDES[dsp]?.vespers?.lordICall;
    if (pentLic && Array.isArray(pentLic.stichera) && calendarEntry.vespers?.lordICall) {
      const stichera = pentLic.stichera;
      const dox      = pentLic.doxastichon;
      const total    = stichera.length;
      const verses   = Array.from({ length: total }, (_, i) => total - i);
      const lic      = calendarEntry.vespers.lordICall;
      const provLabel = 'OCA';
      lic.tone        = stichera[0].tone;
      lic.totalStichera = total;
      lic.slots = [{
        verses, count: total,
        source: 'menaion', provenance: provLabel,
        key:    `auto.${date}.lordICall`,
        tone:   stichera[0].tone,
        label:  'Stichera of Pentecost',
      }];
      lic.glory = dox ? {
        source: 'menaion', provenance: provLabel,
        key:    `auto.${date}.lordICall.glory`,
        tone:   dox.tone,
        label:  dox.label || 'Glory… Now and ever…',
        combinesGloryNow: true,
      } : null;
      lic.now = null;
      // Suppress generic Menaion injection (which would pull May-31 Hermias).
      calendarEntry.vespers.isPentecostarionSunday = true;
      const autoSlot = { lordICall: { hymns: stichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) } };
      if (dox) autoSlot.lordICall.glory = { text: dox.text, tone: dox.tone, label: dox.label };
      menaionOverride = { ...sources.menaion, auto: { ...(sources.menaion.auto || {}), [date]: autoSlot } };
    }
  }
  // 'greatLent' included so great feasts that fall in Lent (Annunciation, Meeting)
  // still get their menaion stichera injected; regular Lenten weekdays are protected
  // by hasTriodionContent (their slots already carry source:'db' Triodion content).
  const injectSeasons = ['ordinaryTime', 'pentecostarion', 'preLenten', 'greatLent'];
  const isSaturdayInjection = calendarEntry.dayOfWeek === 'saturday';
  const isGreatVespers      = calendarEntry.vespers?.serviceType === 'greatVespers' ||
                              calendarEntry.vespers?.serviceType === 'all-night-vigil';
  const isWeekdayInjection  = !isSaturdayInjection;
  // Skip Menaion injection when the service already has complete Triodion content
  // (lordICall slots are DB-sourced, meaning a special observance like Meatfare Saturday)
  // Also skip for Pentecostarion Sundays — they use only Octoechos + Pentecostarion texts
  const hasTriodionContent = calendarEntry.vespers?.lordICall?.slots?.some(s => s.source === 'db');
  const isPentSundayVespers = calendarEntry.vespers?.isPentecostarionSunday;
  if (calendarEntry._meta?.generated && injectSeasons.includes(calendarEntry.liturgicalContext?.season) && !hasTriodionContent && !isPentSundayVespers) {
    const [, mm, dd] = date.split('-').map(Number);
    const ranked = getMenaionRanked(mm, dd);
    const primary = ranked?.principal ?? null;
    let sticheraData = ranked?.sticheraComm
      ? [{ id: ranked.sticheraComm.id, title: ranked.sticheraComm.title,
           rank: ranked.sticheraComm.rank, stichera: ranked.sticheraComm.stichera }]
      : null;

    // General Menaion fallback: when no day-specific stichera exist,
    // use generic texts for this saint's category
    if (!sticheraData && primary?.saint_type) {
      const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
      if (gmTexts) {
        sticheraData = [{ id: primary.id, title: primary.title,
          rank: primary.rank, stichera: gmTexts }];
      }
    }

    if (primary) {
      const troparion = primary.troparia.find(t => t.type === 'troparion');
      const autoSlot  = { troparion: { text: troparion.text, tone: troparion.tone, label: primary.title } };

      // Determine provenance label for dev-mode display
      const firstDbSrc = sticheraData?.[0]?.stichera?.[0]?.dbSource;
      let menaionProvenance = firstDbSrc && firstDbSrc.startsWith('stSergius')
        ? 'St. Sergius'
        : 'OCA';

      // Great Feast all-night-vigil: up to 8 stichera (unique hymns repeat to fill slots)
      // Great Vespers: up to 6; Daily Vespers: up to 3
      const isVigilFeast  = calendarEntry.vespers?.serviceType === 'all-night-vigil';
      const maxLicStichera = isVigilFeast ? 8 : (isGreatVespers ? 6 : (isSaturdayInjection ? 6 : 3));
      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, maxLicStichera) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection && !calendarEntry.liturgicalContext?.greatFeast && !isVigilFeast) {
          // Saturday: split verses between resurrectional (Octoechos) and Menaion
          const menaionCount        = licStichera.length;
          const resurrectionalCount = 6 - menaionCount;
          const allVerses           = [6, 5, 4, 3, 2, 1];
          if (resurrectionalCount === 0) {
            lic.slots = [];
          } else {
            lic.slots[0].verses = allVerses.slice(0, resurrectionalCount);
            lic.slots[0].count  = resurrectionalCount;
          }
          lic.slots.push({
            verses: allVerses.slice(resurrectionalCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else if (isVigilFeast && licStichera.length < 8) {
          // All-Night Vigil: unique hymns repeat to fill 8 slots (e.g. 4 unique × 2)
          const totalSlots = lic.totalStichera || 8;
          const allVerses  = Array.from({ length: totalSlots }, (_, i) => totalSlots - i);
          lic.slots = [{
            verses: allVerses,
            count:  totalSlots,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
          // Build hymns array with repeats to fill totalSlots
          const hymns = [];
          for (let i = 0; i < totalSlots; i++) {
            hymns.push({ text: licStichera[i % licStichera.length].text,
                         tone: licStichera[i % licStichera.length].tone,
                         label: licStichera[i % licStichera.length].label });
          }
          autoSlot.lordICall = { hymns };
        } else if (isWeekdayInjection && !isGreatVespers && lic.slots?.length > 0 && lic.slots[0].source === 'octoechos') {
          // Weekday Daily Vespers: split 6 stichera between Octoechos and Menaion
          const menaionCount    = Math.min(licStichera.length, 3);
          const octoechosCount  = 6 - menaionCount;
          const allVerses       = [6, 5, 4, 3, 2, 1];
          lic.slots[0].verses   = allVerses.slice(0, octoechosCount);
          lic.slots[0].count    = octoechosCount;
          lic.slots.push({
            verses: allVerses.slice(octoechosCount),
            count:  menaionCount,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          });
        } else {
          // Great Vespers or Vigil with ≥8 unique stichera — all Menaion
          const allVerses = isVigilFeast
            ? [8, 7, 6, 5, 4, 3, 2, 1].slice(0, licStichera.length)
            : [6, 5, 4, 3, 2, 1].slice(0, licStichera.length);
          lic.slots = [{
            verses: allVerses,
            count:  licStichera.length,
            source: 'menaion', provenance: menaionProvenance,
            key:    `auto.${date}.lordICall`,
            tone:   licStichera[0].tone,
            label:  primary.title,
          }];
        }

        if (!autoSlot.lordICall) {
          autoSlot.lordICall = { hymns: licStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })) };
        }

        if (licGlory) {
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title, combinesGloryNow: true };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      // Inject Menaion aposticha stichera when available
      let apostStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'aposticha' && s.order >= 1
      ).slice(0, 3) ?? [];
      let apostGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'aposticha' && s.order === 0
      ) ?? null;

      // General Menaion aposticha fallback when day-specific aposticha is missing
      if (apostStichera.length === 0 && !apostGlory && primary?.saint_type) {
        const gmTexts = getGeneralMenaionTexts(primary.saint_type, primary.title);
        if (gmTexts) {
          const gmApost = gmTexts.filter(r => r.section === 'aposticha' && r.order >= 1).slice(0, 3);
          const gmGlory = gmTexts.find(r => r.section === 'aposticha' && r.order === 0) ?? null;
          if (gmApost.length > 0 || gmGlory) {
            apostStichera = gmApost;
            apostGlory = gmGlory;
            menaionProvenance = 'St. Sergius (General)';
          }
        }
      }

      if (apostStichera.length > 0 || apostGlory) {
        autoSlot.aposticha = {
          hymns: apostStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
        };

        const apost = calendarEntry.vespers.aposticha;
        const isGreatFeast = !!calendarEntry.liturgicalContext?.greatFeast;
        const hasOctoechosAposticha = apost.slots?.some(s => s.source === 'octoechos');

        if (hasOctoechosAposticha && !isGreatFeast) {
          // Weekday/Saturday: keep Octoechos aposticha, only overlay Menaion glory
          // (Octoechos provides the 3 base hymns; Menaion provides the Glory sticheron)
        } else {
          // Great feast or no Octoechos base: replace slots with Menaion stichera
          apost.slots = apostStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.aposticha.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
          }));
          // Add repeatPrevious placeholders only when fewer than 3 stichera are available
          while (apost.slots.length < 3) {
            apost.slots.push({ position: apost.slots.length + 1, repeatPrevious: true });
          }
        }

        if (apostGlory) {
          apost.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.glory`, tone: apostGlory.tone, label: primary.title, combinesGloryNow: isGreatFeast };
          // Weekday: Octoechos theotokion already set as `now` in calendar entry
          // Saturday: set Octoechos theotokion explicitly
          if (isSaturdayInjection && !isGreatFeast) {
            apost.now = { source: 'octoechos', key: `tone${calendarEntry.liturgicalContext.tone}.saturday.vespers.aposticha.theotokion`, tone: calendarEntry.liturgicalContext.tone, label: 'Theotokion' };
          }
          autoSlot.aposticha.glory = { text: apostGlory.text, tone: apostGlory.tone, label: apostGlory.label };
        }
        // If no doxastichon, keep the existing combinesGloryNow theotokion from calendar entry
      }

      // ── Inject Litya stichera from DB (great feast and vigil services) ────
      if (calendarEntry.vespers?.litya) {
        const lityaStichera = sticheraData?.[0]?.stichera.filter(
          s => s.section === 'litya' && s.order >= 1
        ) ?? [];
        const lityaGlory = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === 0
        ) ?? null;
        const lityaNow = sticheraData?.[0]?.stichera.find(
          s => s.section === 'litya' && s.order === -1
        ) ?? null;

        if (lityaStichera.length > 0) {
          const litya = calendarEntry.vespers.litya;
          litya.slots = lityaStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.litya.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
          }));

          autoSlot.litya = {
            hymns: lityaStichera.map(s => ({ text: s.text, tone: s.tone, label: s.label })),
          };

          if (lityaGlory) {
            litya.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.glory`, tone: lityaGlory.tone, label: primary.title };
            autoSlot.litya.glory = { text: lityaGlory.text, tone: lityaGlory.tone, label: lityaGlory.label };
          }
          if (lityaNow) {
            litya.now = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.litya.now`, tone: lityaNow.tone, label: primary.title };
            autoSlot.litya.now = { text: lityaNow.text, tone: lityaNow.tone, label: lityaNow.label };
          }
        }
      }

      menaionOverride = { ...sources.menaion, auto: { [date]: autoSlot } };

      const slots    = calendarEntry.vespers.troparia.slots;
      const nowIdx   = slots.findIndex(s => s.position === 'now');
      const insertAt = nowIdx !== -1 ? nowIdx : slots.length;
      slots.splice(insertAt, 0, {
        position: 'glory',
        source:   'menaion', provenance: menaionProvenance,
        key:      `auto.${date}.troparion`,
        tone:     troparion.tone,
        label:    primary.title,
      });

      // Populate all notable saints (those with troparia, in OCA priority order)
      calendarEntry.commemorations = (ranked?.notable ?? [{ ...primary }]).map(c => ({
        title:        c.title,
        tone:         c.troparia.find(t => t.type === 'troparion')?.tone ?? c.tone,
        isPrincipal:  c.id === primary.id,
        hasStichera:  c.hasStichera,
      }));
    }
  }

  // Build Vespers dismissal spec if not already present
  if (!calendarEntry.vespers.dismissal) {
    const dow = calendarEntry.dayOfWeek;
    const feastKey = calendarEntry.liturgicalContext?.greatFeast;
    // Saturday Great Vespers begins the Sunday celebration → resurrectional dismissal
    const isSundayVespers = dow === 'sunday' ||
      (dow === 'saturday' && isGreatVespers && !feastKey);
    calendarEntry.vespers.dismissal = {
      opening: feastKey ? 'feast' : (isSundayVespers ? 'sunday' : 'weekday'),
      feastLabel: feastKey || null,
      dayPatron: DAY_PATRONS[dow] || null,
      saints: (calendarEntry.commemorations || []).slice(0, 3).map(c => c.title),
    };
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, vespersFixed, reqSources);

  if (pronoun === 'yy') {
    for (const block of blocks) {
      if (block.text) block.text = applyYouYour(block.text);
      if (block.label) block.label = applyYouYour(block.label);
    }
  }

  const svcType = calendarEntry.vespers?.serviceType;
  const svcKey  = calendarEntry.vespers?.serviceKey;
  const serviceTitle = svcKey === 'burialVespers'
    ? 'Burial Vespers'
    : svcType === 'dailyVespers'
      ? 'Daily Vespers'
      : svcType === 'all-night-vigil'
        ? 'All-Night Vigil \u2014 Great Vespers'
        : 'Great Vespers';
  const tone = calendarEntry.vespers?.lordICall?.tone ?? calendarEntry.liturgicalContext?.tone ?? null;

  return { blocks, calendarEntry, serviceTitle, tone };
}

// ─── Pronoun substitution (Thee/Thy → You/Your) ───────────────────────────────

const YOU_YOUR_RULES = [
  // Predicate-nominative Thine first (before general Thine → Your)
  [/\bThine(?=\s+is\b)/g,       'Yours'],
  [/\bthine(?=\s+is\b)/g,       'yours'],
  // Pronouns
  [/\bThou\b/g,    'You'],     [/\bthou\b/g,    'you'],
  [/\bThee\b/g,    'You'],     [/\bthee\b/g,    'you'],
  [/\bThy\b/g,     'Your'],    [/\bthy\b/g,     'your'],
  [/\bThine\b/g,   'Your'],    [/\bthine\b/g,   'your'],
  [/\bThyself\b/g, 'Yourself'],[/\bthyself\b/g, 'yourself'],
  // Irregular verb forms
  [/\bArt\b/g,      'Are'],    [/\bart\b/g,      'are'],
  [/\bHast\b/g,     'Have'],   [/\bhast\b/g,     'have'],
  [/\bDost\b/g,     'Do'],     [/\bdost\b/g,     'do'],
  [/\bWilt\b/g,     'Will'],   [/\bwilt\b/g,     'will'],
  [/\bWast\b/g,     'Were'],   [/\bwast\b/g,     'were'],
  [/\bDidst\b/g,    'Did'],    [/\bdidst\b/g,    'did'],
  [/\bHadst\b/g,    'Had'],    [/\bhadst\b/g,    'had'],
  [/\bShouldst\b/g, 'Should'], [/\bshouldst\b/g, 'should'],
  [/\bWouldst\b/g,  'Would'],  [/\bwouldst\b/g,  'would'],
  [/\bCouldst\b/g,  'Could'],  [/\bcouldst\b/g,  'could'],
  // -est verbs requiring -e restoration on the stem
  [/\bGavest\b/g,   'Gave'],   [/\bgavest\b/g,   'gave'],
  [/\bGivest\b/g,   'Give'],   [/\bgivest\b/g,   'give'],
  [/\bHidest\b/g,   'Hide'],   [/\bhidest\b/g,   'hide'],
  [/\bLovest\b/g,   'Love'],   [/\blovest\b/g,   'love'],
  [/\bMakest\b/g,   'Make'],   [/\bmakest\b/g,   'make'],
  [/\bRidest\b/g,   'Ride'],   [/\bridest\b/g,   'ride'],
  [/\bTakest\b/g,   'Take'],   [/\btakest\b/g,   'take'],
  // -est verbs where stripping -est gives the correct stem
  [/\bBeholdest\b/g, 'Behold'],  [/\bbeholdest\b/g, 'behold'],
  [/\bCallest\b/g,   'Call'],    [/\bcallest\b/g,   'call'],
  [/\bCoverest\b/g,  'Cover'],   [/\bcoverest\b/g,  'cover'],
  [/\bDwellest\b/g,  'Dwell'],   [/\bdwellest\b/g,  'dwell'],
  [/\bFillest\b/g,   'Fill'],    [/\bfillest\b/g,   'fill'],
  [/\bHearest\b/g,   'Hear'],    [/\bhearest\b/g,   'hear'],
  [/\bHoldest\b/g,   'Hold'],    [/\bholdest\b/g,   'hold'],
  [/\bKeepest\b/g,   'Keep'],    [/\bkeepest\b/g,   'keep'],
  [/\bKnowest\b/g,   'Know'],    [/\bknowest\b/g,   'know'],
  [/\bLeadest\b/g,   'Lead'],    [/\bleadest\b/g,   'lead'],
  [/\bLettest\b/g,   'Let'],     [/\blettest\b/g,   'let'],
  [/\bOpenest\b/g,   'Open'],    [/\bopenest\b/g,   'open'],
  [/\bRemainest\b/g, 'Remain'],  [/\bremainist\b/g, 'remain'],
  [/\bRenewest\b/g,  'Renew'],   [/\brenewest\b/g,  'renew'],
  [/\bSendest\b/g,   'Send'],    [/\bsendest\b/g,   'send'],
  [/\bSeekest\b/g,   'Seek'],    [/\bseekest\b/g,   'seek'],
  [/\bSeest\b/g,     'See'],     [/\bseest\b/g,     'see'],
  [/\bSpeakest\b/g,  'Speak'],   [/\bspeakest\b/g,  'speak'],
  [/\bTeachest\b/g,  'Teach'],   [/\bteachest\b/g,  'teach'],
  [/\bTurnest\b/g,   'Turn'],    [/\bturnest\b/g,   'turn'],
  [/\bWalkest\b/g,   'Walk'],    [/\bwalkest\b/g,   'walk'],
  [/\bWaterest\b/g,  'Water'],   [/\bwaterest\b/g,  'water'],
  [/\bWeepest\b/g,   'Weep'],    [/\bweepest\b/g,   'weep'],
];

function applyYouYour(text) {
  for (const [re, rep] of YOU_YOUR_RULES) text = text.replace(re, rep);
  return text;
}

// ─── getDayLabel helper ───────────────────────────────────────────────────────

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];

function getDayLabel(entry, dow, season, date) {
  // Great Feasts override every season's default label.
  if (date) {
    const d = date instanceof Date ? date : new Date(date + 'T12:00:00Z');
    const feastKey = getGreatFeastKey(d);
    if (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.label) {
      return GREAT_FEAST_VARIANTS[feastKey].label;
    }
  }
  if (season === 'greatLent') {
    if (dow === 'saturday') {
      const note = entry._meta?.note || '';
      // Soul Saturdays
      const soulMatch = note.match(/Soul Saturday (\d)/);
      if (soulMatch) return `Soul Saturday ${soulMatch[1]}`;
      // Lazarus Saturday
      if (/Lazarus/.test(note)) return 'Lazarus Saturday';
      // Numbered Saturdays
      const satNum = entry.liturgicalContext?.weekOfLent || entry.liturgicalContext?.specialDayIndex;
      if (satNum) return `${ORDINALS[satNum] || satNum + 'th'} Saturday of Great Lent`;
      return null;
    }
    if (dow === 'sunday') {
      const wk = entry.liturgicalContext?.weekOfLent;
      return LITURGICAL_DAY_LABELS.lentenSundays[wk] || null;
    }
    // Weekday
    const wk  = entry.liturgicalContext?.weekOfLent;
    const cap = dow.charAt(0).toUpperCase() + dow.slice(1);
    if (wk) return `${cap}, ${ORDINALS[wk] || wk + 'th'} Week of Great Lent`;
    return null;
  }

  if (season === 'preLenten') {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.preLentenSundays[key] || null;
  }

  if (season === 'holyWeek') {
    return LITURGICAL_DAY_LABELS.holyWeek[dow] || null;
  }

  if (season === 'brightWeek') {
    return LITURGICAL_DAY_LABELS.brightWeek[dow] || null;
  }

  if (season === 'pentecostarion') {
    const noteMatch = entry._meta?.note?.match(/keyed by '([^']+)'/);
    const key = noteMatch ? noteMatch[1] : null;
    return LITURGICAL_DAY_LABELS.pentecostarionFeasts[key] || null;
  }

  return null;
}

// ─── Dashboard data builder ──────────────────────────────────────────────────

/**
 * Builds coverage data for every day in the given year.
 * Returns an array of { date, season, tone, feast, hasService, score, primarySource, layers, services }.
 *
 * score: 0–1 composite coverage (calendar entry, octoechos, prokeimena, troparia, stichera)
 * primarySource: 'oca' | 'stSergius' | 'generic' | 'mixed' | null
 * layers: { calendarEntry, octoechos, prokeimena, troparia, stichera, aposticha, triodion }
 *         each: { present: bool, source: string|null }
 */
function buildDashboardData(year) {
  const DAY_MS_LOCAL = 24 * 60 * 60 * 1000;
  const jan1  = new Date(Date.UTC(year, 0, 1));
  const dec31 = new Date(Date.UTC(year, 11, 31));

  // Batch-load Menaion DB data for the whole year
  let tropariaCounts = {};  // "MM-DD" → count
  let sticheraCounts = {};  // "MM-DD" → { count, sources }
  let generalMenaionTypes = {};  // "MM-DD" → saint_type if any
  try {
    const db = openDb();
    if (db) {
      // Count troparia per day
      const tropRows = db.prepare(`
        SELECT c.month, c.day, COUNT(DISTINCT t.commemoration_id) AS cnt
        FROM troparia t JOIN commemorations c ON c.id = t.commemoration_id
        WHERE t.type = 'troparion'
        GROUP BY c.month, c.day
      `).all();
      for (const r of tropRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        tropariaCounts[key] = r.cnt;
      }

      // Count stichera per day with source info and section breakdown
      const stichRows = db.prepare(`
        SELECT c.month, c.day, COUNT(*) AS cnt,
               GROUP_CONCAT(DISTINCT s.source) AS sources,
               GROUP_CONCAT(DISTINCT s.section) AS sections
        FROM stichera s JOIN commemorations c ON c.id = s.commemoration_id
        GROUP BY c.month, c.day
      `).all();
      for (const r of stichRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        sticheraCounts[key] = { count: r.cnt, sources: r.sources || '', sections: r.sections || '' };
      }

      // Get saint_type for primary commemoration per day (for general menaion fallback detection)
      const gmRows = db.prepare(`
        SELECT month, day, saint_type FROM commemorations
        WHERE saint_type IS NOT NULL
        ORDER BY id
      `).all();
      for (const r of gmRows) {
        const key = `${String(r.month).padStart(2,'0')}-${String(r.day).padStart(2,'0')}`;
        if (!generalMenaionTypes[key]) generalMenaionTypes[key] = r.saint_type;
      }

      db.close();
    }
  } catch (err) {
    console.error('Dashboard DB query error:', err.message);
  }

  // Check which saint types have general menaion entries
  let gmAvailableTypes = new Set();
  try {
    const db = openDb();
    if (db) {
      const gmTypes = db.prepare(`SELECT DISTINCT saint_type FROM general_menaion`).all();
      for (const r of gmTypes) gmAvailableTypes.add(r.saint_type);
      // Add fallback mappings
      for (const [plural, singular] of Object.entries(GENERAL_MENAION_FALLBACK)) {
        if (gmAvailableTypes.has(singular)) gmAvailableTypes.add(plural);
      }
      db.close();
    }
  } catch (_) {}

  const result = [];
  let cur = new Date(jan1);

  while (cur <= dec31) {
    const dateStr = cur.toISOString().slice(0, 10);
    const [, mm, dd] = dateStr.split('-');
    const dayKey = `${mm}-${dd}`;
    const dowIdx = cur.getUTCDay();
    const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

    // Get calendar entry (cheap)
    const entry = getCalendarEntry(dateStr);
    const season = entry ? (entry.liturgicalContext?.season || null) : getLiturgicalSeason(cur);
    const tone = entry ? (entry.liturgicalContext?.tone ?? null) : null;

    const hasService = !!entry;
    const services = {
      greatVespers: entry?.vespers?.serviceType === 'greatVespers' && !entry?.vespers?.serviceKey,
      dailyVespers: entry?.vespers?.serviceType === 'dailyVespers',
      allNightVigil: entry?.vespers?.serviceType === 'all-night-vigil',
      burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
      lamentations: isLamentationsDay(cur),
      vesperalLiturgy: isVesperalLiturgyDay(cur),
      royalHours: isRoyalHoursDay(cur),
      matins: !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur), sources),
      liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
      passionGospels: isPassionGospelsDay(cur),
      presanctified: isPresanctifiedDay(cur),
      paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
      paschaCollection: (() => {
        const p = calculatePascha(cur.getUTCFullYear());
        return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
      })(),
    };

    // Feast name from Menaion DB
    let feast = null;
    try {
      const dayList = getMenaionDayList(parseInt(mm), parseInt(dd));
      if (dayList) feast = dayList.principal;
    } catch (_) {}

    // Coverage layers
    const hasTroparia  = !!tropariaCounts[dayKey];
    const stichInfo    = sticheraCounts[dayKey];
    const hasStichera  = !!stichInfo;
    const saintType    = generalMenaionTypes[dayKey];
    const hasGmFallback = saintType && gmAvailableTypes.has(saintType) && !hasStichera;

    // Determine sources used
    const sourcesUsed = new Set();
    if (hasStichera && stichInfo.sources) {
      for (const s of stichInfo.sources.split(',')) {
        if (s === 'oca-menaion') sourcesUsed.add('oca');
        else if (s.startsWith('stSergius')) sourcesUsed.add('stSergius');
        else if (s) sourcesUsed.add(s);
      }
    }
    if (hasGmFallback) sourcesUsed.add('generic');

    // Determine Octoechos presence (relevant for Saturday Great Vespers / Friday)
    const needsOctoechos = dowStr === 'saturday' || dowStr === 'friday';
    const hasOctoechos = hasService && needsOctoechos;
    // Prokeimena always available from JSON
    const hasProkeimena = hasService;
    // Triodion check — relevant for Lenten season
    const lentenSeasons = ['greatLent', 'preLenten', 'holyWeek', 'brightWeek', 'pentecostarion'];
    const needsTriodion = lentenSeasons.includes(season);
    const hasTriodion = needsTriodion ? (entry?.vespers?.lordICall?.slots?.some(s => s.source === 'db' || s.source === 'triodion') || false) : true;

    // Composite score — contextual weights based on what the service actually needs
    let score = 0;
    if (hasService) {
      // Saturdays: full 6-layer scoring; weekdays: skip octoechos weight and redistribute
      const isSat = needsOctoechos;
      const weights = isSat
        ? { calendar: 0.15, octoechos: 0.2, prokeimena: 0.1, troparia: 0.2, stichera: 0.25, triodion: 0.1 }
        : { calendar: 0.15, prokeimena: 0.1, troparia: 0.3, stichera: 0.35, triodion: 0.1 };
      score += weights.calendar; // always have calendar entry if hasService
      if (isSat && hasOctoechos) score += weights.octoechos;
      if (hasProkeimena) score += weights.prokeimena;
      if (hasTroparia)   score += weights.troparia;
      if (hasStichera || hasGmFallback) score += weights.stichera;
      if (hasTriodion)   score += weights.triodion;
    }

    // Liturgy content score — the liturgy is dynamically built from orthocal + Menaion DB,
    // so any day with liturgy served gets a base score; troparia/kontakia add more.
    const liturgyServed = services.liturgy;
    let liturgyScore = 0;
    if (liturgyServed) {
      liturgyScore = 0.5;                        // base: fixed texts + orthocal readings
      if (hasTroparia) liturgyScore += 0.25;     // saint troparia/kontakia from Menaion DB
      if (dowStr === 'sunday') liturgyScore += 0.25; // resurrectional content from Octoechos
      else if (hasTroparia) liturgyScore += 0.25; // weekday: troparia are the main variable
      liturgyScore = Math.min(liturgyScore, 1.0);
    }

    // Primary source
    let primarySource = null;
    if (sourcesUsed.size > 1) primarySource = 'mixed';
    else if (sourcesUsed.has('oca')) primarySource = 'oca';
    else if (sourcesUsed.has('stSergius')) primarySource = 'stSergius';
    else if (sourcesUsed.has('generic')) primarySource = 'generic';
    else if (hasService && hasTroparia) primarySource = 'oca'; // troparia from OCA scraper

    const layers = {};
    if (hasService) {
      layers.calendarEntry = { present: true, source: entry?._meta?.generated ? 'auto-generated' : 'hand-authored' };
      layers.octoechos     = { present: hasOctoechos, source: hasOctoechos ? 'OCA Obikhod' : null };
      layers.prokeimena    = { present: hasProkeimena, source: 'prokeimena.json' };
      layers.troparia      = { present: hasTroparia, source: hasTroparia ? 'OCA Menaion' : null };
      layers.stichera      = { present: hasStichera, source: hasStichera ? formatSticheraSource(stichInfo.sources) : (hasGmFallback ? 'General Menaion' : null) };
      if (hasGmFallback && !hasStichera) {
        layers.stichera.present = true;
        layers.stichera.source = 'General Menaion (fallback)';
      }
      layers.aposticha     = { present: hasStichera && stichInfo.sections?.includes('aposticha'), source: hasStichera && stichInfo.sections?.includes('aposticha') ? formatSticheraSource(stichInfo.sources) : null };
      if (needsTriodion) {
        layers.triodion = { present: hasTriodion, source: hasTriodion ? 'triodion JSON' : null };
      }
    }

    result.push({
      date: dateStr,
      dayOfWeek: dowStr,
      season,
      tone,
      feast,
      hasService,
      score: Math.round(score * 100) / 100,
      liturgyScore,
      primarySource,
      layers,
      services,
    });

    cur = new Date(cur.getTime() + DAY_MS_LOCAL);
  }

  return result;
}

function formatSticheraSource(sourcesStr) {
  if (!sourcesStr) return null;
  const parts = sourcesStr.split(',');
  const labels = parts.map(s => {
    if (s === 'oca-menaion') return 'OCA';
    if (s.startsWith('stSergius')) return 'St. Sergius';
    return s;
  });
  return [...new Set(labels)].join(' + ');
}

// ─── Request handler ──────────────────────────────────────────────────────────

// Pre-load sources once at startup
// (DAY_PATRONS now lives in daily-propers.json, loaded at module top.)

let sources;
try {
  sources = loadSources();
  console.log('Sources loaded: octoechos, prokeimena, menaion, triodion');
} catch (err) {
  console.error('Failed to load sources:', err.message);
  process.exit(1);
}

let fixedTexts;
try {
  fixedTexts = loadJSON('fixed-texts/vespers-fixed.json');
  registerBaseFixed('vespers', fixedTexts);
  console.log('Fixed texts loaded.');
} catch (err) {
  console.error('Failed to load fixed texts:', err.message);
  process.exit(1);
}

let liturgyFixed;
try {
  liturgyFixed = loadJSON('fixed-texts/liturgy-fixed.json');
  registerBaseFixed('liturgy', liturgyFixed);
  console.log('Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load liturgy fixed texts:', err.message);
  process.exit(1);
}

let presanctifiedFixed;
try {
  presanctifiedFixed = loadJSON('fixed-texts/presanctified-fixed.json');
  registerBaseFixed('presanctified', presanctifiedFixed);
  console.log('Presanctified fixed texts loaded.');
} catch (err) {
  console.error('Failed to load presanctified fixed texts:', err.message);
  process.exit(1);
}

// Defer translation validation until AFTER all base fixed-text files have
// registered, so drift warnings have a base to check against.
validateAllTranslations();

let paschalHoursFixed;
try {
  paschalHoursFixed = loadJSON('fixed-texts/paschal-hours-fixed.json');
  console.log('Paschal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Hours fixed texts:', err.message);
  process.exit(1);
}

let midnightOfficeFixed;
try {
  midnightOfficeFixed = loadJSON('fixed-texts/midnight-office-fixed.json');
  console.log('Midnight Office fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Midnight Office fixed texts:', err.message);
  process.exit(1);
}

let paschalMatinsFixed;
try {
  paschalMatinsFixed = loadJSON('fixed-texts/paschal-matins-fixed.json');
  console.log('Paschal Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Paschal Matins fixed texts:', err.message);
  process.exit(1);
}

let passionGospelsFixed;
try {
  passionGospelsFixed = loadJSON('fixed-texts/passion-gospels-fixed.json');
  console.log('Passion Gospels fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Passion Gospels fixed texts:', err.message);
  process.exit(1);
}

let bridegroomMatinsFixed;
try {
  bridegroomMatinsFixed = loadJSON('fixed-texts/bridegroom-matins-fixed.json');
  console.log('Bridegroom Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Bridegroom Matins fixed texts:', err.message);
  process.exit(1);
}

let lamentationsFixed;
try {
  lamentationsFixed = loadJSON('fixed-texts/lamentations-fixed.json');
  console.log('Lamentations fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Lamentations fixed texts:', err.message);
  process.exit(1);
}

let vesperalLiturgyFixed;
try {
  vesperalLiturgyFixed = loadJSON('fixed-texts/vesperal-liturgy-fixed.json');
  console.log('Vesperal Liturgy fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Vesperal Liturgy fixed texts:', err.message);
  process.exit(1);
}

let kneelingVespersFixed;
try {
  kneelingVespersFixed = loadJSON('fixed-texts/kneeling-vespers-fixed.json');
  registerBaseFixed('kneeling-vespers', kneelingVespersFixed);
  console.log('Kneeling Vespers fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Kneeling Vespers fixed texts:', err.message);
  process.exit(1);
}

let royalHoursFixed;
try {
  royalHoursFixed = loadJSON('fixed-texts/royal-hours-fixed.json');
  console.log('Royal Hours fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Royal Hours fixed texts:', err.message);
  process.exit(1);
}

let matinsFixed;
try {
  matinsFixed = loadJSON('fixed-texts/matins-fixed.json');
  console.log('Matins fixed texts loaded.');
} catch (err) {
  console.error('Failed to load Matins fixed texts:', err.message);
  process.exit(1);
}

ensureOrthocalCacheTable();

function handleRequest(req, res) {
  const url      = req.url || '/';
  const pathname = url.split('?')[0];

  try {
    if (pathname === '/') {
      serveStatic(res, path.join(__dirname, 'public', 'index.html'), 'text/html');

    } else if (pathname === '/favicon.svg') {
      serveStatic(res, path.join(__dirname, 'public', 'favicon.svg'), 'image/svg+xml');

    } else if (pathname.startsWith('/styles/') || pathname.startsWith('/scripts/')) {
      const filePath = path.join(__dirname, 'public', pathname);
      const ext = path.extname(filePath);
      const ct = ext === '.css' ? 'text/css' : ext === '.js' ? 'text/javascript' : 'text/plain';
      serveStatic(res, filePath, ct);

    } else if (pathname === '/api/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      // ── Vespers date-shift ─────────────────────────────────────────────────
      // Vespers is the first service of the next liturgical day.  The API date
      // represents the civil evening the service is served; the liturgical
      // content comes from the *next* calendar date.
      //
      // Exception: Burial Vespers (Holy Friday afternoon) uses the day's own
      // texts — it is NOT the evening vespers that begins the next day.
      const dayEntry = getCalendarEntry(date);
      const isBurialVespers = dayEntry?.vespers?.serviceKey === 'burialVespers';
      const vespersDate = isBurialVespers ? date : getNextDateStr(date);

      // For Lenten weekday Vespers, enrich prokeimenon entries with pericopes from orthocal API.
      // For vigil-rank Sundays with OT prophecies (e.g. Holy Fathers), enrich
      // otReadings with full scripture text from orthocal.
      let entryOverride = null;
      try {
        const baseEntry = getCalendarEntry(vespersDate);
        if (baseEntry?.vespers?.otReadings?.length > 0) {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          const enrichedReadings = baseEntry.vespers.otReadings.map((r, i) => {
            const match = vesperReadings[i];
            if (match?.passage?.length) {
              const text = match.passage.map(p => p.content).join(' ');
              return { ...r, text };
            }
            return r;
          });
          entryOverride = {
            ...baseEntry,
            vespers: { ...baseEntry.vespers, otReadings: enrichedReadings },
          };
        }
        if (baseEntry?.liturgicalContext?.season === 'greatLent' &&
            baseEntry?.vespers?.serviceType === 'dailyVespers') {
          const orthocalData = await fetchOrthocalDay(vespersDate);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0) {
            // Deep-clone just the prokeimenon entries so we don't mutate the shared calendar entry
            const entries = (baseEntry.vespers?.prokeimenon?.entries || []).map(e => {
              // API returns book:"OT" for all Vespers readings; match by book name in display field
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                // Extract pericope from display (e.g. "Genesis 10.32-11.9" → "10:32–11:9")
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                // Normalize: first dot between digits becomes colon, subsequent dot becomes em-dash start
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            entryOverride = {
              ...baseEntry,
              vespers: {
                ...baseEntry.vespers,
                prokeimenon: { ...baseEntry.vespers.prokeimenon, entries },
              },
            };
          }
        }
      } catch (err) {
        console.warn('Orthocal pericope fetch failed (non-fatal):', err.message);
      }

      const translation = resolveTranslation(q);
      const vespersFixedResolved = translation
        ? (getOverlayFixed('vespers', translation) || fixedTexts)
        : fixedTexts;

      let result;
      try {
        result = assembleForDate(vespersDate, pronoun, entryOverride, vespersFixedResolved);
      } catch (err) {
        console.error('assembleForDate error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (!result) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No service available for this date.', date }));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = result;
      const season = calendarEntry.liturgicalContext?.season || null;
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);

      // Use calendar entry commemorations if present; otherwise fall back to Menaion DB
      let commemorations = calendarEntry.commemorations || [];
      if (commemorations.length === 0) {
        const [, mm, dd] = vespersDate.split('-').map(Number);
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) {
          commemorations = dayList.commemorations.map((title, i) => ({
            title,
            isPrincipal: i === 0,
            tone: null,
            hasStichera: false,
          }));
        }
      }

      // Relabel 'db' source to the actual liturgical book for dev-mode display
      const dbSourceLabel = season === 'pentecostarion' ? 'pentecostarion'
        : season === 'brightWeek' ? 'pentecostarion'
        : (season === 'greatLent' || season === 'holyWeek' || season === 'preLenten') ? 'triodion'
        : 'db';
      for (const b of blocks) {
        if (b.source === 'db') b.source = dbSourceLabel;
        if (!b.provenance) b.provenance = 'OCA';
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, serviceTitle, `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        vespersDate,
        serviceType:      calendarEntry.vespers?.serviceType || 'greatVespers',
        serviceName:      serviceTitle,
        tone,
        season,
        liturgicalLabel,
        commemorations,
        blocks,
      }));
      })().catch(err => {
        console.error('/api/service async error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/education-modules') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load education modules.' }));
      }

    } else if (pathname === '/api/education-modules-vespers') {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'variable-sources', 'education-modules-vespers.json'), 'utf8'));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to load vespers education modules.' }));
      }

    } else if (pathname === '/api/translations') {
      // Lists every available translation overlay with its manifest summary.
      // Front-end uses this to build the settings-panel picker.
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        default: process.env.LITURGY_TRANSLATION || null,
        translations: getTranslationManifests(),
      }));

    } else if (pathname.startsWith('/api/translations/') && pathname.endsWith('/diff')) {
      // Returns the merged-vs-base diff for an overlay. Useful for confirming
      // overrides took effect and (during STS population) for cataloguing
      // which keys an overlay touches.
      // Path: /api/translations/<id>/diff?service=liturgy
      const id = pathname.slice('/api/translations/'.length, -'/diff'.length);
      const q = parseQuery(url);
      const service = (q.service || 'liturgy').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');
      if (!fixedTextRegistry[service]) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown service '${service}'. Available: ${Object.keys(fixedTextRegistry).join(', ')}` }));
        return;
      }
      const diffs = diffOverlay(service, id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        overlay: id,
        service,
        count: diffs.length,
        diffs,
      }));

    } else if (pathname === '/api/liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isLiturgyServed(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No Divine Liturgy is served on this date.', date }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No liturgy available for this date.', date }));
          return;
        }

        if (!calendarEntry.liturgy) {
          try {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          } catch (err) {
            console.error(`Orthocal API error for ${date}:`, err.message);
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Liturgy data unavailable for this date.', date }));
            return;
          }
        }

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getLiturgyFixed(translation);

        let blocks;
        try {
          blocks = assembleLiturgy(calendarEntry, liturgyFixedResolved, sources,
            { rubrics: getOverlayRubrics(translation) });
        } catch (err) {
          console.error('assembleLiturgy error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks whose text came from the active overlay (must happen
        // BEFORE pronoun substitution, which would change the strings and
        // defeat the match).
        tagBlocksWithOverlay(blocks, 'liturgy', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        let commemorations  = calendarEntry.commemorations || [];
        if (commemorations.length === 0) {
          const [, mm, dd] = date.split('-').map(Number);
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            commemorations = dayList.commemorations.map((title, i) => ({
              title,
              isPrincipal: i === 0,
              tone: null,
              hasStichera: false,
            }));
          }
        }

        const variantName = calendarEntry.liturgy.variant === 'basil'
          ? 'Liturgy of St. Basil the Great'
          : 'Liturgy of St. John Chrysostom';
        const serviceName = `Divine Liturgy — ${variantName}`;

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, serviceName, `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'liturgy',
          serviceName,
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Liturgy route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/presanctified') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      {
        const d = new Date(date + 'T12:00:00Z');
        if (!isPresanctifiedDay(d)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: 'The Liturgy of the Presanctified Gifts is not served on this date.',
            date,
          }));
          return;
        }
      }

      (async () => {
        let calendarEntry = getCalendarEntry(date);
        if (!calendarEntry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No calendar entry for this date.', date }));
          return;
        }

        // Enrich prokeimenon entries with pericopes from orthocal API
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const vesperReadings = (orthocalData.readings || []).filter(r => r.source === 'Vespers');
          if (vesperReadings.length > 0 && calendarEntry.vespers?.prokeimenon?.entries) {
            const entries = calendarEntry.vespers.prokeimenon.entries.map(e => {
              const match = vesperReadings.find(r =>
                r.display && e.reading?.book &&
                r.display.toLowerCase().startsWith(e.reading.book.toLowerCase())
              );
              if (match && match.display) {
                const raw = match.display.replace(/^[A-Za-z ]+/, '').trim();
                const pericope = raw.replace(/(\d+)\.(\d+)-(\d+)\.(\d+)/, '$1:$2–$3:$4')
                                    .replace(/(\d+)\.(\d+)/, '$1:$2');
                return { ...e, reading: { ...e.reading, pericope } };
              }
              return e;
            });
            calendarEntry = {
              ...calendarEntry,
              vespers: {
                ...calendarEntry.vespers,
                prokeimenon: { ...calendarEntry.vespers.prokeimenon, entries },
              },
            };
          }
        } catch (err) {
          console.warn('Presanctified: orthocal pericope fetch failed (non-fatal):', err.message);
        }

        // Inject DB-sourced variable texts
        const dbSource = buildDbSource(date, pronoun);
        const assemblerSources = { ...sources, db: dbSource };

        const translation = resolveTranslation(q);
        const liturgyFixedResolved = getOverlayFixed('liturgy', translation);
        const presanctifiedFixedResolved = getOverlayFixed('presanctified', translation);

        let blocks;
        try {
          blocks = assemblePresanctified(calendarEntry, fixedTexts, liturgyFixedResolved, presanctifiedFixedResolved, assemblerSources);
        } catch (err) {
          console.error('assemblePresanctified error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }

        // Tag blocks from overlay overrides (both liturgy and presanctified
        // bases, since Presanctified borrows from both). Must run before
        // pronoun substitution.
        tagBlocksWithOverlay(blocks, 'liturgy', translation);
        tagBlocksWithOverlay(blocks, 'presanctified', translation);

        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }

        const season = calendarEntry.liturgicalContext?.season || null;
        const tone   = calendarEntry.liturgicalContext?.tone ?? null;
        const dow    = calendarEntry.dayOfWeek || null;
        const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date);
        const commemorations  = calendarEntry.commemorations || [];

        // Relabel 'db' source
        for (const b of blocks) {
          if (b.source === 'db') b.source = 'triodion';
          if (!b.provenance) b.provenance = 'OCA';
        }

        if (format === 'html') {
          const toneLabel = tone ? ` · Tone ${tone}` : '';
          renderServiceHTML(res, blocks, 'Liturgy of the Presanctified Gifts', `${formatDate(date)}${toneLabel}`, pronoun);
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType:    'presanctified',
          serviceName:    'Liturgy of the Presanctified Gifts',
          tone,
          season,
          liturgicalLabel,
          commemorations,
          translation: translation || null,
          blocks,
        }));
      })().catch(err => {
        console.error('Presanctified route error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error.' }));
        }
      });

    } else if (pathname === '/api/bridegroom-matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isBridegroomMatins(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Bridegroom Matins is only served on the evenings of Palm Sunday through Holy Wednesday.',
          date,
        }));
        return;
      }

      // API date = civil evening; content from NEXT liturgical day
      const nextDay = new Date(d);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const night = getDayOfWeek(nextDay);  // monday, tuesday, wednesday, or thursday
      const NIGHT_NAMES = LITURGICAL_DAY_LABELS.bridegroomMatinsNights;

      let blocks;
      try {
        blocks = assembleBridegroomMatins(bridegroomMatinsFixed, night);
      } catch (err) {
        console.error('assembleBridegroomMatins error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Bridegroom Matins', `${formatDate(date)} · ${NIGHT_NAMES[night] || 'Holy Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'bridegroom-matins',
        serviceName:    'Bridegroom Matins',
        season:         'holyWeek',
        liturgicalLabel: NIGHT_NAMES[night] || 'Holy Week',
        blocks,
      }));

    } else if (pathname === '/api/matins') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      (async () => {
      const d      = new Date(date + 'T12:00:00Z');
      const dow    = getDayOfWeek(d);
      const season = getLiturgicalSeason(d);
      const tone   = getTone(d);

      // ── Bright Week: Matins = Paschal Matins (Pascha through Bright Saturday) ──
      if (season === 'brightWeek') {
        let blocks;
        try {
          blocks = assemblePaschalMatins(paschalMatinsFixed);
        } catch (err) {
          console.error('assemblePaschalMatins error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
          return;
        }
        if (pronoun === 'yy') {
          for (const block of blocks) {
            if (block.text)  block.text  = applyYouYour(block.text);
            if (block.label) block.label = applyYouYour(block.label);
          }
        }
        if (format === 'html') {
          renderServiceHTML(res, blocks, 'Paschal Matins', formatDate(date), pronoun);
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          date,
          serviceType: 'matins',
          serviceName: 'Paschal Matins',
          season,
          blocks,
        }));
        return;
      }

      // Build the matins spec from available data
      const matinsSpec = buildMatinsSpec(date, d, dow, season, tone, sources);

      // Enrich Matins Gospel with full scripture text from orthocal API
      if (matinsSpec?.gospel && !matinsSpec.gospel.text) {
        try {
          const orthocalData = await fetchOrthocalDay(date);
          const matinsReading = (orthocalData.readings || []).find(
            r => r.source && r.source.includes('Matins Gospel')
          );
          if (matinsReading?.passage?.length) {
            matinsSpec.gospel.text = matinsReading.passage.map(v => v.content).join('\n\n');
            matinsSpec.gospel._source = 'orthocal';
          }
        } catch (err) {
          console.warn('Matins gospel enrichment failed (non-fatal):', err.message);
        }
      }

      if (!matinsSpec) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'No Matins data available for this date. Currently supported: Sundays (all tones) and great feasts with menaion data.',
          date,
        }));
        return;
      }

      const calendarDay = {
        date,
        dayOfWeek: dow,
        liturgicalContext: { season, tone },
        matins: matinsSpec,
      };

      let blocks;
      try {
        blocks = assembleMatins(calendarDay, matinsFixed, fixedTexts, sources);
      } catch (err) {
        console.error('assembleMatins error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks, 'Matins (Orthros)', `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'matins',
        serviceName:    'Matins (Orthros)',
        tone,
        season,
        blocks,
      }));
      })();

    } else if (pathname === '/api/passion-gospels') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isPassionGospelsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Service of the Twelve Passion Gospels is only served on Great Thursday evening.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePassionGospels(passionGospelsFixed);
      } catch (err) {
        console.error('assemblePassionGospels error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Twelve Passion Gospels', `${formatDate(date)} · Great and Holy Thursday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'passion-gospels',
        serviceName:    'The Twelve Passion Gospels',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Thursday',
        blocks,
      }));

    } else if (pathname === '/api/royal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isRoyalHoursDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Royal Hours are only served on the morning of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleRoyalHours(royalHoursFixed);
      } catch (err) {
        console.error('assembleRoyalHours error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Royal Hours of Great Friday', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'royalHours',
        serviceName:    'Royal Hours of Great Friday',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/lamentations') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isLamentationsDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Lamentations service is only served on the evening of Great Friday.',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assembleLamentations(lamentationsFixed, fixedTexts);
      } catch (err) {
        console.error('assembleLamentations error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Lamentations', `${formatDate(date)} · Great and Holy Friday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'lamentations',
        serviceName:    'The Lamentations',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Friday',
        blocks,
      }));

    } else if (pathname === '/api/vesperal-liturgy') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      if (!isVesperalLiturgyDay(d)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Vesperal Liturgy of St. Basil is only served on Great Saturday morning.',
          date,
        }));
        return;
      }

      const translation = resolveTranslation(q);
      const liturgyFixedResolved = getLiturgyFixed(translation);

      let blocks;
      try {
        blocks = assembleVesperalLiturgy(vesperalLiturgyFixed, fixedTexts, liturgyFixedResolved);
      } catch (err) {
        console.error('assembleVesperalLiturgy error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'Vesperal Liturgy of St. Basil', `${formatDate(date)} · Great and Holy Saturday`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'vesperal-liturgy',
        serviceName:    'Vesperal Liturgy of St. Basil',
        season:         'holyWeek',
        liturgicalLabel: 'Great and Holy Saturday',
        blocks,
      }));

    } else if (pathname === '/api/kneeling-vespers') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      // Kneeling Vespers is served on the evening of Pentecost Sunday only
      // (Pascha + 49). It uses the same Pentecost vespers propers as the
      // Saturday-evening Vigil, with three sets of St. Basil's Kneeling
      // Prayers inserted at the prescribed points.
      const d = new Date(date + 'T00:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const DAY_MS = 24 * 60 * 60 * 1000;
      const daysSincePascha = Math.round((d - pascha) / DAY_MS);
      if (daysSincePascha !== 49) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'Kneeling Vespers is only served on Pentecost Sunday.',
          date,
        }));
        return;
      }

      // Assemble the Pentecost Sunday vespers content (same call as the
      // Saturday-evening Vigil, with the Pentecost-day liturgical entry).
      // OCA-strict Kneeling Vespers has no OT readings, so we do not enrich
      // them; the OT Readings section is stripped below along with the other
      // Vigil-only artifacts (Kathisma, Litya, Bread Blessing).
      (async () => {
      const entryOverride = null;

      let result;
      try {
        result = assembleForDate(date, pronoun, entryOverride);
      } catch (err) {
        console.error('assembleForDate (kneeling-vespers) error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
      if (!result) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to assemble Pentecost vespers content.' }));
        return;
      }

      const { blocks: baseBlocks, calendarEntry, tone } = result;

      // Relabel 'db' source for dev-mode display (mirrors /api/service)
      for (const b of baseBlocks) {
        if (b.source === 'db') b.source = 'pentecostarion';
        if (!b.provenance) b.provenance = 'OCA';
      }

      // ── Replace Lord-I-Call stichera with Kneeling-Vespers propers ─────
      // Saturday-eve Vigil LIC (Tone 1+2 idiomela + Tone 8 "Come, O people")
      // falls through; OCA Day-of-Holy-Spirit Vespers prescribes Tone 4
      // idiomela ("Today in the city of David…" etc., on 6 with each
      // repeated) + Tone 6 "O heavenly King" doxastichon.
      {
        const kvLic = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.lordICall;
        if (kvLic?.stichera?.length === 3) {
          const psalm129 = fixedTexts?.lordICall?.psalmVerses?.psalm129?.verses || [];
          const psalm116 = fixedTexts?.lordICall?.psalmVerses?.psalm116?.verses || [];
          const findVerse = (n) => {
            const v = [...psalm129, ...psalm116].find(x => x.number === n);
            return v ? v.text : '';
          };
          const verseTexts = [6, 5, 4, 3, 2, 1].map(findVerse);
          const pairs = [
            [verseTexts[0], kvLic.stichera[0], false],
            [verseTexts[1], kvLic.stichera[0], true],
            [verseTexts[2], kvLic.stichera[1], false],
            [verseTexts[3], kvLic.stichera[1], true],
            [verseTexts[4], kvLic.stichera[2], false],
            [verseTexts[5], kvLic.stichera[2], true],
          ];
          const licBlocks = [];
          pairs.forEach(([verseText, sticheron, isRepeat], i) => {
            const verseNum = 6 - i;
            licBlocks.push({
              id: `kv-lic-v${verseNum}`, section: 'Lord, I Have Cried',
              type: 'verse', speaker: 'reader',
              text: `V. (${verseNum}) ${verseText}`,
            });
            licBlocks.push({
              id: `kv-lic-s${i + 1}${isRepeat ? '-r' : ''}`, section: 'Lord, I Have Cried',
              type: 'hymn', speaker: 'choir', text: sticheron.text, tone: sticheron.tone,
              source: 'pentecostarion', label: sticheron.label || 'Idiomelon',
              provenance: 'OCA',
            });
          });
          licBlocks.push({
            id: 'kv-lic-glory', section: 'Lord, I Have Cried', type: 'doxology',
            speaker: null, text: 'Glory to the Father, and to the Son, and to the Holy Spirit, now and ever and unto ages of ages. Amen.',
          });
          licBlocks.push({
            id: 'kv-lic-dox', section: 'Lord, I Have Cried', type: 'hymn',
            speaker: 'choir', text: kvLic.doxastichon.text, tone: kvLic.doxastichon.tone,
            source: 'pentecostarion', label: kvLic.doxastichon.label, provenance: 'OCA',
          });
          // Replace from the first verse/hymn block of LIC through the last LIC block.
          let licStart = -1, licEnd = -1;
          baseBlocks.forEach((b, i) => {
            if (b.section === 'Lord, I Have Cried' && (b.type === 'verse' || b.type === 'hymn' || b.type === 'doxology')) {
              if (licStart === -1) licStart = i;
              licEnd = i;
            }
          });
          if (licStart >= 0) {
            baseBlocks.splice(licStart, licEnd - licStart + 1, ...licBlocks);
          }
        }
      }

      // ── Replace Evening Prokeimenon with Great Prokeimenon Tone 7 ──────
      // OCA prescribes "Who is so great a God as our God?" (Ps. 76) for the
      // Day of Holy Spirit eve, not the Sunday "The Lord is king" (Ps. 92).
      {
        const kvProk = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.prokeimenon;
        if (kvProk?.refrain) {
          const section = 'Evening Prokeimenon';
          const pBlocks = [
            { id: 'kv-prok-intro', section, type: 'prayer', speaker: 'priest',
              text: 'Let us attend. Peace be unto all.' },
            { id: 'kv-prok-resp', section, type: 'response', speaker: 'choir',
              text: 'And to thy spirit.' },
            { id: 'kv-prok-announce', section, type: 'rubric', speaker: 'deacon',
              text: `The great prokeimenon in Tone ${kvProk.tone}.` },
            { id: 'kv-prok-refrain', section, type: 'hymn', speaker: 'choir',
              text: kvProk.refrain, tone: kvProk.tone },
          ];
          kvProk.verses.forEach((v, i) => {
            pBlocks.push({ id: `kv-prok-v${i}`, section, type: 'verse', speaker: 'deacon', text: v });
            pBlocks.push({ id: `kv-prok-refrain-r${i}`, section, type: 'hymn', speaker: 'choir',
              text: kvProk.refrain, tone: kvProk.tone });
          });
          pBlocks.push({ id: 'kv-prok-final', section, type: 'hymn', speaker: 'choir',
            text: kvProk.refrain, tone: kvProk.tone });
          let pkStart = -1, pkEnd = -1;
          baseBlocks.forEach((b, i) => {
            if (b.section === 'Evening Prokeimenon') {
              if (pkStart === -1) pkStart = i;
              pkEnd = i;
            }
          });
          if (pkStart >= 0) {
            baseBlocks.splice(pkStart, pkEnd - pkStart + 1, ...pBlocks);
          }
        }
      }

      // ── Replace Aposticha with Kneeling-Vespers-specific propers ───────
      // The Saturday-eve Vigil aposticha (Tone 6 "The nations did not
      // know…" + Tone 8 "The arrogance of the tower…") falls through from
      // the same-day calendar entry; but for Sunday-evening Kneeling
      // Vespers the Pentecostarion prescribes a distinct set — three Tone-3
      // stichera with Ps. 50:10–11 verses + Tone-8 "Come, O people" (Leo
      // the Master) doxastichon. See pentecostarion-sunday-overrides.json[49].kneelingVespers.aposticha.
      {
        const kvAposticha = PENTECOSTARION_SUNDAY_OVERRIDES[49]?.kneelingVespers?.aposticha;
        if (kvAposticha?.stichera?.length) {
          const apostBlocks = [];
          kvAposticha.stichera.forEach((s, i) => {
            if (i > 0 && kvAposticha.verses?.[i - 1]) {
              apostBlocks.push({
                id: `kv-apost-v${i}`, section: 'Aposticha', type: 'verse', speaker: 'reader',
                text: `V. ${kvAposticha.verses[i - 1]}`,
              });
            }
            apostBlocks.push({
              id: `kv-apost-s${i + 1}`, section: 'Aposticha', type: 'hymn', speaker: 'choir',
              text: s.text, tone: s.tone, source: 'pentecostarion',
              label: s.label || 'Sticheron', provenance: 'OCA',
            });
          });
          apostBlocks.push({
            id: 'kv-apost-glory', section: 'Aposticha', type: 'doxology', speaker: null,
            text: 'Glory to the Father, and to the Son, and to the Holy Spirit.',
          });
          apostBlocks.push({
            id: 'kv-apost-now', section: 'Aposticha', type: 'doxology', speaker: null,
            text: 'Now and ever and unto ages of ages. Amen.',
          });
          apostBlocks.push({
            id: 'kv-apost-dox', section: 'Aposticha', type: 'hymn', speaker: 'choir',
            text: kvAposticha.doxastichon.text, tone: kvAposticha.doxastichon.tone,
            source: 'pentecostarion', label: kvAposticha.doxastichon.label, provenance: 'OCA',
          });
          const apostStart = baseBlocks.findIndex(b => b.section === 'Aposticha');
          let apostEnd = -1;
          baseBlocks.forEach((b, i) => { if (b.section === 'Aposticha') apostEnd = i; });
          if (apostStart >= 0) {
            baseBlocks.splice(apostStart, apostEnd - apostStart + 1, ...apostBlocks);
          }
        }
      }

      // ── Strip Vigil-only artifacts (OCA-strict Kneeling Vespers shape) ──
      // assembleForDate() returns the Saturday-eve Vigil structure for the
      // Pentecost-day calendar entry. OCA's 2026-0601 docx prescribes a
      // daily-vespers shape with kneeling-prayer insertions — no Kathisma,
      // Litya, Bread Blessing, or OT readings. Vouchsafe also belongs in a
      // different position (between 2nd and 3rd Kneeling Prayer rather than
      // after the Litany of Fervent Supplication) — extract it here and
      // re-splice below. See project_kneeling_vespers_order_audit.md.
      const STRIP_SECTIONS = new Set([
        'Old Testament Readings',
        'The Litya',
        'Blessing of Bread',
      ]);
      // Remove Kathisma + its trailing Little Litany as a contiguous block
      // (other Little Litany instances elsewhere in the service must be kept).
      {
        const kStart = baseBlocks.findIndex(b => b.section === 'Kathisma');
        if (kStart >= 0) {
          let kEnd = kStart;
          while (kEnd + 1 < baseBlocks.length &&
                 (baseBlocks[kEnd + 1].section === 'Kathisma' ||
                  baseBlocks[kEnd + 1].section === 'Little Litany')) {
            kEnd++;
          }
          baseBlocks.splice(kStart, kEnd - kStart + 1);
        }
      }
      // Extract Vouchsafe blocks (re-spliced below between 2nd and 3rd Kneeling).
      const vouchsafeBlocks = [];
      for (let i = baseBlocks.length - 1; i >= 0; i--) {
        if (baseBlocks[i].section === 'Vouchsafe, O Lord') {
          vouchsafeBlocks.unshift(baseBlocks[i]);
          baseBlocks.splice(i, 1);
        }
      }
      // Remove the rest of the strip list.
      for (let i = baseBlocks.length - 1; i >= 0; i--) {
        if (STRIP_SECTIONS.has(baseBlocks[i].section)) {
          baseBlocks.splice(i, 1);
        }
      }
      // Collapse the Vigil thrice-troparion to a single hymn.
      // Vigil pattern emits the festal troparion 3× with a "sung thrice"
      // rubric; OCA Kneeling Vespers prints it once (daily-vespers shape).
      {
        const tropIdx = [];
        baseBlocks.forEach((b, i) => {
          if (b.section === 'Troparia') tropIdx.push(i);
        });
        if (tropIdx.length) {
          const trop = baseBlocks.slice(tropIdx[0], tropIdx[tropIdx.length - 1] + 1);
          const hymns = trop.filter(b => b.type === 'hymn');
          if (hymns.length > 1) {
            // Keep one hymn per distinct text; drop the thrice-rubric.
            const seenText = new Set();
            const kept = trop.filter(b => {
              if (b.type === 'rubric' && /thrice|three times/i.test(b.text || '')) return false;
              if (b.type === 'hymn') {
                if (seenText.has(b.text)) return false;
                seenText.add(b.text);
              }
              return true;
            });
            baseBlocks.splice(tropIdx[0], tropIdx[tropIdx.length - 1] - tropIdx[0] + 1, ...kept);
          }
        }
      }

      // ── Build the three Kneeling Prayer groups as ServiceBlocks ────────
      // Resolve translation overlay: prayer texts live in overlay files
      // (e.g. sts-sluzhebnik/kneeling-vespers-fixed.json) because the base
      // file ships only universal rubrics + placeholders.
      const translation = resolveTranslation(q);
      const kv = getOverlayFixed('kneeling-vespers', translation) || kneelingVespersFixed;
      const r  = kv.rubrics;
      function buildSet(setKey, sectionName, prayerKeys, includeIntroNotice) {
        const out = [];
        if (includeIntroNotice) {
          out.push({
            id: `kn-${setKey}-notice`, section: sectionName, type: 'rubric',
            speaker: null, text: r.kneelingNotice,
          });
        }
        out.push({
          id: `kn-${setKey}-heading`, section: sectionName, type: 'rubric',
          speaker: null, text: kv[setKey].heading,
        });
        out.push({
          id: `kn-${setKey}-bid`, section: sectionName, type: 'prayer',
          speaker: 'deacon', text: r.deaconBidsKneeling,
        });
        out.push({
          id: `kn-${setKey}-bid-resp`, section: sectionName, type: 'response',
          speaker: 'choir', text: 'Lord, have mercy.',
        });
        prayerKeys.forEach((pk, i) => {
          if (i > 0) {
            out.push({
              id: `kn-${setKey}-adds-${i}`, section: sectionName, type: 'rubric',
              speaker: null, text: r.andHeAdds,
            });
          }
          out.push({
            id: `kn-${setKey}-${pk}`, section: sectionName, type: 'prayer',
            speaker: 'priest', text: kv[setKey][pk],
          });
        });
        out.push({
          id: `kn-${setKey}-rise`, section: sectionName, type: 'prayer',
          speaker: 'deacon', text: r.deaconBidsRising,
        });
        out.push({
          id: `kn-${setKey}-rise-resp`, section: sectionName, type: 'response',
          speaker: 'choir', text: r.deaconBidsRisingResponse,
        });
        return out;
      }

      const set1Blocks = buildSet('set1', 'First Kneeling', ['firstPrayer','secondPrayer'], true);
      const set2Blocks = buildSet('set2', 'Second Kneeling', ['firstPrayer','secondPrayer'], false);
      const set3Blocks = buildSet('set3', 'Third Kneeling', ['firstPrayer','secondPrayer','thirdPrayer'], false);

      // Splice each set in *before* the named section's first block.
      // OCA-strict order (per 2026-0601-texts-tt.docx):
      //   Set1 → Fervent Supplication → Set2 → Vouchsafe → Set3 → Completion → Aposticha
      // We extracted Vouchsafe above; re-insert it between Sets 2 and 3,
      // both placed before the Completion litany.
      function insertBeforeSection(arr, sectionName, inserted) {
        const idx = arr.findIndex(b => b.section === sectionName);
        if (idx === -1) return arr.concat(inserted); // fallback: append
        return arr.slice(0, idx).concat(inserted, arr.slice(idx));
      }
      let blocks = baseBlocks;
      blocks = insertBeforeSection(blocks, 'Litany of Fervent Supplication', set1Blocks);
      blocks = insertBeforeSection(blocks, 'Litany of Completion',
        [...set2Blocks, ...vouchsafeBlocks, ...set3Blocks]);

      // Tag blocks whose text came from the overlay (for dev-mode attribution).
      tagBlocksWithOverlay(blocks, 'kneeling-vespers', translation);

      const season = calendarEntry.liturgicalContext?.season || 'pentecostarion';
      const dow    = calendarEntry.dayOfWeek || null;
      const liturgicalLabel = getDayLabel(calendarEntry, dow, season, calendarEntry.date)
                              || 'The Descent of the Holy Spirit (Pentecost)';
      const commemorations = calendarEntry.commemorations || [];

      if (format === 'html') {
        const toneLabel = tone ? ` · Tone ${tone}` : '';
        renderServiceHTML(res, blocks,
          'Kneeling Vespers of Pentecost',
          `${formatDate(date)}${toneLabel}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:     'kneelingVespers',
        serviceName:     'Kneeling Vespers of Pentecost',
        tone,
        season,
        liturgicalLabel,
        commemorations,
        blocks,
      }));
      })();

    } else if (pathname === '/api/paschal-hours') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const season = getLiturgicalSeason(d);
      if (season !== 'brightWeek') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Paschal Hours are only served during Bright Week (Pascha through Bright Saturday).',
          date,
        }));
        return;
      }

      let blocks;
      try {
        blocks = assemblePaschalHours(paschalHoursFixed);
      } catch (err) {
        console.error('assemblePaschalHours error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }

      if (pronoun === 'yy') {
        for (const block of blocks) {
          if (block.text)  block.text  = applyYouYour(block.text);
          if (block.label) block.label = applyYouYour(block.label);
        }
      }

      const dow = getDayOfWeek(d);
      const NAMES = {
        sunday: 'Holy Pascha', monday: 'Bright Monday', tuesday: 'Bright Tuesday',
        wednesday: 'Bright Wednesday', thursday: 'Bright Thursday',
        friday: 'Bright Friday', saturday: 'Bright Saturday',
      };

      if (format === 'html') {
        renderServiceHTML(res, blocks, 'The Paschal Hours', `${formatDate(date)} · ${NAMES[dow] || 'Bright Week'}`, pronoun);
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        date,
        serviceType:    'paschal-hours',
        serviceName:    'The Paschal Hours',
        season:         'brightWeek',
        liturgicalLabel: NAMES[dow] || 'Bright Week',
        blocks,
      }));

    } else if (pathname === '/api/pascha-collection') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');
      const format  = (q.format  || '').trim().toLowerCase();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      const d = new Date(date + 'T12:00:00Z');
      const pascha = calculatePascha(d.getUTCFullYear());
      const isPaschaDay = d.getUTCFullYear() === pascha.getUTCFullYear()
        && d.getUTCMonth() === pascha.getUTCMonth()
        && d.getUTCDate() === pascha.getUTCDate();

      if (!isPaschaDay) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'The Holy Pascha Collection is only available on Pascha Sunday.',
          date,
        }));
        return;
      }

      (async () => {
        try {
          const allBlocks = [];
          const serviceTitle = (n, title) => ({
            id: `pascha-title-${n}`,
            section: title,
            type: 'rubric',
            speaker: null,
            text: title,
            label: 'service-title',
          });

          // Each sub-service assembler uses its own id namespace (e.g. multiple
          // `dis-amen` blocks), so prefix per-service ids when bundling.
          const namespace = (prefix, blocks) =>
            blocks.map(b => b.id ? { ...b, id: `${prefix}-${b.id}` } : b);

          // ── Part 1: Midnight Office ──
          allBlocks.push(serviceTitle(1, 'The Midnight Office'));
          const moBlocks = assembleMidnightOffice(midnightOfficeFixed);
          allBlocks.push(...namespace('mo', moBlocks));

          // ── Part 2: Paschal Matins ──
          allBlocks.push(serviceTitle(2, 'Paschal Matins'));
          const matinsBlocks = assemblePaschalMatins(paschalMatinsFixed);
          allBlocks.push(...namespace('pm', matinsBlocks));

          // ── Part 3: Paschal Hours ──
          allBlocks.push(serviceTitle(3, 'The Paschal Hours'));
          const hoursBlocks = assemblePaschalHours(paschalHoursFixed);
          allBlocks.push(...namespace('ph', hoursBlocks));

          // ── Part 4: Paschal Liturgy ──
          allBlocks.push(serviceTitle(4, 'The Paschal Divine Liturgy'));
          let calendarEntry = getCalendarEntry(date);
          if (calendarEntry && !calendarEntry.liturgy) {
            const orthocalData = await fetchOrthocalDay(date);
            calendarEntry = { ...calendarEntry,
              liturgy: buildLiturgyFromOrthocal(orthocalData, date, sources) };
          }
          if (calendarEntry?.liturgy) {
            const litTranslation = resolveTranslation(q);
            const litBlocks = assembleLiturgy(calendarEntry, getLiturgyFixed(litTranslation), sources,
              { rubrics: getOverlayRubrics(litTranslation) });
            allBlocks.push(...namespace('pl', litBlocks));
          }

          // Pronoun switching
          if (pronoun === 'yy') {
            for (const block of allBlocks) {
              if (block.text)  block.text  = applyYouYour(block.text);
              if (block.label) block.label = applyYouYour(block.label);
            }
          }

          if (format === 'html') {
            renderServiceHTML(res, allBlocks, 'Holy Pascha Collection', `${formatDate(date)} · The Holy Pascha`, pronoun);
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            serviceType:     'pascha-collection',
            serviceName:     'Holy Pascha Collection',
            season:          'brightWeek',
            liturgicalLabel: 'The Holy Pascha — Resurrection of Christ',
            blocks:          allBlocks,
          }));
        } catch (err) {
          console.error('pascha-collection error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

    } else if (pathname === '/api/choir-prep') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (['tt','yy'].includes(q.pronoun) ? q.pronoun : 'tt');

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or missing date parameter.' }));
        return;
      }

      // Determine available services (same logic as /api/days, single date)
      const d = new Date(date + 'T12:00:00Z');
      const [, mm, dd] = date.split('-').map(Number);
      const dowIdx = d.getUTCDay();
      const dowStr = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];
      const entry  = getCalendarEntry(date);
      const season = entry ? (entry.liturgicalContext?.season || null) : null;
      const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
      const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

      // Feast + commemorations
      let commemorations = [];
      try {
        const dayList = getMenaionDayList(mm, dd);
        if (dayList) commemorations = dayList.commemorations;
      } catch (_) {}

      const svcMap = {
        greatVespers:    { key: 'greatVespers',    name: 'Great Vespers',                  endpoint: '/api/service' },
        dailyVespers:    { key: 'dailyVespers',    name: 'Daily Vespers',                  endpoint: '/api/service' },
        matins:          { key: 'matins',           name: 'Matins',                         endpoint: '/api/matins' },
        liturgy:         { key: 'liturgy',          name: 'Divine Liturgy',                 endpoint: '/api/liturgy' },
        presanctified:   { key: 'presanctified',    name: 'Presanctified Liturgy',          endpoint: '/api/presanctified' },
        bridegroomMatins:{ key: 'bridegroomMatins', name: 'Bridegroom Matins',              endpoint: '/api/bridegroom-matins' },
        passionGospels:  { key: 'passionGospels',   name: 'Twelve Passion Gospels',         endpoint: '/api/passion-gospels' },
        royalHours:      { key: 'royalHours',       name: 'Royal Hours',                    endpoint: '/api/royal-hours' },
        lamentations:    { key: 'lamentations',     name: 'The Lamentations',               endpoint: '/api/lamentations' },
        vesperalLiturgy: { key: 'vesperalLiturgy',  name: 'Vesperal Liturgy of St. Basil',  endpoint: '/api/vesperal-liturgy' },
        paschalHours:    { key: 'paschalHours',      name: 'Paschal Hours',                  endpoint: '/api/paschal-hours' },
        paschaCollection:{ key: 'paschaCollection',  name: 'Holy Pascha Collection',         endpoint: '/api/pascha-collection' },
        kneelingVespers: { key: 'kneelingVespers',   name: 'Kneeling Vespers of Pentecost',  endpoint: '/api/kneeling-vespers' },
      };

      // Build available services list
      // Vespers date-shift: vespers served this evening belongs to tomorrow
      const vespersEntry = getCalendarEntry(getNextDateStr(date));
      const available = {
        greatVespers:    vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
        dailyVespers:    vespersEntry?.vespers?.serviceType === 'dailyVespers',
        bridegroomMatins: isBridegroomMatins(d),
        lamentations:    isLamentationsDay(d),
        vesperalLiturgy: isVesperalLiturgyDay(d),
        royalHours:      isRoyalHoursDay(d),
        passionGospels:  isPassionGospelsDay(d),
        matins:          !!buildMatinsSpec(date, d, dowStr, season, getTone(d), sources),
        liturgy:         !!(entry?.liturgy) || isLiturgyServed(d),
        presanctified:   isPresanctifiedDay(d),
        paschalHours:    getLiturgicalSeason(d) === 'brightWeek',
        paschaCollection: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          return d.getUTCMonth() === p.getUTCMonth() && d.getUTCDate() === p.getUTCDate();
        })(),
        kneelingVespers: (() => {
          const p = calculatePascha(d.getUTCFullYear());
          const DAY = 86400000;
          const midnight = new Date(date + 'T00:00:00Z');
          return Math.round((midnight - p) / DAY) === 49;
        })(),
      };

      const toFetch = Object.entries(available)
        .filter(([, avail]) => avail)
        .map(([key]) => svcMap[key])
        .filter(Boolean);

      // Fetch each service via internal HTTP requests. Thread the translation
      // overlay through so all inner Liturgy/Vespers/etc. requests see it.
      const translation = resolveTranslation(q);
      const translationSuffix = translation ? `&translation=${encodeURIComponent(translation)}` : '';
      const fetchInternal = (endpoint, dateStr, pron) => new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}${endpoint}?date=${dateStr}&pronoun=${pron}${translationSuffix}`;
        http.get(url, (resp) => {
          let body = '';
          resp.on('data', chunk => body += chunk);
          resp.on('end', () => {
            try {
              if (resp.statusCode === 200) resolve(JSON.parse(body));
              else resolve(null);
            } catch (e) { resolve(null); }
          });
        }).on('error', () => resolve(null));
      });

      (async () => {
        try {
          const results = await Promise.all(
            toFetch.map(svc => fetchInternal(svc.endpoint, date, pronoun))
          );

          const services = [];
          for (let i = 0; i < toFetch.length; i++) {
            const data = results[i];
            if (!data || !data.blocks) continue;
            services.push({
              type: toFetch[i].key,
              name: data.serviceName || toFetch[i].name,
              blocks: data.blocks,
            });
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            date,
            tone,
            season,
            liturgicalLabel,
            commemorations,
            services,
          }));
        } catch (err) {
          console.error('/api/choir-prep error:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        }
      })();

    } else if (pathname === '/api/days') {
      const q    = parseQuery(url);
      const from = (q.from || '').trim();
      const to   = (q.to   || '').trim();

      res.setHeader('Access-Control-Allow-Origin', '*');

      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid from/to parameters.' }));
        return;
      }

      const [fy, fm, fd] = from.split('-').map(Number);
      const [ty, tm, td] = to.split('-').map(Number);
      const startDate = new Date(Date.UTC(fy, fm - 1, fd));
      const endDate   = new Date(Date.UTC(ty, tm - 1, td));

      if (endDate < startDate) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '"to" must be on or after "from".' }));
        return;
      }

      const today = new Date().toISOString().slice(0, 10);
      const MONTH_NAMES_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                                'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
      const DOW_NAMES_UPPER  = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
      const DAY_MS_LOCAL     = 24 * 60 * 60 * 1000;

      const result = [];
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const dateStr = cur.toISOString().slice(0, 10);
        const [, mm, dd] = dateStr.split('-').map(Number);
        const dowIdx  = cur.getUTCDay();
        const dowStr  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dowIdx];

        // Get calendar entry (cheap — no assembly)
        const entry  = getCalendarEntry(dateStr);
        const season = entry ? (entry.liturgicalContext?.season || null) : null;
        const tone   = entry ? (entry.liturgicalContext?.tone ?? entry.vespers?.lordICall?.tone ?? null) : null;
        const liturgicalLabel = entry ? getDayLabel(entry, dowStr, season, entry.date) : null;

        // Vespers date-shift: vespers served on this evening belongs to
        // the *next* liturgical day, so look up tomorrow's calendar entry.
        const vespersDateStr = getNextDateStr(dateStr);
        const vespersEntry   = getCalendarEntry(vespersDateStr);

        // Feast + commemorations list from Menaion DB
        let feast = null;
        let commemorations = [];
        try {
          const dayList = getMenaionDayList(mm, dd);
          if (dayList) {
            feast          = dayList.principal;
            commemorations = dayList.commemorations;
          }
        } catch (_) {}

        const services = {
          greatVespers: vespersEntry?.vespers?.serviceType === 'greatVespers' && !vespersEntry?.vespers?.serviceKey,
          dailyVespers: vespersEntry?.vespers?.serviceType === 'dailyVespers',
          allNightVigil: vespersEntry?.vespers?.serviceType === 'all-night-vigil',
          burialVespers: isBurialVespersDay(cur),
      bridegroomMatins: isBridegroomMatins(cur),
          lamentations: isLamentationsDay(cur),
          vesperalLiturgy: isVesperalLiturgyDay(cur),
          royalHours: isRoyalHoursDay(cur),
          passionGospels: isPassionGospelsDay(cur),
          matins:  !!buildMatinsSpec(dateStr, cur, dowStr, season, getTone(cur), sources),
          liturgy: !!(entry?.liturgy) || isLiturgyServed(cur),
          presanctified: isPresanctifiedDay(cur),
          paschalHours: getLiturgicalSeason(cur) === 'brightWeek',
          paschaCollection: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return cur.getUTCMonth() === p.getUTCMonth() && cur.getUTCDate() === p.getUTCDate();
          })(),
          kneelingVespers: (() => {
            const p = calculatePascha(cur.getUTCFullYear());
            return Math.round((cur - p) / DAY_MS_LOCAL) === 49;
          })(),
        };

        result.push({
          date:           dateStr,
          dayOfWeek:      dowStr,
          displayDay:     DOW_NAMES_UPPER[dowIdx],
          displayDate:    `${MONTH_NAMES_FULL[mm - 1]} ${dd}`,
          isToday:        dateStr === today,
          season,
          tone,
          feast,
          commemorations,
          liturgicalLabel,
          services,
        });

        cur = new Date(cur.getTime() + DAY_MS_LOCAL);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/api/search') {
      const q = parseQuery(url);
      const query = (q.q || '').trim();
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (query.length < 2) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }

      let results = [];
      try {
        const db = openDb();
        if (db) {
          // Find matching commemorations, deduplicate by title across months
          const rows = db.prepare(`
            SELECT id, month, day, title, rank
            FROM commemorations
            WHERE title LIKE ?
            ORDER BY rank DESC, month, day
            LIMIT 40
          `).all(`%${query}%`);

          // Compute 2026 date and check service availability
          const seen = new Set();
          for (const row of rows) {
            const key = row.title.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const mm = String(row.month).padStart(2, '0');
            const dd = String(row.day).padStart(2, '0');
            // Find the nearest upcoming Saturday on or after this calendar date in 2026
            // that falls within a Saturday window, or just use the calendar date
            const dateStr = `2026-${mm}-${dd}`;
            // Find what Saturday this day falls on (Vespers is on Saturday)
            const date = new Date(`${dateStr}T12:00:00`);
            const dow = date.getDay(); // 0=Sun
            // For search results, show the calendar date; Great Vespers is Saturday night
            // so if the feast is on a Sunday, Vespers is Saturday night before (subtract 1 day)
            let serviceDate = dateStr;
            if (dow === 0) {
              // Sunday feast — Vespers was Saturday evening
              const sat = new Date(date);
              sat.setDate(sat.getDate() - 1);
              serviceDate = sat.toISOString().slice(0, 10);
            }

            const entry = getCalendarEntry(serviceDate);
            const svcType = entry?.vespers?.serviceType || null;
            const hasService = !!(svcType);

            results.push({
              id:          serviceDate,
              title:       row.title,
              dateStr:     serviceDate,
              svcType:     svcType || 'greatVespers',
              displayDate: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
              available:   hasService,
            });
          }
        }
      } catch (err) {
        console.error('/api/search error:', err);
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));

    } else if (pathname === '/service') {
      const q       = parseQuery(url);
      const date    = (q.date    || '').trim();
      const pronoun = (q.pronoun || 'tt').trim();

      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage('Invalid or missing date parameter.'));
        return;
      }

      // Vespers date-shift: content belongs to the next liturgical day
      const vespersDate = getNextDateStr(date);

      // Try assembleForDate first
      let assembleResult;
      try {
        assembleResult = assembleForDate(vespersDate, pronoun);
      } catch (err) {
        console.error('Assembly error:', err);
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(`Assembly error: ${err.message}`));
        return;
      }

      if (!assembleResult) {
        // Fall back to DB-collected texts (variable sections only)
        const dbBlocks = getDbBlocks(date, pronoun);
        if (dbBlocks.length > 0) {
          const blocks = mapDbBlocks(dbBlocks);
          const html = renderVespers(blocks, {
            title: 'Vespers (Collected Texts)',
            date:  formatDate(date),
          });
          const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;
          const notice = `<div style="font-family:sans-serif;font-size:9.5pt;padding:8px 40px;background:#e8f4fb;border-bottom:1px solid #a0c8e0;color:#1a4a6a;">
  ℹ Showing collected variable texts only — fixed liturgy (litanies, psalms, prayers) not yet available for this season.
</div>`;
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html.replace('<body>', '<body>' + backBar + notice));
          return;
        }

        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(Date.UTC(year, month - 1, day));
        const season  = getLiturgicalSeason(dateObj);
        const dow     = getDayOfWeek(dateObj);
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderErrorPage(
          `No service available for ${formatDate(date)}.`,
          `This is a ${dow} in the ${season} season. ` +
          `Automatic generation is currently supported for Saturdays in ordinary time only. ` +
          `Add a hand-authored calendar file to support this date.`
        ));
        return;
      }

      const { blocks, calendarEntry, serviceTitle, tone } = assembleResult;
      const pronounLabel = pronoun === 'yy' ? ' (You/Your)' : ' (Thee/Thy)';
      const isGenerated  = calendarEntry._meta?.generated;
      const toneLabel    = tone ? ` · Tone ${tone}` : '';

      const html = renderVespers(blocks, {
        title: serviceTitle,
        date:  `${formatDate(date)}${toneLabel}${pronounLabel}`,
      });

      const backBar = `<div style="font-family:sans-serif;font-size:10pt;padding:10px 40px;background:#f5f0ec;border-bottom:1px solid #ddd;">
  <a href="/" style="color:#8b1a1a;text-decoration:none;">← Back</a>
</div>`;

      // Format assembly warnings into human-readable messages
      const rawWarnings = blocks._warnings || [];
      const warningMessages = rawWarnings.map(w => formatAssemblyWarning(w.source, w.key)).filter(Boolean);
      const uniqueWarnings = [...new Set(warningMessages)];

      const warningBanner = uniqueWarnings.length > 0
        ? `<div style="font-family:sans-serif;font-size:9.5pt;padding:10px 40px;background:#fff3cd;border-bottom:2px solid #e6ac00;color:#6b4800;">
             <strong>⚠ Some portions of this service are incomplete:</strong>
             <ul style="margin:4px 0 0 16px;padding:0;">${uniqueWarnings.map(m => `<li>${m}</li>`).join('')}</ul>
           </div>`
        : '';

      const injected = html.replace('<body>', '<body>' + backBar + warningBanner);

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);

    } else if (/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/stichera\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getSticheraDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No stichera found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/.test(pathname)) {
      const [, m, d] = pathname.match(/^\/api\/menaion\/(\d{1,2})\/(\d{1,2})$/);
      const month = parseInt(m, 10);
      const day   = parseInt(d, 10);
      const data  = getMenaionDay(month, day);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No commemorations found', month, day }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ month, day, commemorations: data }, null, 2));

    } else if (pathname === '/api/dashboard') {
      const q    = parseQuery(url);
      const year = parseInt(q.year, 10) || 2026;

      res.setHeader('Access-Control-Allow-Origin', '*');

      const result = buildDashboardData(year);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));

    } else if (pathname === '/dashboard') {
      serveStatic(res, path.join(__dirname, 'public', 'dashboard.html'), 'text/html');

    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  } catch (err) {
    console.error(err);
    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderErrorPage(`Internal error: ${err.message}`));
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

const server = http.createServer(handleRequest);
server.listen(PORT, () => {
  console.log(`OCA Service Browser running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop.');
});
