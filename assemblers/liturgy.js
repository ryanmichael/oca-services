'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');
const { derivePaschalState } = require('./_shared/paschal-state');

const VALID_CHERUBIC_OVERRIDES = new Set(['great-thursday', 'great-saturday']);

const { _litOpeningDoxology, _litGreatLitany }                              = require('./liturgy-parts/opening');
const { _litFeastAntiphon, _litTypicalAntiphon1, _litTypicalAntiphon2,
        _litLittleLitany, _litBeatitudes }                                  = require('./liturgy-parts/antiphons');
const { _litSmallEntrance, _litEntranceHymn, _litPostAmbonRite,
        _litTroparia, _litKontakia }                                        = require('./liturgy-parts/entrance');
const { _litTrisagion }                                                     = require('./liturgy-parts/trisagion');
const { _litProkeimenon, _litEpistle, _litAlleluia, _litGospel }            = require('./liturgy-parts/readings');
const { _litAugmentedLitany, _litDeparted,
        _litCatechumens, _litLitaniesFaithful }                             = require('./liturgy-parts/litanies');
const { _litGreatEntrance, _litSupplication }                               = require('./liturgy-parts/great-entrance');
const { _litAnaphora, _litLordsPrayer }                                     = require('./liturgy-parts/anaphora');
const { _litPreCommunion, _litCommunionPrayer, _litCommunionHymn,
        _litCommunionOfFaithful, _litPostCommunion }                        = require('./liturgy-parts/communion');
const { _litThanksgiving, _litBlessedBeTheName,
        _litClosingDoxology, _litPsalm33 }                                  = require('./liturgy-parts/thanksgiving');
const { _litDismissalTroparia, _litDismissal }                              = require('./liturgy-parts/dismissal');
const { _litPrayersOfThanksgiving }                                        = require('./liturgy-parts/prayers-of-thanksgiving');

/**
 * Assembles the complete Divine Liturgy for a given calendar day.
 *
 * @param {Object} calendarDay    - Parsed calendar/YYYY-MM-DD.json
 * @param {Object} liturgyFixed   - Parsed fixed-texts/liturgy-fixed.json
 * @param {Object} sources        - { octoechos, triodion, menaion, … }
 * @returns {ServiceBlock[]}
 */
function assembleLiturgy(calendarDay, liturgyFixed, sources, opts = {}) {
  warnings.reset();
  const spec    = calendarDay.liturgy || {};
  const variant = spec.variant || 'chrysostom';
  const isBasil = variant === 'basil';
  const blocks  = [];

  // Single derivation of the paschal-period flags + cross-signal warnings.
  // All paschal branches below read from `paschal`; raw spec.* / season checks
  // should not appear past this point.
  const paschal = derivePaschalState(calendarDay, spec);

  // ── LITURGY OF THE CATECHUMENS ─────────────────────────────────────────────

  // 1. Opening Doxology
  blocks.push(..._litOpeningDoxology(liturgyFixed));

  // 1b. Paschal Troparion (Pascha through Leavetaking)
  if (paschal.hasPaschalOpening) {
    const section = 'Paschal Troparion';
    blocks.push(makeBlock('pt-priest', section, 'prayer', 'priest',
      'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life! (2½ times)'));
    blocks.push(makeBlock('pt-choir', section, 'response', 'choir',
      'and upon those in the tombs bestowing life!'));

  }

  // 2. Great Litany
  blocks.push(..._litGreatLitany(liturgyFixed));

  // 3–5. Antiphons (feast-specific or typical)
  if (spec.feastAntiphons) {
    // Great Feasts of the Lord: special antiphons replace typical psalms + beatitudes
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.first, 'First Antiphon', 'a1'));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.second, 'Second Antiphon', 'a2'));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litFeastAntiphon(spec.feastAntiphons.third, 'Third Antiphon', 'a3'));
  } else if (paschal.hasPaschalAntiphons) {
    // Paschal period: Paschal psalm antiphons for 1st/2nd, Beatitudes for 3rd
    blocks.push(..._litFeastAntiphon(spec.paschalAntiphons12.first, 'First Antiphon', 'a1'));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litFeastAntiphon(spec.paschalAntiphons12.second, 'Second Antiphon', 'a2'));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed, opts));
  } else {
    blocks.push(..._litTypicalAntiphon1(liturgyFixed, opts));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    // See `antiphons.gloryAfterLittleLitany` in liturgy-parts/antiphons.js: the
    // doxology the First Antiphon would otherwise close with is sung here
    // instead, at the end of the Little Litany and before Psalm 145.
    if (opts.rubrics?.antiphons?.gloryAfterLittleLitany === true
        && liturgyFixed['antiphon-glory']) {
      blocks.push(makeBlock('ant1-ll-glory', 'Little Litany', 'doxology', 'choir',
        liturgyFixed['antiphon-glory']));
    }
    blocks.push(..._litTypicalAntiphon2(liturgyFixed));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed, opts));
  }

  // 6. Small Entrance
  blocks.push(..._litSmallEntrance(liturgyFixed));

  // 7. Entrance Hymn
  blocks.push(..._litEntranceHymn(spec.entranceHymn));

  // 8. Troparia
  blocks.push(..._litTroparia(spec.troparia));

  // 9. Kontakia
  blocks.push(..._litKontakia(spec.kontakia));

  // 9b. Short litany before the Trisagion — Slavonic parish form. The priest's
  // "For Holy art Thou, O our God..." prayer is said silently here; only its
  // closing clause is audible. Jurisdictions that omit it (e.g. Greek practice)
  // set `manifest.rubrics.omitPreTrisagionLitany = true`.
  if (!opts.rubrics?.omitPreTrisagionLitany) {
    const ptl = liturgyFixed['pre-trisagion-litany'];
    if (ptl) {
      blocks.push(makeBlock('pre-tris-pray-d',  'Kontakia', 'prayer',   'deacon', ptl.deaconPray));
      blocks.push(makeBlock('pre-tris-pray-c',  'Kontakia', 'response', 'choir',  ptl.choirMercy));
      blocks.push(makeBlock('pre-tris-pious-d', 'Kontakia', 'prayer',   'deacon', ptl.deaconPious));
      blocks.push(makeBlock('pre-tris-pious-c', 'Kontakia', 'response', 'choir',  ptl.choirPious));
      blocks.push(makeBlock('pre-tris-hear-d',  'Kontakia', 'prayer',   'deacon', ptl.deaconHear));
      blocks.push(makeBlock('pre-tris-hear-c',  'Kontakia', 'response', 'choir',  ptl.choirHear));
      blocks.push(makeBlock('pre-tris-ages-d',  'Kontakia', 'prayer',   'priest', ptl.priestAges));
      blocks.push(makeBlock('pre-tris-amen',    'Kontakia', 'response', 'choir',  ptl.choirAmen));
    }
  }

  // 10. Trisagion
  blocks.push(..._litTrisagion(spec.trisagion, liturgyFixed));

  // 11. Prokeimenon
  blocks.push(..._litProkeimenon(spec.prokeimenon));

  // 12. Epistle
  blocks.push(..._litEpistle(spec.epistle, liturgyFixed));

  // 13. Alleluia
  blocks.push(..._litAlleluia(spec.alleluia, liturgyFixed));

  // 14. Gospel
  blocks.push(..._litGospel(spec.gospel, liturgyFixed));

  // 15. Homily (rubric only — no fixed text)
  blocks.push(makeBlock('homily', 'Homily', 'rubric', null,
    'The sermon is delivered at this time.'));

  // 16. Augmented Litany
  blocks.push(..._litAugmentedLitany(liturgyFixed));

  // 16b. Litany for the Departed (optional — Soul Saturdays, memorial services)
  if (spec.includeDepartedLitany) {
    blocks.push(..._litDeparted(liturgyFixed));
  }

  // 17. Litany for the Catechumens
  // Default: always emit, per St Tikhon's Sluzhebnik. Parish overlays may
  // declare seasonal omissions via manifest.rubrics.omitCatechumensSeasons.
  const omitCatSeasons = opts.rubrics?.omitCatechumensSeasons || [];
  const season17 = calendarDay.liturgicalContext?.season;
  if (!omitCatSeasons.includes(season17)) {
    blocks.push(..._litCatechumens(liturgyFixed));
  }

  // 18–19. Litanies of the Faithful
  blocks.push(..._litLitaniesFaithful(liturgyFixed, opts));

  // ── LITURGY OF THE FAITHFUL ────────────────────────────────────────────────

  // 19. Cherubic Hymn (Great Thursday / Great Saturday have substitutions)
  let cherubicOverride = spec.cherubicOverride;
  if (cherubicOverride && !VALID_CHERUBIC_OVERRIDES.has(cherubicOverride)) {
    warnings.push({ source: 'spec', key: 'liturgy.cherubicOverride',
      scope: 'Cherubic Hymn', detail: `unknown override "${cherubicOverride}" — falling back to standard Cherubic Hymn` });
    cherubicOverride = null;
  }
  if (cherubicOverride) {
    const cherubicKey = `cherubic-${cherubicOverride}`;
    const cherubicLabel = cherubicOverride === 'great-thursday' ? 'Mystical Supper Hymn'
      : 'Let All Mortal Flesh Keep Silence';
    blocks.push(makeBlock('cherubic-hymn', cherubicLabel, 'hymn', 'choir',
      liturgyFixed[cherubicKey]));
  } else {
    // Standard Cherubic Hymn — Part 1 before the Great Entrance, Part 2 after
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    if (ch.rubric1) {
      blocks.push(makeBlock('cherubic-rubric', section, 'rubric', null, ch.rubric1));
    }
    blocks.push(makeBlock('cherubic-part1', section, 'hymn', 'choir', ch.part1));
    blocks.push(makeBlock('cherubic-amen', section, 'response', 'choir', ch.amen));
  }

  // 20. Great Entrance
  blocks.push(..._litGreatEntrance(liturgyFixed));

  // 19b. Cherubic Hymn — Part 2 (after the Great Entrance)
  if (!cherubicOverride) {
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    if (ch.rubric2) {
      blocks.push(makeBlock('cherubic-rubric2', section, 'rubric', null, ch.rubric2));
    }
    blocks.push(makeBlock('cherubic-part2', section, 'hymn', 'choir', ch.part2));
    blocks.push(makeBlock('cherubic-alleluia', section, 'hymn', 'choir', ch.alleluia));
  }

  // 21. Litany of Supplication
  blocks.push(..._litSupplication(liturgyFixed));

  // 22. Kiss of Peace + Creed
  const kop = liturgyFixed['kiss-of-peace'];
  blocks.push(makeBlock('kop-call',  'The Creed', 'prayer',   'deacon', kop.deaconCall));
  blocks.push(makeBlock('kop-resp',  'The Creed', 'response', 'choir',  kop.response));
  blocks.push(makeBlock('kop-doors', 'The Creed', 'prayer',   'deacon', kop.doors));
  blocks.push(makeBlock('creed', 'The Creed', 'prayer', 'all',
    liturgyFixed['creed']));

  // 23. Anaphora — includes the Megalynarion / Hymn to the Theotokos at the
  //     liturgically correct point (between the megalynarion cue and the
  //     intercessions exclamation).
  blocks.push(..._litAnaphora(isBasil, liturgyFixed, spec.megalynarion));

  // 25. Litany before Lord's Prayer + Lord's Prayer
  blocks.push(..._litLordsPrayer(isBasil, liturgyFixed));

  // 26. Pre-Communion. During the Paschal period (Bright Week +
  // Pentecostarion), the priest's "In the fear of God, and with faith, draw
  // near!" and the choir's "Blessed is He that comes in the Name of the
  // Lord..." are replaced by a Paschal antiphonal hymn sung in their place.
  // The Communion Hymn (Koinonikon) itself stays in its usual position later.
  const paschalCommunionOrder = paschal.isPaschalSeason;
  // Parish-discretion rubric: when `rubrics.preCommunion.confessFirst` is true,
  // the Communion Prayer ("I believe, O Lord, and I confess...") is sung first,
  // and the priest's "In the fear of God..." + choir's "Blessed is He that
  // comes..." follow. Matches HTM/Jordanville-style parish practice. Default
  // (false) follows the OCA Service Book: "In the fear of God..." first, then
  // "I believe and confess..." said by the approaching communicants.
  const confessFirst = opts.rubrics?.preCommunion?.confessFirst === true && !paschalCommunionOrder;

  // 26. Pre-Communion — peace + bow-prayer + 'One is holy'. (Paschal: also
  //     the Paschal antiphon in place of 'In the fear of God...').
  blocks.push(..._litPreCommunion(isBasil, liturgyFixed,
    { paschal: paschalCommunionOrder, paschalAntiphon: liturgyFixed['paschal-communion-antiphon'] }));

  // 27. Communion Hymn — the appointed Koinonikon + cycling Troparia/Kontakia
  //     labels (reference-only, full text already above). Sung as the clergy
  //     commune behind the curtain.
  blocks.push(..._litCommunionHymn(spec.communionHymn, spec));

  // 28. Communion Prayer — 'In the fear of God...' + 'Blessed is He...' +
  //     'I believe, O Lord, and I confess...'. Order depends on the parish
  //     `confessFirst` rubric; Paschal-period renders only the prayer.
  blocks.push(..._litCommunionPrayer(liturgyFixed,
    { confessFirst, paschal: paschalCommunionOrder }));

  // 28b. Communion of the Faithful — Body of Christ + procession rubric.
  blocks.push(..._litCommunionOfFaithful(spec, liturgyFixed, paschalCommunionOrder));

  // 29. Post-Communion Blessing
  blocks.push(..._litPostCommunion(spec, liturgyFixed));

  // 30. Hymn of Thanksgiving
  blocks.push(makeBlock('hot-always', 'Hymn of Thanksgiving', 'prayer', 'priest',
    liturgyFixed['always-now-and-ever']));
  blocks.push(makeBlock('hot-amen', 'Hymn of Thanksgiving', 'response', 'choir',
    liturgyFixed['amen']));
  blocks.push(makeBlock('let-our-mouths', 'Hymn of Thanksgiving', 'hymn', 'choir',
    liturgyFixed['let-our-mouths']));

  // 31. Litany of Thanksgiving
  blocks.push(..._litThanksgiving(isBasil, liturgyFixed));

  // 32. Prayer behind the Ambon
  const ambonKey = isBasil ? 'prayer-ambon-basil' : 'prayer-ambon-chrysostom';
  blocks.push(makeBlock('prayer-ambon', 'Prayer behind the Ambon', 'prayer', 'priest',
    liturgyFixed[ambonKey], { density: 'compact' }));

  // 32b. Feast rite appended after the Prayer behind the Ambon (Transfiguration:
  //      Blessing of Grapes and Fruit). Flows into "Blessed be the Name" below.
  blocks.push(..._litPostAmbonRite(spec.postAmbonRite, liturgyFixed));

  // 33. Blessed be the Name (×3) — OCA order: Psalm 33 follows before the blessing.
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 34. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 35. Priestly blessing ("The blessing of the Lord be upon you…") + Closing
  //     Doxology ("Glory to Thee, O Christ our God and our hope…").
  blocks.push(..._litClosingDoxology(paschal.hasPaschalOpening, liturgyFixed));

  // 36. Dismissal Troparia (feast / Pentecostarion repeat only; empty otherwise)
  blocks.push(..._litDismissalTroparia(isBasil, liturgyFixed, spec.dismissalTroparia));

  // 37. Dismissal
  blocks.push(..._litDismissal(spec.dismissal, isBasil, paschal.hasPaschalOpening, liturgyFixed));

  // 38. Prayers of Thanksgiving (Appendix II) — read AFTER the dismissal, while
  //     the faithful venerate the cross. Off unless the parish opts in.
  //
  //     The closing troparion is selected from the troparia this service already
  //     resolved, so it comes through the overlay cascade like everything else
  //     rather than being fetched a second way. The feast displaces the temple's
  //     patron: "we would not sing to St John but do the troparion of the feast."
  {
    const troparia = Array.isArray(spec.troparia) ? spec.troparia : [];
    const patronTroparion =
      troparia.find(t => /Patron of the Temple/i.test(String(t?.rubric || ''))) || null;

    // The feast's troparion is found by the STRUCTURAL tag the source already
    // sets (`feastWindow`), not by matching its rubric text. An earlier draft
    // matched the title and silently failed on "Troparion of Afterfeast of the
    // Dormition" — the label is not the structure, which is the recurring
    // lesson in feedback_assert_structure_not_labels.
    //
    // That tag is set only for a GREAT feast's window, which is the same line
    // the patron-insertion already draws: a lesser window (2026-08-30's
    // Beheading) keeps the Church second and does not displace the patron.
    // The source hands us the window's troparion directly (feastWindow.troparion).
    // Falling back to the `feastWindow` tag on a troparia entry covers the
    // window-sings-second shape, which is tagged but may predate the object.
    // Two conditions, both from what the director actually said:
    //   "a feast day or THE WEEK FOLLOWING a feast" — an afterfeast or its
    //   leavetaking. A FOREfeast comes before; she did not speak to it, so it
    //   is left alone and the temple's patron is still sung.
    //   A lesser feast's window does not displace the Church either — the same
    //   line menaion-principal.js draws for "Now and ever…" (2026-08-30's
    //   Beheading is not one of the Twelve).
    const win = spec.feastWindow;
    const windowDisplaces = !!win && win.isGreatFeast === true && win.kind !== 'Forefeast';
    let feastTroparion = (windowDisplaces && win.troparion)
      || troparia.find(t => t && t.feastWindow === true)
      || null;
    if (!feastTroparion && spec.feastOnly) {
      // On a Great Feast the patron logic is skipped upstream, so there is no
      // patron entry to fall back on; the day's troparia are the feast's.
      feastTroparion = troparia.find(t => t && t.text) || null;
    }

    blocks.push(..._litPrayersOfThanksgiving(liturgyFixed, opts.rubrics || {}, {
      patronTroparion, feastTroparion, isBasil,
    }));
  }

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleLiturgy;
