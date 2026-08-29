'use strict';

// Per-date Vespers dispatcher. Resolves the calendar entry, runs through the
// Pentecostarion Sunday LIC override, injects Menaion stichera where the
// calendar entry's slots are generic, and hands off to assembleVespers.

const { assembleVespers } = require('../../assembler');
const { calculatePascha, fixedFeastDate, VESPERS_SUNG_EVE } = require('../../calendar-rules');

const { getCalendarEntry }                        = require('../sources/calendar');
const { getMenaionRanked }                        = require('../sources/menaion');
const { pickPrincipalByOrthocalOrder,
        applyPrincipalOverride,
        loadOrthocalForDate,
        FEAST_CYCLE_TITLE,
        windowClaimsNowAndEver }                  = require('../sources/menaion-principal');
const { getGeneralMenaionTexts }                  = require('../sources/general-menaion');
const { buildDbSource }                           = require('../sources/db-source');
const { PENTECOSTARION_SUNDAY_OVERRIDES, DAY_PATRONS, GREAT_FEAST_VARIANTS } = require('../sources/propers');

const { applyYouYour } = require('./pronouns');

/**
 * Core assembly function. Returns { blocks, calendarEntry, serviceTitle, tone }
 * or null if no calendar entry exists for the date.
 * Throws on assembly error.
 */
function assembleForDate(date, pronoun, entryOverride, vespersFixedBase, sources, style = 'new', opts = {}) {
  // opts.rubrics reaches getCalendarEntry so the parish's Litya policy can be
  // applied to the entry itself (see applyLityaPolicy in sources/calendar.js).
  const calendarEntry = entryOverride || getCalendarEntry(date, style, { rubrics: opts.rubrics });
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
    // Orthocal-aware principal override: when our stichera-rich default
    // disagrees with OCA's canonical principal (e.g. Apostle Mark Apr 25,
    // Spyridon Dec 12), rebind to the orthocal-listed saint. Conservative
    // guard inside the picker keeps deliberate OCA-cycle picks intact
    // (Mary of Egypt Apr 1). See server-lib/sources/menaion-principal.js.
    const orthocalData = loadOrthocalForDate(date);
    let primary = ranked?.notable?.length
      ? pickPrincipalByOrthocalOrder(ranked.notable, orthocalData, ranked.principal)
      : (ranked?.principal ?? null);
    // Path-A: hand-curated per-date override for afterfeast/forefeast days where
    // the moveable-cycle pick buries a co-commemorated great saint the parish
    // elevates (search the full enriched pool so a saint with no troparion in
    // `notable` is still reachable). See menaion-principal.js PRINCIPAL_OVERRIDES.
    primary = applyPrincipalOverride(mm, dd, ranked?.all, primary, opts.rubrics?.principalOverrides);

    // When the picker rebound principal away from sticheraComm, prefer the
    // new principal's own stichera (if any). Otherwise the general-menaion
    // fallback below kicks in by saint_type.
    const pickerSwappedAway = primary && ranked?.sticheraComm && primary.id !== ranked.sticheraComm.id;
    let sticheraData;

    // Multi-saint Sunday Great Vespers: when more than one commemoration has its
    // own proper LIC stichera (e.g. Proclus & Hilary + Michael of Maleinus on
    // July 12), render each saint's stichera in calendar order and take the Glory
    // doxastikon from whichever saint supplies one (the elevated saint). The
    // resurrectional count auto-shrinks to fill the remaining verse slots.
    const multiSaintSunday = calendarEntry.dayOfWeek === 'sunday' && isGreatVespers && isSaturdayInjection;
    const licSticheraComms = multiSaintSunday
      ? (ranked?.all || []).filter(c =>
          c.saint_type !== 'theotokos' && c.saint_type !== 'icon' &&
          (c.stichera || []).some(s => s.section === 'lordICall' && s.order >= 1))
      : [];

    if (licSticheraComms.length > 1) {
      const combined = [];
      let n = 1, glory = null;
      for (const c of licSticheraComms) {
        const own = (c.stichera || [])
          .filter(s => s.section === 'lordICall')
          .sort((a, b) => a.order - b.order);
        for (const s of own) {
          if (s.order === 0) { if (!glory) glory = { ...s, label: s.label || c.title }; }
          // order<0 is the Now-and-ever slot, not a numbered sticheron. Renumbering
          // it into the run cost the saint a slot — 8-09 sang the Afterfeast's
          // "In Thy goodness" as a numbered sticheron and dropped St. Herman's
          // third Tone-8 sticheron off the end.
          else if (s.order >= 1) combined.push({ ...s, order: n++, label: s.label || c.title });
        }
      }
      if (glory) combined.unshift({ ...glory, order: 0 });
      // Carry the principal saint's aposticha (Glory doxastikon + its own
      // Theotokion) into the combined set so the aposticha injection below can
      // sing the saint's "Glory…" on multi-saint Sundays. Without this the
      // aposticha collapses to a bare resurrectional Theotokion — surfaced
      // 2026-07-25 auditing 7-26 (St. Jacob Netsvetov). The LIC selection above
      // filters by section==='lordICall', so these rows never affect the blend.
      const principalAposticha = (primary.stichera || []).filter(s => s.section === 'aposticha');
      combined.push(...principalAposticha);
      sticheraData = [{ id: primary.id, title: primary.title, rank: primary.rank, stichera: combined }];
    } else if (pickerSwappedAway) {
      sticheraData = primary.hasStichera
        ? [{ id: primary.id, title: primary.title, rank: primary.rank, stichera: primary.stichera }]
        : null;
    } else {
      sticheraData = ranked?.sticheraComm
        ? [{ id: ranked.sticheraComm.id, title: ranked.sticheraComm.title,
             rank: ranked.sticheraComm.rank, stichera: ranked.sticheraComm.stichera }]
        : null;
    }

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

      // Afterfeast/forefeast troparion for the Now-and-ever slot. When a saint
      // outranks the feast-cycle commemoration (so the feast is NOT the
      // principal), the Feast's troparion — not the resurrectional dismissal
      // Theotokion — takes "Now and ever…". Per the OCA order for 8-09:
      //   Resurrectional Troparion, Tone 1
      //   Glory… Troparion of St. Herman, Tone 7
      //   Now and ever… Troparion of the Feast, Tone 7
      // The row already carries the right text and tone; it was simply being
      // dropped because it is not the principal. Only fires when the two differ,
      // so ordinary afterfeast days (feast IS principal) are untouched.
      const feastCycleComm = (ranked?.notable || []).find(
        c => c.id !== primary.id && FEAST_CYCLE_TITLE.test(c.title || ''));
      const feastCycleTrop = feastCycleComm?.troparia?.find(t => t.type === 'troparion');

      // ...but only a GREAT Feast's window claims "Now and ever…". A lesser
      // feast's window takes the GLORY instead, ahead of the day's saint, and
      // the resurrectional dismissal Theotokion still closes. The OCA order for
      // 2026-08-30 — inside the Afterfeast of the Beheading of the Forerunner,
      // which is not one of the Twelve — prints Great Vespers as:
      //   Resurrectional Troparion, Tone 4
      //   Glory… Troparion of the Forerunner, Tone 2
      //   Now and ever… Resurrectional Dismissal Theotokion, Tone 2
      // The Saints' troparion is not sung here at all; it appears at Matins and
      // the Liturgy, where more than one saint hymn is printed.
      const windowTakesNow = feastCycleTrop
        && windowClaimsNowAndEver(feastCycleComm.title);
      const windowTakesGlory = feastCycleTrop && !windowTakesNow;

      if (windowTakesNow) {
        autoSlot.feastTroparion = {
          text:  feastCycleTrop.text,
          tone:  feastCycleTrop.tone,
          label: feastCycleComm.title,
        };
      }
      if (windowTakesGlory) {
        autoSlot.troparion = {
          text:  feastCycleTrop.text,
          tone:  feastCycleTrop.tone,
          label: feastCycleComm.title,
        };
      }

      // Whatever ends up at the Glory drives the label, and the tone the
      // dismissal Theotokion is re-keyed to ("Богородичен по гласу Славы").
      const gloryTone  = autoSlot.troparion.tone;
      const gloryLabel = autoSlot.troparion.label;

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
      // `alternative-set` rows are a SECOND set the Menaion offers in place of the
      // first ("And 3 Stichera, the composition of Anatolius, in Tone II"), not
      // extra slots. Counting them squeezes the resurrectional slot — 8-02 Stephen
      // rendered 6 Octoechos + 4 Menaion instead of the rubric's 7 + 3.
      const licStichera = sticheraData?.[0]?.stichera.filter(
        // A Stavrotheotokion is an ALTERNATIVE for the Now-and-ever slot on
        // Wed/Fri, never a numbered sticheron. The corpus keeps 75 of 79 at
        // order=-1, but four commemorations hold one at a numbered order, where
        // it was being sung as an ordinary sticheron — 4-26 rendered "Upon
        // beholding Thee, the Lamb and Shepherd, upon the Cross" as its fourth
        // hymn. Excluded here rather than re-keyed, so the row stays available
        // to the Now-and-ever branches that look for it. Found 2026-08-29 (N1).
        s => s.section === 'lordICall' && s.order >= 1
          && s.groupRole !== 'alternative-set' && s.groupRole !== 'stavrotheotokion'
      ).slice(0, maxLicStichera) ?? [];
      const licGlory = sticheraData?.[0]?.stichera.find(
        s => s.section === 'lordICall' && s.order === 0
      ) ?? null;

      if (licStichera.length > 0) {
        const lic = calendarEntry.vespers.lordICall;

        if (isSaturdayInjection && !calendarEntry.liturgicalContext?.greatFeast && !isVigilFeast) {
          // Sat/Sun Great Vespers: split verses between resurrectional Octoechos and Menaion.
          // Total = the spec's totalStichera (6 for Saturday, 10 for Sunday).
          // licNoLeadingRepeat caps the resurrectional slot at however many DISTINCT
          // stichera the week's tone actually publishes, rather than doubling the
          // first to pad the count. A tone with the full 7 (e.g. Tone 5) then yields
          // the standard 10 with no repeat; a 6-count tone yields 9.
          let totalStichera         = calendarEntry.vespers.lordICall.totalStichera || 6;

          // The OCA Obikhod ships only 6 numbered resurrectional stichera per tone,
          // one short of the canonical 7. In SOME tones the resurrectional
          // doxastichon is itself a plain sticheron, and when the Menaion claims
          // the Glory it is sung as the 7th numbered one rather than dropped —
          // Tone 8 verified against the Tyler choir booklet for 8-02. Most tones'
          // doxastika are framed for the Glory slot instead (Tone 3: "we offer our
          // evening song") and must NOT be promoted, so this is opt-in per tone via
          // `_alsoNumberedSticheron` rather than inferred. See
          // features/lic-no-leading-repeat.md.
          const resKey   = calendarEntry.vespers.lordICall.slots?.[0]?.key;
          const resNode  = resKey
            ? resKey.split('.').reduce((a, p) => (a ? a[p] : undefined), sources.octoechos)
            : null;
          const octoGlory = resKey
            ? resKey.split('.').slice(0, -1)
                .reduce((a, p) => (a ? a[p] : undefined), sources.octoechos)?.glory
            : null;
          const displacedGlory =
            (licGlory && octoGlory?.text && octoGlory._alsoNumberedSticheron) ? octoGlory : null;

          if (opts.rubrics?.lordICall?.noLeadingRepeat && totalStichera === 10) {
            const distinct = (Array.isArray(resNode?.hymns) ? resNode.hymns.length : 6)
                           + (displacedGlory ? 1 : 0);
            const desiredRes = totalStichera - licStichera.length;   // 10 − menaion
            const actualRes  = Math.min(desiredRes, distinct);       // cap: no doubling
            totalStichera    = actualRes + licStichera.length;       // 10 (Tone 5) or 9
            calendarEntry.vespers.lordICall.totalStichera = totalStichera;
          }
          const menaionCount        = licStichera.length;
          const resurrectionalCount = totalStichera - menaionCount;
          const allVerses           = Array.from({ length: totalStichera }, (_, i) => totalStichera - i);
          if (resurrectionalCount === 0) {
            lic.slots = [];
          } else {
            lic.slots[0].verses = allVerses.slice(0, resurrectionalCount);
            lic.slots[0].count  = resurrectionalCount;
            // Only hand the displaced doxastichon to the slot when the numbered
            // stichera alone can't fill it — otherwise the tone's own 6 suffice.
            const resHymns = Array.isArray(resNode?.hymns) ? resNode.hymns.length : 6;
            if (displacedGlory && resurrectionalCount > resHymns) {
              lic.slots[0].appendHymns = [displacedGlory];
            }
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
          //
          // Weekday Daily Vespers ships `lic.now: null` from calendar-rules;
          // when a Menaion doxastichon is injected here, point `lic.now` at
          // the Octoechos LIC weekday Theotokion (sung-eve-keyed, week tone)
          // so the Glory/Now split renders correctly. Without this, every
          // weekday-saint Vespers collapses Glory+Now and drops the Theotokion.
          if (!lic.now && isWeekdayInjection && !isGreatVespers && !isVigilFeast) {
            const weekTone = calendarEntry.liturgicalContext?.tone;
            const eve      = VESPERS_SUNG_EVE[calendarEntry.dayOfWeek] || calendarEntry.dayOfWeek;
            if (weekTone && eve) {
              lic.now = {
                source: 'octoechos',
                key:    `tone${weekTone}.${eve}.vespers.lordICall.theotokion`,
                tone:   weekTone,
                label:  'Theotokion',
              };
            }
          }
          lic.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.lordICall.glory`, tone: licGlory.tone, label: primary.title, combinesGloryNow: !lic.now };
          autoSlot.lordICall.glory = { text: licGlory.text, tone: licGlory.tone, label: licGlory.label };
        }
      }

      // Inject Menaion aposticha stichera when available
      let apostStichera = sticheraData?.[0]?.stichera.filter(
        // Same exclusion as Lord-I-Call above: a Stavrotheotokion is an
        // alternative for the Now-and-ever, never a numbered sticheron.
        s => s.section === 'aposticha' && s.order >= 1
          && s.groupRole !== 'stavrotheotokion'
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
          // Great feast or no Octoechos base: replace slots with Menaion stichera.
          // A Great Feast's aposticha takes PROPER verses; the assembler otherwise
          // falls back to the ordinary Ps. 122 table (Transfiguration printed
          // "To Thee I lift up mine eyes" instead of "Tabor and Hermon shall
          // rejoice"). Verses are indexed from the second sticheron — the first
          // carries none — so slot i takes verse i-1.
          const feastVerses = isGreatFeast
            ? GREAT_FEAST_VARIANTS[calendarEntry.liturgicalContext.greatFeast]?.apostichaVerses
            : null;
          apost.slots = apostStichera.map((s, i) => ({
            position: i + 1,
            source:   'menaion', provenance: menaionProvenance,
            key:      `auto.${date}.aposticha.hymns.${i}`,
            tone:     s.tone,
            label:    primary.title,
            ...(i >= 1 && feastVerses?.[i - 1] ? { verse: feastVerses[i - 1] } : {}),
          }));
          // Add repeatPrevious placeholders only when fewer than 3 stichera are available
          while (apost.slots.length < 3) {
            apost.slots.push({ position: apost.slots.length + 1, repeatPrevious: true });
          }
        }

        // Triodion / Pentecostarion Sundays: the calendar entry already ships
        // a glory + now in matching tones (e.g. Publican-Pharisee, Prodigal,
        // Forgiveness). The Triodion's doxastichon wins over the Menaion
        // saint's. Skip the Menaion glory override on those days.
        const triodionOwnsGlory = apost.glory && (
          apost.glory.source === 'triodion' || apost.glory.source === 'pentecostarion'
          || (typeof apost.glory.key === 'string'
              && (apost.glory.key.startsWith('triodion.') || apost.glory.key.startsWith('pentecostarion.')))
        );

        if (apostGlory && !triodionOwnsGlory) {
          apost.glory = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.glory`, tone: apostGlory.tone, label: primary.title, combinesGloryNow: isGreatFeast };
          // Saturday: set the saint's own Theotokion (menaion order=-1) if present
          //   — that's the "Now and ever" of the feast, distinct from the
          //   Octoechos resurrectional Theotokion of the week. NA Saints
          //   Sunday (6-14) is the worked example. Otherwise fall back to
          //   the Octoechos Theotokion of the week's tone.
          // Weekday: the calendar entry ships the Octoechos aposticha
          //   theotokion in the WEEK tone, but Slavic rubric is that the
          //   aposticha theotokion follows the tone of the saint's
          //   doxastichon. Re-key into tone-of-glory + sung-eve so Wed/Fri
          //   eves still get a stavrotheotokion when applicable.
          if (isSaturdayInjection && !isGreatFeast) {
            // A Stavrotheotokion (Theotokion at the Cross) belongs to Wed/Fri, the
            // days that commemorate the Crucifixion — never to a Sunday, whose
            // Theotokion is resurrectional. Many Menaion order=-1 rows carry the
            // Stavrotheotokion as the saint's alternative; skip those and fall
            // through to the Octoechos Theotokion of the Glory tone.
            const apostNow = sticheraData?.[0]?.stichera.find(
              s => s.section === 'aposticha' && s.order === -1
                && s.groupRole !== 'stavrotheotokion'
            );
            if (apostNow) {
              apost.now = { source: 'menaion', provenance: menaionProvenance, key: `auto.${date}.aposticha.now`, tone: apostNow.tone, label: 'Theotokion' };
              autoSlot.aposticha.now = { text: apostNow.text, tone: apostNow.tone, label: apostNow.label };
            } else {
              // Slavic rubric: aposticha Theotokion follows the tone of the
              // saint's doxastichon (Glory tone), not the week tone. All 8
              // `tone${T}.saturday.vespers.aposticha.theotokion` slots exist in
              // octoechos.json, so this is a simple re-key (parallel to the
              // weekday-injection branch below).
              apost.now = { source: 'octoechos', key: `tone${apostGlory.tone}.saturday.vespers.aposticha.theotokion`, tone: apostGlory.tone, label: 'Theotokion' };
            }
          } else if (isWeekdayInjection && (!isGreatVespers || calendarEntry.vespers?.serviceType === 'all-night-vigil')) {
            // Weekday Daily Vespers AND weekday-eve vigil-rank Vespers (Three
            // Hierarchs Fri-eve, Forerunner Nativity Wed-eve, Sts Peter & Paul
            // Mon-eve). For vigil-rank the calendar entry ships an empty
            // aposticha (slots: 0, now: undefined); for non-vigil weekday the
            // calendar entry ships an Octoechos Theotokion at the WEEK tone.
            // Either way, re-key/add the Now slot at the Glory tone + sung-eve
            // weekday — Slavic rubric for both shapes.
            //
            // The comment here used to claim "the saint's-own order=-1
            // Theotokion would have been used above if present". That was false:
            // the branch above is guarded by `isSaturdayInjection`, so on a
            // weekday the Menaion's own order=-1 was never consulted and the
            // Octoechos Theotokion always won. Inside an afterfeast the source
            // plainly appoints the feast's sticheron there — 1-13 and 8-12 both
            // print "Both now ..., of the feast" at Vespers on a weekday.
            // Fixed 2026-08-29 (backlog N15).
            //
            // A Stavrotheotokion (Theotokion at the Cross) belongs to the days
            // that commemorate the Crucifixion — liturgical Wednesday and
            // Friday. Many Menaion order=-1 rows carry one as the saint's
            // alternative; on any other weekday skip it and fall through to the
            // Octoechos, mirroring the Saturday branch above.
            const dow = calendarEntry.dayOfWeek;
            const crossDay = dow === 'wednesday' || dow === 'friday';
            const apostNowWeekday = sticheraData?.[0]?.stichera.find(
              s => s.section === 'aposticha' && s.order === -1
                && (crossDay || s.groupRole !== 'stavrotheotokion')
            );
            if (apostNowWeekday) {
              apost.now = {
                source: 'menaion', provenance: menaionProvenance,
                key:    `auto.${date}.aposticha.now`,
                tone:   apostNowWeekday.tone,
                label:  'Theotokion',
              };
              autoSlot.aposticha.now = {
                text:  apostNowWeekday.text,
                tone:  apostNowWeekday.tone,
                label: apostNowWeekday.label,
              };
            } else {
              const eve = VESPERS_SUNG_EVE[calendarEntry.dayOfWeek] || calendarEntry.dayOfWeek;
              apost.now = {
                source: 'octoechos',
                key:    `tone${apostGlory.tone}.${eve}.vespers.aposticha.theotokion`,
                tone:   apostGlory.tone,
                label:  'Theotokion',
              };
            }
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

      const slots = calendarEntry.vespers.troparia.slots;
      if (slots.length === 0) {
        // Daily-Vespers / vigil-rank shape: spec ships no troparia. Emit the
        // saint's troparion as the leading (un-positioned) slot, and append a
        // Now-and-ever dismissal Theotokion in the tone of the troparion so
        // the section renders as `[troparion] → [Glory now and ever] →
        // [Theotokion]` per OCA Daily Vespers rubric. (For vigil rank,
        // repeatThrice in the troparia renderer filters out the position:'now'
        // slot and sings the order:1 troparion three times — correct shape.)
        slots.push({
          order:    1,
          source:   'menaion', provenance: menaionProvenance,
          key:      `auto.${date}.troparion`,
          tone:     gloryTone,
          label:    gloryLabel,
        });
        slots.push(autoSlot.feastTroparion ? {
          position: 'now',
          source:   'menaion', provenance: menaionProvenance,
          key:      `auto.${date}.feastTroparion`,
          tone:     autoSlot.feastTroparion.tone,
          label:    autoSlot.feastTroparion.label,
        } : {
          position: 'now',
          source:   'octoechos',
          key:      `tone${gloryTone}.saturday.vespers.dismissalTheotokion`,
          tone:     gloryTone,
          label:    'Dismissal Theotokion',
        });
      } else if (slots.some(s => s.position === 'glory')) {
        // Spec already supplies a Glory troparion (e.g. Lenten Saturday
        // Triodion: St Theodore + Soul Saturdays 2–4). Don't splice the
        // Menaion saint on top — would emit two consecutive `Glory` blocks
        // with id `troparion-glory` duplicated. Triodion wins.
      } else {
        // Saturday / Sunday Great Vespers shape: spec already carries the
        // resurrectional troparion (order:1) and dismissal theotokion
        // (position:'now'); splice the saint between them as the Glory.
        const nowIdx   = slots.findIndex(s => s.position === 'now');
        const insertAt = nowIdx !== -1 ? nowIdx : slots.length;
        // Once a Menaion Glory troparion intervenes, the dismissal Theotokion
        // follows the tone of the Glory (saint's troparion), per Slavic rubric
        // "Богородичен по гласу Славы" — the same principle D4 enforces for the
        // Aposticha. The generator authored it at the week tone (no saint yet);
        // re-key to the saint's tone (all 8 dismissal Theotokia exist in the
        // Octoechos). Guarded by D16-vespers-troparia-theotokion-tone.
        if (nowIdx !== -1 && slots[nowIdx].source === 'octoechos') {
          slots[nowIdx] = autoSlot.feastTroparion ? {
            ...slots[nowIdx],
            source:      'menaion', provenance: menaionProvenance,
            key:         `auto.${date}.feastTroparion`,
            tone:        autoSlot.feastTroparion.tone,
            label:       autoSlot.feastTroparion.label,
          } : {
            ...slots[nowIdx],
            key:  `tone${gloryTone}.saturday.vespers.dismissalTheotokion`,
            tone: gloryTone,
          };
        }
        slots.splice(insertAt, 0, {
          position: 'glory',
          source:   'menaion', provenance: menaionProvenance,
          key:      `auto.${date}.troparion`,
          tone:     gloryTone,
          label:    gloryLabel,
        });
      }

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
      // A Great Feast suppresses the daily cycle — the weekday patron does not
      // belong in its dismissal (same defect fixed on the Liturgy path in
      // liturgy-from-orthocal.js).
      dayPatron: feastKey ? null : (DAY_PATRONS[dow] || null),
      dismissalIntroit: (feastKey && GREAT_FEAST_VARIANTS[feastKey]?.dismissalIntroit) || null,
      // When a festal introit names the feast, drop the feast from the saints
      // list — otherwise it is announced twice. Mirrors the Liturgy dismissal,
      // which skips feasts[0] for the same reason.
      saints: (calendarEntry.commemorations || [])
        .slice(feastKey && GREAT_FEAST_VARIANTS[feastKey]?.dismissalIntroit ? 1 : 0)
        .slice(0, 3)
        .map(c => c.title),
    };
  }

  const reqSources = Object.assign({}, sources, { db: dbSource, menaion: menaionOverride });
  const blocks = assembleVespers(calendarEntry, vespersFixed, reqSources, { rubrics: opts.rubrics });

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
