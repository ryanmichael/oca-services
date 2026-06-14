'use strict';

// Per-date Vespers dispatcher. Resolves the calendar entry, runs through the
// Pentecostarion Sunday LIC override, injects Menaion stichera where the
// calendar entry's slots are generic, and hands off to assembleVespers.

const { assembleVespers } = require('../../assembler');
const { calculatePascha, fixedFeastDate } = require('../../calendar-rules');

const { getCalendarEntry }                        = require('../sources/calendar');
const { getMenaionRanked }                        = require('../sources/menaion');
const { getGeneralMenaionTexts }                  = require('../sources/general-menaion');
const { buildDbSource }                           = require('../sources/db-source');
const { PENTECOSTARION_SUNDAY_OVERRIDES, DAY_PATRONS } = require('../sources/propers');

const { applyYouYour } = require('./pronouns');

/**
 * Core assembly function. Returns { blocks, calendarEntry, serviceTitle, tone }
 * or null if no calendar entry exists for the date.
 * Throws on assembly error.
 */
function assembleForDate(date, pronoun, entryOverride, vespersFixedBase, sources, style = 'new') {
  const calendarEntry = entryOverride || getCalendarEntry(date, style);
  if (!calendarEntry) return null;
  const vespersFixed = vespersFixedBase;

  const dbSource = buildDbSource(date, pronoun);

  // For Old Style, the Menaion injection consults the Julian (M, D) — the
  // saint's commemoration date on the Julian calendar, not the civil date.
  function adjustedMD() {
    const [y, m, d] = date.split('-').map(Number);
    const civil = new Date(Date.UTC(y, m - 1, d));
    const adj   = fixedFeastDate(civil, style);
    return [adj.getUTCMonth() + 1, adj.getUTCDate()];
  }

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
  const isGreatVespers      = calendarEntry.vespers?.serviceType === 'greatVespers' ||
                              calendarEntry.vespers?.serviceType === 'all-night-vigil';
  // "Resurrectional injection" means the Vespers spec already carries
  // Octoechos resurrectional slots that the Menaion stichera should be
  // split alongside (not replaced wholesale). This applies to:
  //   - Sat liturgical day (vespers spec is built on resurrectional Octoechos)
  //   - Sun liturgical day when Great Vespers (Sat-eve service entering Sunday)
  // Lenten Sundays and Pentecostarion Sundays use db/triodion sources rather
  // than resurrectional Octoechos, so they fall out via the source-key check.
  const isSaturdayInjection = (calendarEntry.dayOfWeek === 'saturday' || calendarEntry.dayOfWeek === 'sunday')
                              && calendarEntry.vespers?.lordICall?.slots?.[0]?.source === 'octoechos';
  const isWeekdayInjection  = !isSaturdayInjection;
  // Skip Menaion injection when the service already has complete Triodion content
  // (lordICall slots are DB-sourced, meaning a special observance like Meatfare Saturday)
  // Also skip for Pentecostarion Sundays — they use only Octoechos + Pentecostarion texts
  const hasTriodionContent = calendarEntry.vespers?.lordICall?.slots?.some(s => s.source === 'db');
  const isPentSundayVespers = calendarEntry.vespers?.isPentecostarionSunday;
  if (calendarEntry._meta?.generated && injectSeasons.includes(calendarEntry.liturgicalContext?.season) && !hasTriodionContent && !isPentSundayVespers) {
    const [mm, dd] = adjustedMD();
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
      // Sunday Great Vespers: cap Menaion at 6 — a principal-feast Sunday (e.g. Synaxis
      //   of NA Saints) claims up to 6 of 10 slots (OCA pattern: 4 res + 6 feast).
      //   Ordinary Sundays whose principal has only 3-4 stichera leave the rest to
      //   Octoechos resurrectional (data ships 6 per tone, so a 7th slot may repeat
      //   sticheron #1 — see project-sunday-great-vespers-ordinary-time).
      // Saturday Great Vespers: up to 6; Daily Vespers: up to 3
      const isVigilFeast    = calendarEntry.vespers?.serviceType === 'all-night-vigil';
      const isSundayGreatVespers = calendarEntry.dayOfWeek === 'sunday' && isGreatVespers && isSaturdayInjection;
      const maxLicStichera  = isVigilFeast       ? 8
                            : isSundayGreatVespers ? 6
                            : isGreatVespers     ? 6
                            : isSaturdayInjection ? 6
                            : 3;
      const licStichera = sticheraData?.[0]?.stichera.filter(
        s => s.section === 'lordICall' && s.order >= 1
      ).slice(0, maxLicStichera) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection && !calendarEntry.liturgicalContext?.greatFeast && !isVigilFeast) {
          // Sat/Sun Great Vespers: split verses between resurrectional Octoechos and Menaion.
          // Total = the spec's totalStichera (6 for Saturday, 10 for Sunday).
          const totalStichera       = calendarEntry.vespers.lordICall.totalStichera || 6;
          const menaionCount        = licStichera.length;
          const resurrectionalCount = totalStichera - menaionCount;
          const allVerses           = Array.from({ length: totalStichera }, (_, i) => totalStichera - i);
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
          // Combine Glory+Now into a single doxology ONLY when the spec has
          // no separate `now` slot (e.g. Tone 5 Saturday, where the dogmatikon
          // already absorbs the Glory). When the spec carries a distinct `now`
          // — the Theotokion-Dogmatikon of the week — the saint's doxastichon
          // goes under Glory and the Theotokion follows under Now and ever.
          // Otherwise we silently drop the Theotokion-Dogmatikon (OCA Sun
          // Great Vespers gap surfaced 2026-06-13 NA Saints audit).
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title, combinesGloryNow: !lic.now };
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

module.exports = { assembleForDate };
