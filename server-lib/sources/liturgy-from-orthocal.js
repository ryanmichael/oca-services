'use strict';

// Builds a liturgy spec object from orthocal.info API data. Used when no
// hand-authored liturgy key exists for the date.
//
// Provides: variant, entrance hymn, epistle (with full text), gospel (with full text),
//           megalynarion, communion hymn, dismissal (with day-of-week patron),
//           troparia/kontakia from Octoechos + Menaion DB.

const {
  calculatePascha,
  getDayOfWeek,
  getFeastRank,
  getGreatFeastKey,
  getLiturgicalSeason,
  getLiturgyVariant,
  getTone,
  getTrisagionSubstitution,
  isSoulSaturday,
  getWeekOfLent,
} = require('../../calendar-rules');

const { getMenaionRanked }      = require('./menaion');
const { buildBeatitudesTroparia } = require('./beatitudes');

// Per-commemoration overrides applied when the Menaion DB injects a known
// troparion or kontakion. Lookup is by exact menaion title. Lets us swap the
// translation/wording for hymns where the DB's translation differs from the
// parish wording. Keyed on title; each entry may override the troparion text,
// kontakion text, tone, or the rubric prefix. Source attribution lives in the
// value so the choice is auditable.
//
// HTM = Holy Transfiguration Monastery, Boston — the classic "crimson and
// fine linen" rendering of the Synaxis of All Saints troparion (Greek
// πορφύρα → crimson rather than purple). Default chosen because the OCA
// wording from Orthocal reads "purple and linen", but several parishes (and
// most published booklets) sing the HTM wording.
const MENAION_HYMN_OVERRIDES = {
  'Synaxis of All Saints': {
    _source: 'HTM-Boston',
    troparion: {
      tone: 4,
      text: 'As with crimson and fine linen is Thy Church adorned throughout the world with the blood of Thy Martyrs; through them she crieth out to Thee, O Christ God: Send down upon Thy people Thy compassions, grant peace to Thy commonwealth, and to our souls great mercy.',
    },
    kontakion: {
      tone: 8,
      text: 'As first-fruits of nature unto the Planter of created things, the world doth offer to Thee, O Lord, the God-bearing Martyrs. By their entreaties, through the Theotokos, preserve Thy Church and the fullness thereof in profound peace, O most merciful One.',
    },
  },
};
const {
  GREAT_FEAST_VARIANTS,
  PENTECOSTARION_SUNDAY_OVERRIDES,
  COCELEBRATED_OVERLAYS,
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
} = require('./propers');

const { pickPrincipalByOrthocalOrder, applyPrincipalOverride } = require('./menaion-principal');

// Falls back from the menaion DB's `saint_type` column when it's missing —
// most commonly on "Uncovering of the relics of …", "Translation of the relics
// of …", "Repose of …", "Glorification of …" rows where the scraper left
// saint_type blank but the saint's category is clear from the title text.
// Order matters: check more-specific terms (Hieromartyr) before less-specific
// (Bishop, Hierarch, Martyr).
function inferSaintTypeFromTitle(title) {
  if (!title) return null;
  if (/Hieromartyr/i.test(title))                            return 'hieromartyr';
  if (/\bVenerable\b/i.test(title))                          return 'monastic';
  if (/\bApostle/i.test(title))                              return 'apostle';
  if (/\bProphet\b/i.test(title))                            return 'prophet';
  if (/\b(Bishops?|Archbishops?|Patriarchs?|Metropolitans?|Popes?|Hierarchs?)\b/i.test(title)) return 'hierarch';
  if (/\bMartyr/i.test(title))                               return 'martyr';
  return null;
}

/** Joins saint titles with commas and a trailing "and" for the troparion/kontakion
 *  rubric when multiple commemorations share a hymn (e.g. "X, Y, and Z"). */
function joinTitles(titles) {
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(', ')}, and ${titles[titles.length - 1]}`;
}

/** Dedup key for grouping commemorations that share a troparion/kontakion.
 *
 * For commemorations without a saint_type (feasts, synaxes): byte-exact text
 * is the only safe key — two distinct feasts may share part of a hymn.
 *
 * For typed saints (prophet/hierarch/monastic/martyr/etc): the General Menaion
 * uses the same template across saints of a type, with only a vocative name
 * substituted ("O our holy father Methodius/Elisha/Niphon, pray to Christ…").
 * Bucket by (saint_type, tone, first sentence) — distinct troparia of the
 * same saint_type don't share opening phrases like "By a flood of tears", so
 * this collapses generic templates without over-merging. */
function dedupKey(commType, tone, text) {
  if (!commType) return `exact\t${tone}\t${text}`;
  const firstSentence = (text.split(/[.!?\n]/)[0] || '').trim();
  return `template\t${commType}\t${tone}\t${firstSentence}`;
}

// Given orthocal's list of readings for a service-source, return the primary
// reading and the secondary reading per OCA practice. Special-cycle overrides
// (Sunday-before/after-X, Forefathers, Forefeast, Great Feast on Sunday) come
// from orthocal with description != "" and sit at slot [0]; their presence
// suppresses the regular Sunday-cycle reading in slot [1] (description == "").
// A co-celebrated saint reading further down (description != "") survives as
// the secondary. When the primary itself is empty-desc (regular cycle), the
// next reading is the secondary regardless of its description.
//
// When multiple saint-co-celebration readings exist and a principal-title hint
// is provided, prefer the saint reading whose description-keyword overlaps the
// principal commemoration title (e.g., "Angels" wins over "Unmercenaries" when
// the principal is "Synaxis of the Archangel Michael"). Falls back to first
// non-empty-desc reading when no match.
function pickPrimaryAndSecondary(all, principalTitle) {
  const first = all[0] || null;
  if (!first) return [null, null];
  const saintReadings = all.slice(1).filter(r => r.description);
  const pickSaint = () => {
    if (saintReadings.length === 0) return null;
    if (saintReadings.length === 1 || !principalTitle) return saintReadings[0];
    const titleLower = principalTitle.toLowerCase();
    const score = r => {
      const descWords = r.description.toLowerCase().split(/[^a-z]+/).filter(w => w.length > 2);
      let s = 0;
      for (const w of descWords) {
        if (titleLower.includes(w)) { s += 2; continue; }
        // Stem fallback: "Angels" → "angel" matches "archangel"
        if (w.endsWith('s') && titleLower.includes(w.slice(0, -1))) { s += 1; continue; }
        if (w.endsWith('ies') && titleLower.includes(w.slice(0, -3) + 'y')) { s += 1; continue; }
      }
      return s;
    };
    const ranked = saintReadings.slice().sort((a, b) => score(b) - score(a));
    return score(ranked[0]) > 0 ? ranked[0] : saintReadings[0];
  };
  if (first.description) return [first, pickSaint()];
  return [first, pickSaint() || all[1] || null];
}

function buildLiturgyFromOrthocal(orthocalData, dateStr, srcs, style = 'new', opts = {}) {
  // opts.includeLesserSaints — when true, include every Menaion commemoration
  //   with a troparion/kontakion at Liturgy. Default (false) renders only the
  //   principal commemoration (the rank-dictating one — i.e., the saint whose
  //   stichera and rank drove the day's order). Lesser-rank co-commemorations
  //   are dropped from Liturgy troparia/kontakia, matching standard OCA parish
  //   practice (they are still kept at Matins). Patron-of-temple and the
  //   Resurrection troparion/kontakion are layered separately and unaffected.
  // opts.includeSecondGospel — when true, render the secondary (feast or
  //   saint) Gospel alongside the primary (Sunday-cycle) Gospel. Default
  //   (false) renders only the primary, matching standard OCA practice of
  //   reading one Gospel even when a polyeleos+ feast appoints its own. Both
  //   Epistles always render unaffected (Epistle doubling is the norm).
  // opts.includeSecondKoinonikon — when true, render the secondary (saints')
  //   koinonikon attached by a cocelebrated-overlay alongside the principal
  //   one. Default (false) renders only the principal koinonikon, matching
  //   typical OCA parish practice of singing one Communion Verse.
  const includeLesserSaints       = !!opts.includeLesserSaints;
  const includeSecondGospel       = !!opts.includeSecondGospel;
  const includeSecondKoinonikon   = !!opts.includeSecondKoinonikon;

  const [yr, mo, dy] = dateStr.split('-').map(Number);
  const date    = new Date(Date.UTC(yr, mo - 1, dy));
  const dow     = getDayOfWeek(date);
  const tone    = getTone(date);
  const variant = getLiturgyVariant(date, style);
  const isBasil  = variant === 'basil';
  const isSunday = dow === 'sunday';
  const tk       = `tone${tone}`;

  // ── Paschal period detection ────────────────────────────────────────────────
  // "Christ is risen" opening, Paschal megalynarion, and "We Have Seen" replacement
  // apply from Pascha through the Leavetaking (Wed before Ascension = Pascha + 38).
  const pascha = calculatePascha(date.getUTCFullYear());
  const DAY = 86400000;
  const daysSincePascha = Math.round((date - pascha) / DAY);
  const isPaschalPeriod = daysSincePascha >= 0 && daysSincePascha <= 38;
  // Ascension (Pascha+39) through Apodosis of Ascension (Friday before Pentecost = Pascha+47).
  // During this period the Troparion of the Ascension replaces "We have seen the true Light"
  // and is used as the seasonal Theotokos magnification at the dismissal.
  // Source: OCA Department of Liturgical Music & Translations service text (2026-0521-tt.docx).
  const isAscensionAfterfeast = daysSincePascha >= 39 && daysSincePascha <= 47;
  // Pentecost (Pascha+49) through Apodosis of Pentecost (Saturday after Pentecost = Pascha+55).
  // Same substitution rule as Ascension afterfeast: "We have seen the true Light" is replaced
  // by the Troparion of Pentecost. Pascha+48 is the Saturday of Souls before Pentecost — a
  // memorial day, not part of the feast window. Pascha+56 is All Saints Sunday.
  const isPentecostAfterfeast = daysSincePascha >= 49 && daysSincePascha <= 55;

  // Pentecostarion Sunday overrides (defined at module scope, see top).
  const pentOverride = isSunday ? PENTECOSTARION_SUNDAY_OVERRIDES[daysSincePascha] : null;

  // Co-celebrated overlays (defined at module scope, see top).
  const dateKey = `${mo}-${dy}`;
  const overlay = COCELEBRATED_OVERLAYS[dateKey] || null;

  // ── Scripture readings from the API ──────────────────────────────────────────
  const readings   = orthocalData.readings || [];
  const epistleAll = readings.filter(r => r.source === 'Epistle');
  const gospelAll  = readings.filter(r => r.source === 'Gospel');
  // Primary/secondary reading selection happens further down — it needs the
  // principal commemoration title so the saint-co-celebration secondary can
  // be matched against it (resolves cases like Nov 8 where orthocal returns
  // both an "Unmercenaries" and an "Angels" reading and we want "Angels" to
  // win because the principal is Synaxis of the Archangel Michael).
  let epistleR, epistleR2, gospelR, gospelR2;

  // orthocal returns the generic book name "Apostol" for all epistles; the
  // actual book lives in the display field (e.g. "Acts 16.16-34",
  // "Romans 6.18-23"). Derive a proper liturgical announcement from it.
  //   Acts → "the Acts of the Holy Apostles"
  //   Pauline → "the Epistle of the Holy Apostle Paul to the X"
  //   Catholic → "the Epistle of the Holy Apostle X"
  function announceEpistleBook(display) {
    if (!display) return 'Epistle';
    const m = display.match(/^((?:[123] )?[A-Za-z]+)/);
    const book = m ? m[1] : null;
    if (!book) return 'Epistle';
    // Phrasing slots in after "The reading from the " — return the part
    // that follows. (No leading "the".)
    if (/^Acts$/i.test(book)) return 'Acts of the Holy Apostles';
    const paulineMap = {
      Romans: 'Romans',
      '1 Corinthians': 'Corinthians', '2 Corinthians': 'Corinthians',
      Galatians: 'Galatians', Ephesians: 'Ephesians',
      Philippians: 'Philippians', Colossians: 'Colossians',
      '1 Thessalonians': 'Thessalonians', '2 Thessalonians': 'Thessalonians',
      '1 Timothy': 'Timothy', '2 Timothy': 'Timothy',
      Titus: 'Titus', Philemon: 'Philemon', Hebrews: 'Hebrews',
    };
    if (book in paulineMap) {
      return `Epistle of the Holy Apostle Paul to the ${paulineMap[book]}`;
    }
    const catholicMap = {
      James: 'James', '1 Peter': 'Peter', '2 Peter': 'Peter',
      '1 John': 'John', '2 John': 'John', '3 John': 'John', Jude: 'Jude',
    };
    if (book in catholicMap) {
      return `Catholic Epistle of the Holy Apostle ${catholicMap[book]}`;
    }
    return book;
  }

  // Extract full passage text from orthocal's passage[] array
  function extractPassageText(reading) {
    if (!reading?.passage?.length) return null;
    return reading.passage.map(v => v.content).join(' ');
  }

  // ── Great Feast + season detection (needed by troparia, prokeimenon, etc.) ──
  const season = getLiturgicalSeason(date);
  const feastKey = getGreatFeastKey(date, style);
  const feast    = feastKey ? GREAT_FEAST_VARIANTS[feastKey] : null;

  // Menaion principal commemoration — computed once, used by both the
  // troparia/kontakia injection blocks below AND the General Menaion propers
  // attachment further down (polyeleos+ Sundays get a secondary prokeimenon /
  // alleluia / koinonikon keyed off the principal saint's category).
  const ranked       = getMenaionRanked(mo, dy);
  let menaionPrincipal = ranked?.notable
    ? pickPrincipalByOrthocalOrder(ranked.notable, orthocalData, ranked.principal)
    : null;
  // Per-date principal override (applied post-picker, same as Vespers/Matins).
  // Searches ranked.all so an override saint with no troparion is still reachable.
  menaionPrincipal = applyPrincipalOverride(mo, dy, ranked?.all, menaionPrincipal);

  // Now resolve primary/secondary readings. When orthocal returns a special-
  // cycle override as the primary, the regular Sunday-cycle reading is
  // suppressed; a co-celebrated saint reading further down survives. The
  // principal title disambiguates when multiple saint readings exist.
  const principalTitle = menaionPrincipal?.title || feast?.title || null;
  [epistleR, epistleR2] = pickPrimaryAndSecondary(epistleAll, principalTitle);
  [gospelR,  gospelR2 ] = pickPrimaryAndSecondary(gospelAll,  principalTitle);

  // Weekday great-saint feast suppression flag.
  // When a Vigil- or Polyeleos-rank saint falls on a weekday (i.e. not Sunday,
  // and not one of the 12 Great Feasts of the Lord/Theotokos which take the
  // `feast` branch), OCA practice is that the saint's propers REPLACE the
  // daily/weekday cycle rather than layering as a secondary:
  //   - prokeimenon / alleluia / koinonikon: saint becomes primary; daily dropped
  //   - epistle / gospel: feast reading becomes primary; daily dropped
  //   - dismissal: dayPatron commemoration ("bodiless Powers of Heaven" on Mon,
  //     "the Forerunner John" on Tue, etc.) is suppressed
  //
  // The principal-feast troparion/kontakion already replace the day's cycle.
  // This flag closes the symmetric gap for prokeimenon/alleluia/koinonikon/
  // readings/dismissal.
  //
  // Surfaced 2026-06-28 by auditing 2026-06-29 SS Peter and Paul (Monday):
  // weekday-Angels prokeimenon/alleluia/epistle/koinonikon all bleeding through,
  // and the feast Gospel was missing entirely (only the daily Matt 12.9-13).
  const feastRank   = getFeastRank(date, style);
  const isWeekdayGreatSaintFeast = !isSunday
                                   && (feastRank === 'vigil' || feastRank === 'polyeleos')
                                   && !feast && !pentOverride;

  if (isWeekdayGreatSaintFeast) {
    // Promote saint-co-celebration reading to primary; drop the daily.
    // pickPrimaryAndSecondary returns [daily, saint] when first.description is
    // empty and a later entry has a non-empty description. Flip.
    if (epistleR && epistleR2 && !epistleR.description && epistleR2.description) {
      [epistleR, epistleR2] = [epistleR2, null];
    }
    if (gospelR && gospelR2 && !gospelR.description && gospelR2.description) {
      [gospelR, gospelR2] = [gospelR2, null];
    }
  }

  // ── Troparia & Kontakia ──────────────────────────────────────────────────────
  // Great Feasts & Pentecostarion feast Sundays: use only the feast's own
  // troparia/kontakia (no resurrectional, no Menaion).
  const troparia = [];
  const kontakia = [];
  const feastOnly = !!feast?.troparia || !!(pentOverride?.feastOnly);

  if (feast?.troparia) {
    troparia.push(...feast.troparia);
  } else if (pentOverride?.troparia) {
    troparia.push(...pentOverride.troparia);
  } else if (!feastOnly) {
    // Start with resurrectional troparion (Sundays)
    const troparionRaw  = srcs.octoechos?.[tk]?.saturday?.vespers?.troparion;
    const troparionText = typeof troparionRaw === 'object' ? troparionRaw?.text : troparionRaw;
    if (isSunday && troparionText) {
      troparia.push({ tone, rubric: `Troparion of the Resurrection, Tone ${tone}:`, text: troparionText });
    }

    // Inject Menaion troparia from DB.
    // Group by troparion text so commemorations sharing a generic troparion
    // (e.g. the "By a flood of tears..." monastic troparion used by every
    // venerable) collapse into a single combined rubric like
    // "Troparion of Methodius of Peshnosha, Elisha of Suma, and Niphon of Athos, Tone 8:"
    // — matching OCA OOS practice when multiple saints share a hymn.
    if (ranked?.notable) {
      const sourceComms = includeLesserSaints
        ? ranked.notable
        : (menaionPrincipal ? [menaionPrincipal] : []);
      const groups = new Map();  // key -> { tone, text, titles: [] }
      for (const comm of sourceComms) {
        const trop = comm.troparia.find(t => t.type === 'troparion');
        if (!trop) continue;
        const ovr  = MENAION_HYMN_OVERRIDES[comm.title]?.troparion;
        const tone = ovr?.tone ?? trop.tone;
        const text = ovr?.text ?? trop.text;
        const key  = dedupKey(comm.saint_type, tone, text);
        if (groups.has(key)) {
          groups.get(key).titles.push(comm.title);
        } else {
          groups.set(key, { tone, text, titles: [comm.title] });
        }
      }
      for (const { tone, text, titles } of groups.values()) {
        troparia.push({ tone, rubric: `Troparion of ${joinTitles(titles)}, Tone ${tone}:`, text });
      }
    }
  }

  if (feast?.kontakia) {
    kontakia.push(...feast.kontakia);
  } else if (pentOverride?.kontakia) {
    kontakia.push(...pentOverride.kontakia);
  } else if (!feastOnly) {
    // Start with resurrectional kontakion (Sundays)
    const kontakionRaw = srcs.octoechos?.[tk]?.saturday?.vespers?.kontakion;
    if (isSunday && kontakionRaw) {
      const kText = typeof kontakionRaw === 'object' ? kontakionRaw.text : kontakionRaw;
      const kTone = typeof kontakionRaw === 'object' ? (kontakionRaw.tone ?? tone) : tone;
      if (kText) kontakia.push({ tone: kTone, rubric: `Kontakion of the Resurrection, Tone ${kTone}:`, text: kText });
    }

    // Inject Menaion kontakia from DB. Group by text like troparia above so
    // shared kontakia (less common but possible for paired saints) collapse.
    if (ranked?.notable) {
      const sourceComms = includeLesserSaints
        ? ranked.notable
        : (menaionPrincipal ? [menaionPrincipal] : []);
      const groups = new Map();
      for (const comm of sourceComms) {
        const kont = comm.troparia.find(t => t.type === 'kontakion');
        if (!kont) continue;
        const ovr  = MENAION_HYMN_OVERRIDES[comm.title]?.kontakion;
        const tone = ovr?.tone ?? kont.tone;
        const text = ovr?.text ?? kont.text;
        const key  = dedupKey(comm.saint_type, tone, text);
        if (groups.has(key)) {
          groups.get(key).titles.push(comm.title);
        } else {
          groups.set(key, { tone, text, titles: [comm.title] });
        }
      }
      for (const { tone, text, titles } of groups.values()) {
        kontakia.push({ tone, rubric: `Kontakion of ${joinTitles(titles)}, Tone ${tone}:`, text });
      }
    }
  }

  // If no kontakia at all, add the default Theotokos kontakion as the final kontakion
  // (OCA rubric: when no other kontakion is appointed, "O protection of Christians..." is sung)
  // This is already handled by the dismissal troparia section, so leave kontakia empty if none found.

  // Layer co-celebrated saints onto troparia/kontakia. The saint's troparion is
  // appended after the feast troparion; the saint's kontakion is inserted BEFORE
  // the feast kontakion (per OCA combined-service layout — "Glory…" then saint
  // kontakion, then "Now and ever…" then feast kontakion).
  if (overlay?.troparion) {
    troparia.push(overlay.troparion);
  }
  if (overlay?.kontakion && kontakia.length > 0) {
    // Force "Now and ever..." connector onto the feast kontakion (was implicit default)
    kontakia[0] = { ...kontakia[0], connector: 'Now and ever, and unto ages of ages. Amen.' };
    kontakia.unshift(overlay.kontakion);
  } else if (overlay?.kontakion) {
    kontakia.push(overlay.kontakion);
  }

  // Communion hymn, Sunday/weekday/Lenten prokeimena and alleluia maps are loaded
  // at module scope from variable-sources/daily-propers.json. See top of file.

  // ── Cherubic Hymn override ───────────────────────────────────────────────────
  let cherubicOverride = null;
  if (season === 'holyWeek' && dow === 'thursday') cherubicOverride = 'great-thursday';
  if (season === 'holyWeek' && dow === 'saturday') cherubicOverride = 'great-saturday';

  // ── Build prokeimenon & alleluia ────────────────────────────────────────────
  let prokeimenon = null;
  let alleluia = null;

  // Determine Lenten Sunday key (if applicable)
  let lentenKey = null;
  if (isSunday && season === 'greatLent') {
    lentenKey = getWeekOfLent(date);
  } else if (isSunday && season === 'preLenten') {
    const pascha = calculatePascha(date.getUTCFullYear());
    const DAY = 86400000;
    const cheesefareDate = new Date(pascha.getTime() - 49 * DAY);
    const meatfareDate   = new Date(pascha.getTime() - 56 * DAY);
    if (date.getTime() === cheesefareDate.getTime()) lentenKey = 'cheesefare';
    if (date.getTime() === meatfareDate.getTime())   lentenKey = 'meatfare';
  }

  // Great Feast / Pentecostarion Sunday prokeimenon/alleluia override (highest priority)
  if (feast?.prokeimenon) {
    const fp = feast.prokeimenon;
    prokeimenon = { tone: fp.tone, refrain: fp.refrain, verse: fp.verse };
  } else if (pentOverride?.prokeimenon) {
    const pp = pentOverride.prokeimenon;
    prokeimenon = { tone: pp.tone, refrain: pp.refrain, verse: pp.verse };
  } else if (lentenKey !== null && LENTEN_SUNDAY_PROKEIMENA[lentenKey]) {
    const lp = LENTEN_SUNDAY_PROKEIMENA[lentenKey];
    prokeimenon = { tone: lp.tone, refrain: lp.refrain, verse: lp.verse };
    // Lenten commemoration Sundays (Palamas week 2, Climacus 4, Mary of Egypt 5)
    // sing the saint's proper prokeimenon in addition to the Sunday cycle.
    // Secondary is authored in daily-propers.json against the general-menaion
    // hierarch/monastic common. Cross Sunday (week 3) and Orthodoxy (week 1)
    // are self-contained — no secondary.
    if (lp.secondary) prokeimenon.secondary = { ...lp.secondary };
  } else if (isSunday && SUNDAY_PROKEIMENA[tone]) {
    const sp = SUNDAY_PROKEIMENA[tone];
    prokeimenon = { tone, refrain: sp.refrain, verse: sp.verse };
  } else if (!isSunday && !isWeekdayGreatSaintFeast && WEEKDAY_PROKEIMENA[dow]) {
    const wp = WEEKDAY_PROKEIMENA[dow];
    prokeimenon = { tone: wp.tone, refrain: wp.refrain, verse: wp.verse };
  }

  // Attach co-celebrated secondary prokeimenon (e.g., Constantine & Helen on Ascension)
  if (prokeimenon && overlay?.prokeimenon) {
    prokeimenon = { ...prokeimenon, secondary: overlay.prokeimenon };
  }

  // ── Polyeleos+ saint secondary propers ──────────────────────────────────────
  // On polyeleos/vigil Sundays (and weekdays), the General Menaion provides a
  // prokeimenon / alleluia / koinonikon keyed by saint category. Attach as
  // .secondary on top of the Sunday- or weekday-cycle propers. Overlay path
  // wins when both exist on the same date (cocelebration with a Great Feast
  // is already a complete secondary set; layering would double up).
  // On weekday vigil/polyeleos feasts the daily cycle is suppressed above, so
  // we promote the saint propers to PRIMARY rather than attaching as secondary.
  const isPolyeleos = (feastRank === 'polyeleos' || feastRank === 'vigil')
                      && !feast && !pentOverride;
  // Saint category: prefer the DB's saint_type column, but our scraper leaves
  // it blank on "Uncovering / Translation / Repose / Glorification" rows where
  // the type is embedded in the title text (e.g. "Uncovering of the relics of
  // Venerable Sergius of Radonezh" — clearly monastic, but saint_type is null).
  // Infer from the title in that case.
  const gmpKey      = menaionPrincipal?.saint_type
                      || inferSaintTypeFromTitle(menaionPrincipal?.title);
  const gmp         = isPolyeleos && gmpKey ? GENERAL_MENAION_PROPERS[gmpKey] : null;
  const gmpLabel    = gmp && menaionPrincipal ? menaionPrincipal.title : null;
  if (gmp && !prokeimenon && isWeekdayGreatSaintFeast) {
    // Weekday great-saint feast: daily cycle suppressed; gmp becomes primary.
    prokeimenon = { ...gmp.prokeimenon, label: gmpLabel };
  } else if (gmp && prokeimenon && !prokeimenon.secondary) {
    prokeimenon = { ...prokeimenon, secondary: { ...gmp.prokeimenon, label: gmpLabel } };
  }
  // Safety: if we suppressed the weekday cascade but no General Menaion entry
  // exists for this saint's category (Forerunner, Theotokos icons, generic
  // synaxes whose saint_type is null), fall back to the daily prokeimenon
  // rather than emit nothing. Better to render a weekday-cycle prokeimenon
  // than to drop the section.
  if (!prokeimenon && isWeekdayGreatSaintFeast && WEEKDAY_PROKEIMENA[dow]) {
    const wp = WEEKDAY_PROKEIMENA[dow];
    prokeimenon = { tone: wp.tone, refrain: wp.refrain, verse: wp.verse };
  }

  if (feast?.alleluia) {
    const fa = feast.alleluia;
    alleluia = { tone: fa.tone, verses: fa.verses };
  } else if (pentOverride?.alleluia) {
    const pa = pentOverride.alleluia;
    alleluia = { tone: pa.tone, verses: pa.verses };
  } else if (lentenKey !== null && LENTEN_SUNDAY_ALLELUIA[lentenKey]) {
    const la = LENTEN_SUNDAY_ALLELUIA[lentenKey];
    alleluia = { tone: la.tone, verses: la.verses };
    if (la.secondary) alleluia.secondary = { ...la.secondary };
  } else if (isSunday && SUNDAY_ALLELUIA[tone]) {
    alleluia = { tone, verses: SUNDAY_ALLELUIA[tone] };
  } else if (!isSunday && !isWeekdayGreatSaintFeast && WEEKDAY_ALLELUIA[dow]) {
    const wa = WEEKDAY_ALLELUIA[dow];
    alleluia = { tone: wa.tone, verses: wa.verses };
  }

  // ── Entrance hymn: feast override → Paschal period → Sunday → weekday ────
  // From Pascha through the Apodosis of Pascha (daysSincePascha 0..38), OCA
  // Liturgikon prescribes the paschal entrance verse ("In the gathering
  // places bless ye God the Lord, from the wellsprings of Israel…")
  // regardless of day of week. On Pascha day proper this also lands via
  // feast.entranceHymn, but the rest of the cycle previously reverted to
  // "Come, let us worship" — this is the fix.
  let entranceHymn;
  if (feast?.entranceHymn) {
    entranceHymn = { text: feast.entranceHymn };
  } else if (isPaschalPeriod) {
    entranceHymn = { text: GREAT_FEAST_VARIANTS.pascha.entranceHymn };
  } else if (isSunday) {
    entranceHymn = { text: LITURGY_DEFAULTS.entranceHymn.resurrection };
  } else {
    entranceHymn = { text: LITURGY_DEFAULTS.entranceHymn.saints };
  }

  // ── Megalynarion: feast → Paschal period → Basil → typical ─────────────────
  let megalynarion;
  if (feast?.megalynarion) {
    megalynarion = { text: feast.megalynarion };
  } else if (pentOverride?.megalynarion) {
    megalynarion = { text: pentOverride.megalynarion };
  } else if (isPaschalPeriod) {
    megalynarion = { text: LITURGY_DEFAULTS.paschalMegalynarion };
  } else if (isBasil) {
    megalynarion = 'basil-liturgy';
  } else {
    megalynarion = null;
  }

  // Attach co-celebrated secondary alleluia (e.g., Constantine & Helen on Ascension)
  if (alleluia && overlay?.alleluia) {
    alleluia = { ...alleluia, secondary: overlay.alleluia };
  }
  if (gmp && !alleluia && isWeekdayGreatSaintFeast) {
    alleluia = { ...gmp.alleluia, label: gmpLabel };
  } else if (gmp && alleluia && !alleluia.secondary) {
    alleluia = { ...alleluia, secondary: { ...gmp.alleluia, label: gmpLabel } };
  }
  // Safety fallback (parallel to prokeimenon): weekday daily alleluia when no
  // saint-category propers exist for this rank.
  if (!alleluia && isWeekdayGreatSaintFeast && WEEKDAY_ALLELUIA[dow]) {
    const wa = WEEKDAY_ALLELUIA[dow];
    alleluia = { tone: wa.tone, verses: wa.verses };
  }

  // ── Communion hymn: feast → Pentecostarion Sunday → day-of-week ───────────
  let communionHymn;
  if (feast?.communionHymn) {
    communionHymn = { text: feast.communionHymn };
  } else if (pentOverride?.communionHymn) {
    communionHymn = { text: pentOverride.communionHymn };
  } else if (isWeekdayGreatSaintFeast && gmp) {
    // Weekday great-saint feast: saint koinonikon replaces the day-of-week one.
    communionHymn = { ...gmp.communionHymn, label: gmpLabel };
  } else {
    // Includes the safety fallback for weekday great-saint feasts where gmp
    // is null: just use the day-of-week koinonikon.
    communionHymn = { text: COMMUNION_HYMNS[dow] || COMMUNION_HYMNS.sunday };
  }
  if (overlay?.communionHymn && includeSecondKoinonikon) {
    communionHymn = { ...communionHymn, secondary: overlay.communionHymn };
  }
  // Polyeleos+ saint koinonikon — render by default (no opt-in gate). On a
  // polyeleos Sunday the second Communion Verse IS sung at OCA parishes; the
  // cocelebrated-overlay gate is appropriate for principal-feast cases where
  // the feast koinonikon claims the only slot, but not here. On a weekday
  // great-saint feast the saint koinonikon is already primary (above) so
  // there's nothing to attach as secondary.
  if (gmp && !communionHymn.secondary && !isWeekdayGreatSaintFeast) {
    communionHymn = { ...communionHymn, secondary: { ...gmp.communionHymn, label: gmpLabel } };
  }
  // Lenten commemoration Sundays (Palamas week 2, Climacus 4, Mary of Egypt 5)
  // sing the saint's koinonikon in addition to the standard Sunday one.
  if (lentenKey !== null && LENTEN_SUNDAY_COMMUNION && LENTEN_SUNDAY_COMMUNION[lentenKey] && !communionHymn.secondary) {
    communionHymn = { ...communionHymn, secondary: LENTEN_SUNDAY_COMMUNION[lentenKey] };
  }

  // ── Feast antiphons (Lord's feasts only) ──────────────────────────────────
  let feastAntiphons = (feast?.type === 'lord' && feast.antiphons) ? feast.antiphons : null;

  // ── Paschal antiphons for 1st/2nd during Bright Week only ────────────────
  // Most OCA parishes sing Paschal Antiphons (Ps. 65/66) only during Bright
  // Week and revert to Typical Antiphons (Ps. 102/145, "Bless the Lord, O
  // my soul") for the rest of the Paschal period.
  const isBrightWeek = daysSincePascha >= 0 && daysSincePascha <= 6;
  const paschalAntiphons12 = (!feastAntiphons && isBrightWeek)
    ? { first: GREAT_FEAST_VARIANTS.pascha.antiphons.first,
        second: GREAT_FEAST_VARIANTS.pascha.antiphons.second }
    : null;

  // ── Litany for the Departed (Soul Saturdays) ─────────────────────────────
  const includeDepartedLitany = isSoulSaturday(date);

  return {
    variant,
    feastOnly,
    // Curated signal for "principal-feast/polyeleos+ commemoration on this date."
    // Used by the patron-of-temple rubric: when true on a Sunday, the patron's
    // kontakion is dropped (single Glory slot is claimed by the principal saint);
    // when false, the patron holds Glory on simple-rank Sundays.
    hasCocelebratedOverlay: !!overlay,
    feastAntiphons,
    paschalAntiphons12,
    beatitudes: feastAntiphons ? null : { troparia: pentOverride?.beatitudesTroparia || buildBeatitudesTroparia(isSunday, tone, srcs, dateStr) },
    includeDepartedLitany,
    entranceHymn,
    troparia,
    kontakia,
    trisagion: { substitution: getTrisagionSubstitution(date, style) },
    prokeimenon,
    epistle:  epistleR ? {
      book: announceEpistleBook(epistleR.display),
      display: epistleR.display,
      text: extractPassageText(epistleR),
      secondary: epistleR2 ? {
        book: announceEpistleBook(epistleR2.display),
        display: epistleR2.display,
        text: extractPassageText(epistleR2),
      } : null,
    } : null,
    alleluia,
    gospel:   gospelR ? {
      book: gospelR.book,
      display: gospelR.display,
      text: extractPassageText(gospelR),
      // Lenten commemoration Sundays (Palamas week 2, Cross 3, Climacus 4,
      // Mary of Egypt 5) always sing both Gospels per OCA rubric — force the
      // secondary regardless of the parish-level includeSecondGospel opt-in.
      secondary: (gospelR2 && (includeSecondGospel || (lentenKey !== null && ['1','2','3','4','5'].includes(String(lentenKey))))) ? {
        book: gospelR2.book,
        display: gospelR2.display,
        text: extractPassageText(gospelR2),
      } : null,
    } : null,
    megalynarion,
    cherubicOverride,
    communionHymn,
    paschalOpening: isPaschalPeriod,
    weHaveSeen:
      pentOverride?.weHaveSeen
      || (isPaschalPeriod ? 'paschal' : null)
      || (isAscensionAfterfeast ? LITURGY_DEFAULTS.weHaveSeenSubstitutions.ascensionAfterfeast : null)
      || (isPentecostAfterfeast ? LITURGY_DEFAULTS.weHaveSeenSubstitutions.pentecostAfterfeast : null),
    dismissal: {
      // Vigil-rank weekday feasts (Peter & Paul, Forerunner Nativity, Pokrov on
      // a weekday, etc.) read as 'feast' opening — the daily commemoration's
      // dayPatron is suppressed so the saint's own commemoration headlines.
      opening: (feast || isWeekdayGreatSaintFeast) ? 'feast'
             : (isSunday ? 'sunday' : 'weekday'),
      feastLabel: feast?.label || (isWeekdayGreatSaintFeast ? menaionPrincipal?.title : null) || null,
      dayPatron: isWeekdayGreatSaintFeast ? null : (DAY_PATRONS[dow] || null),
      // Dismissal saints: prefer orthocal's "feasts" (major commemorations) over
      // "saints" (minor entries). On a great feast, skip feasts[0] — it's named
      // in the introit. Co-celebrated commemorations (Constantine & Helen on
      // Ascension, etc.) come from feasts[1+]; fall back to minor saints if empty.
      saints: (() => {
        const f = orthocalData.feasts || [];
        const s = orthocalData.saints || [];
        const coCelebrated = feast ? f.slice(1) : f;
        return [...coCelebrated, ...s].slice(0, 3);
      })(),
      // Festal dismissal introit and seasonal Theotokos magnification.
      // Apply on the feast itself and through its afterfeast period.
      dismissalIntroit:
        feast?.dismissalIntroit
        || (isAscensionAfterfeast ? GREAT_FEAST_VARIANTS.ascension.dismissalIntroit : null),
      dismissalTheotokos:
        feast?.dismissalTheotokos
        || (isAscensionAfterfeast ? GREAT_FEAST_VARIANTS.ascension.dismissalTheotokos : null),
    },
    // Dismissal Troparia: repeated after Psalm 33 before the final dismissal.
    // - Great Feast: feast troparion + kontakion (single).
    // - Pentecostarion Sunday with pentOverride: repeat the full set of Liturgy
    //   troparia + kontakia (Sunday's Resurrection + feast troparia, etc.).
    // - Otherwise: fall back to liturgy-saint troparion + default Theotokion
    //   (rendered inside _litDismissalTroparia).
    dismissalTroparia: feast
      ? { troparion: feast.troparia?.[0] || null, kontakion: feast.kontakia?.[0] || null }
      : pentOverride?.troparia
        ? { troparia: troparia, kontakia: kontakia }
        : null,
  };
}

module.exports = { buildLiturgyFromOrthocal };

