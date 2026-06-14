'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

const { _litOpeningDoxology, _litGreatLitany }                              = require('./liturgy-parts/opening');
const { _litFeastAntiphon, _litTypicalAntiphon1, _litTypicalAntiphon2,
        _litLittleLitany, _litBeatitudes }                                  = require('./liturgy-parts/antiphons');
const { _litSmallEntrance, _litEntranceHymn,
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

  // ── LITURGY OF THE CATECHUMENS ─────────────────────────────────────────────

  // 1. Opening Doxology
  blocks.push(..._litOpeningDoxology(liturgyFixed));

  // 1b. Paschal Troparion (Pascha through Leavetaking)
  if (spec.paschalOpening) {
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
  } else if (spec.paschalAntiphons12) {
    // Paschal period: Paschal psalm antiphons for 1st/2nd, Beatitudes for 3rd
    blocks.push(..._litFeastAntiphon(spec.paschalAntiphons12.first, 'First Antiphon', 'a1'));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litFeastAntiphon(spec.paschalAntiphons12.second, 'Second Antiphon', 'a2'));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed));
  } else {
    blocks.push(..._litTypicalAntiphon1(liturgyFixed));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation1', 'ant1'));
    blocks.push(..._litTypicalAntiphon2(liturgyFixed));
    blocks.push(makeBlock('only-begotten-son', 'Second Antiphon', 'hymn', 'choir',
      liturgyFixed['only-begotten-son']));
    blocks.push(..._litLittleLitany(liturgyFixed, 'exclamation2', 'ant2'));
    blocks.push(..._litBeatitudes(spec.beatitudes, liturgyFixed));
  }

  // 6. Small Entrance
  blocks.push(..._litSmallEntrance(liturgyFixed));

  // 7. Entrance Hymn
  blocks.push(..._litEntranceHymn(spec.entranceHymn));

  // 8. Troparia
  blocks.push(..._litTroparia(spec.troparia));

  // 9. Kontakia
  blocks.push(..._litKontakia(spec.kontakia));

  // 9b. Short litany before the Trisagion — Slavonic parish form.
  //   Deacon: "Let us pray to the Lord."   Choir: "Lord, have mercy."
  //   Deacon: "O Lord, save the pious."    Choir: "O Lord, save the pious."
  //   Deacon: "And hear us."               Choir: "And hear us."
  //   Priest: "...And unto ages of ages."  Choir: "Amen."
  // The priest's "For Holy art Thou, O our God..." prayer is said silently
  // here; only its closing clause is audible.
  blocks.push(makeBlock('pre-tris-pray-d',  'Kontakia', 'prayer',   'deacon', 'Let us pray to the Lord.'));
  blocks.push(makeBlock('pre-tris-pray-c',  'Kontakia', 'response', 'choir',  'Lord, have mercy.'));
  blocks.push(makeBlock('pre-tris-pious-d', 'Kontakia', 'prayer',   'deacon', 'O Lord, save the pious.'));
  blocks.push(makeBlock('pre-tris-pious-c', 'Kontakia', 'response', 'choir',  'O Lord, save the pious.'));
  blocks.push(makeBlock('pre-tris-hear-d',  'Kontakia', 'prayer',   'deacon', 'And hear us.'));
  blocks.push(makeBlock('pre-tris-hear-c',  'Kontakia', 'response', 'choir',  'And hear us.'));
  blocks.push(makeBlock('pre-tris-ages-d',  'Kontakia', 'prayer',   'priest', 'And unto ages of ages. Amen.'));
  blocks.push(makeBlock('pre-tris-amen',    'Kontakia', 'response', 'choir',  'Amen.'));

  // 10. Trisagion
  blocks.push(..._litTrisagion(spec.trisagion, liturgyFixed));

  // 11. Prokeimenon
  blocks.push(..._litProkeimenon(spec.prokeimenon));

  // 12. Epistle
  blocks.push(..._litEpistle(spec.epistle));

  // 13. Alleluia
  blocks.push(..._litAlleluia(spec.alleluia));

  // 14. Gospel
  blocks.push(..._litGospel(spec.gospel));

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
  blocks.push(..._litLitaniesFaithful(liturgyFixed));

  // ── LITURGY OF THE FAITHFUL ────────────────────────────────────────────────

  // 19. Cherubic Hymn (Great Thursday / Great Saturday have substitutions)
  if (spec.cherubicOverride) {
    const cherubicKey = `cherubic-${spec.cherubicOverride}`;
    const cherubicLabel = spec.cherubicOverride === 'great-thursday' ? 'Mystical Supper Hymn'
      : 'Let All Mortal Flesh Keep Silence';
    blocks.push(makeBlock('cherubic-hymn', cherubicLabel, 'hymn', 'choir',
      liturgyFixed[cherubicKey]));
  } else {
    // Standard Cherubic Hymn — Part 1 before the Great Entrance, Part 2 after
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    blocks.push(makeBlock('cherubic-rubric', section, 'rubric', null,
      'Sung slowly and very softly:'));
    blocks.push(makeBlock('cherubic-part1', section, 'hymn', 'choir', ch.part1));
    blocks.push(makeBlock('cherubic-amen', section, 'response', 'choir', ch.amen));
  }

  // 20. Great Entrance
  blocks.push(..._litGreatEntrance(liturgyFixed));

  // 19b. Cherubic Hymn — Part 2 (after the Great Entrance)
  if (!spec.cherubicOverride) {
    const ch = liturgyFixed['cherubic-hymn'];
    const section = 'Cherubic Hymn';
    blocks.push(makeBlock('cherubic-rubric2', section, 'rubric', null,
      'Then more quickly, with strength:'));
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
  const paschalCommunionOrder = (
    calendarDay.liturgicalContext?.season === 'brightWeek' ||
    calendarDay.liturgicalContext?.season === 'pentecostarion'
  );
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

  // 33. Blessed be the Name
  blocks.push(..._litBlessedBeTheName(liturgyFixed));

  // 33a. Closing Doxology — "Glory to Thee, O Christ our God and our hope..."
  blocks.push(..._litClosingDoxology(spec.paschalOpening));

  // 34. Psalm 33
  blocks.push(..._litPsalm33(liturgyFixed));

  // 35. Dismissal Troparia
  blocks.push(..._litDismissalTroparia(isBasil, liturgyFixed, spec.dismissalTroparia));

  // 36. Dismissal
  blocks.push(..._litDismissal(spec.dismissal, isBasil, spec.paschalOpening, liturgyFixed));

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleLiturgy;
