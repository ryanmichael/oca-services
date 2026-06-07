'use strict';

const makeBlock = require('./_shared/make-block');
const warnings  = require('./_shared/warnings');

const { _litTroparia, _litKontakia }                                  = require('./liturgy-parts/entrance');
const { _litTrisagion }                                                = require('./liturgy-parts/trisagion');
const { _litProkeimenon, _litEpistle, _litAlleluia, _litGospel }       = require('./liturgy-parts/readings');
const { _litCommunionHymn }                                            = require('./liturgy-parts/communion');
const { _litAugmentedLitany }                                          = require('./liturgy-parts/litanies');
const { _litLordsPrayer }                                              = require('./liturgy-parts/anaphora');
const { _litThanksgiving }                                             = require('./liturgy-parts/thanksgiving');
const { _litGreatLitany }                                              = require('./liturgy-parts/opening');
const { _litLittleLitany }                                             = require('./liturgy-parts/antiphons');

// Strip priest-only blocks from a litany so a deacon-led-only variant doesn't
// emit prayers (silent or aloud) that only a presbyter can pronounce. The
// orphan choir "Amen" following such an exclamation is also dropped.
function _stripPriestBlocks(blocks) {
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].speaker === 'priest') {
      // Skip the priest block; if the next block is a choir "Amen" answering it,
      // skip that too.
      const next = blocks[i + 1];
      if (next && next.speaker === 'choir' && /amen/i.test(next.text || '')) i++;
      continue;
    }
    out.push(blocks[i]);
  }
  return out;
}

// Pull a text value whether the spec stores it as a string or as { text }.
function _pullText(v)  { return (v && typeof v === 'object') ? v.text : v; }

/**
 * Assembles Reader's Typika or Reader's Typika with Communion of the Reserved
 * Gifts for a given calendar day. Variable propers (troparia, kontakia,
 * prokeimenon, Apostle, alleluia, Gospel, communion hymn) are pulled from the
 * same calendarDay.liturgy spec consumed by assembleLiturgy — Typika reuses
 * the existing Orthocal + buildLiturgyFromOrthocal resolution path.
 *
 * @param {Object} calendarDay   - Parsed calendar entry (must include .liturgy)
 * @param {Object} liturgyFixed  - Parsed fixed-texts/liturgy-fixed.json
 * @param {Object} typikaFixed   - Parsed fixed-texts/typika-fixed.json
 * @param {Object} vespersFixed  - Parsed fixed-texts/vespers-fixed.json (for trisagion+heavenlyKing+ourFather)
 * @param {Object} sources       - { octoechos, triodion, menaion, ... }
 * @param {Object} [opts]
 * @param {('reader'|'deacon'|'crg')} [opts.variant='reader'] - Convenience
 *     shorthand: 'reader' = no clergy, 'deacon' = deacon present (no CRG),
 *     'crg' = deacon present + Communion of the Reserved Gifts. May also be
 *     set explicitly via opts.hasDeacon / opts.includeCRG.
 * @param {boolean} [opts.hasDeacon]   - Deacon present (overrides variant).
 * @param {boolean} [opts.includeCRG]  - Splice in the CRG block (overrides variant).
 * @returns {ServiceBlock[]}
 */
function assembleTypika(calendarDay, liturgyFixed, typikaFixed, vespersFixed, sources, opts = {}) {
  warnings.reset();
  // Two independent axes — derive from explicit opts.hasDeacon / opts.includeCRG
  // when set, otherwise from opts.variant. 'crg' implies both; 'deacon' just
  // hasDeacon; 'reader' (or anything else) leaves both off.
  const hasDeacon  = (opts.hasDeacon  != null) ? !!opts.hasDeacon
                   : (opts.variant === 'crg' || opts.variant === 'deacon');
  const includeCRG = (opts.includeCRG != null) ? !!opts.includeCRG
                   : (opts.variant === 'crg');
  const spec    = calendarDay.liturgy || {};
  const blocks  = [];
  const S = (id, section, type, speaker, text, extras) =>
    blocks.push(makeBlock(id, section, type, speaker, text, extras));

  // ── 1. Opening ─────────────────────────────────────────────────────────────
  S('typ-opening', 'Opening', 'prayer', 'reader',
    typikaFixed.opening.prayersOfHolyFathers);

  // Paschal-season opening substitution.
  //   - Pascha through Leavetaking of Pascha (spec.paschalOpening = true):
  //     "Christ is risen…" ×3 replaces "Glory to Thee + O Heavenly King".
  //   - Ascension to Pentecost (opts.omitHeavenlyKing): the Heavenly King
  //     prayer is omitted entirely; "Glory to Thee" is still said and a
  //     rubric marks the omission.
  //   - Otherwise: regular sequence. vespers-fixed.prayers.heavenlyKing
  //     bundles "Glory to Thee, our God, glory to Thee." as its prefix, so
  //     no separate Glory-to-Thee block is needed here.
  if (spec.paschalOpening) {
    S('typ-paschal', 'Opening', 'hymn', 'reader',
      'Christ is risen from the dead, trampling down death by death, and upon those in the tombs bestowing life! (Thrice)',
      { label: 'Paschal Troparion' });
  } else if (opts.omitHeavenlyKing) {
    S('typ-glory-thee', 'Opening', 'prayer', 'reader',
      typikaFixed.opening.glory);
    S('typ-hk-omitted', 'Opening', 'rubric', null,
      'During the period between Ascension and Pentecost, the prayer "O Heavenly King" is omitted.');
  } else {
    S('typ-hk', 'Opening', 'prayer', 'reader', vespersFixed.prayers.heavenlyKing);
  }

  // Trisagion sequence (Holy God ×3 / Glory Both now / All-Holy Trinity /
  // Lord have mercy ×3 / Glory Both now / Our Father). Sourced from
  // vespers-fixed.prayers, which is the canonical home for the sequence.
  const vTris = vespersFixed.prayers.trisagion;
  S('typ-tris-1', 'Trisagion Prayers', 'prayer', 'reader',
    vTris + ' (Thrice)');
  S('typ-tris-gn1', 'Trisagion Prayers', 'prayer', 'reader',
    'Glory to the Father, and to the Son, and to the Holy Spirit, both now and ever, and unto the ages of ages. Amen.');
  S('typ-tris-mht', 'Trisagion Prayers', 'prayer', 'reader',
    vespersFixed.prayers.mostHolyTrinity);
  S('typ-tris-lhm3', 'Trisagion Prayers', 'response', 'reader',
    'Lord, have mercy. (Thrice)');
  S('typ-tris-gn2', 'Trisagion Prayers', 'prayer', 'reader',
    'Glory to the Father, and to the Son, and to the Holy Spirit, both now and ever, and unto the ages of ages. Amen.');
  S('typ-tris-of', 'Trisagion Prayers', 'prayer', 'reader',
    vespersFixed.prayers.ourFather);
  // No priestly doxology; reader closes with "Through the prayers..."
  S('typ-tris-pof', 'Trisagion Prayers', 'prayer', 'reader',
    typikaFixed.opening.prayersOfHolyFathers);

  S('typ-come', 'Opening', 'prayer', 'reader',
    typikaFixed.opening.comeLetUsWorship);

  // ── 1b. Great Litany (deacon present only) ────────────────────────────────
  // Canonical opening litany of the Divine Liturgy — "In peace let us pray
  // to the Lord..." When a deacon serves at Reader's Typika, the parish
  // ordinarily prays the full Great Litany here.
  if (hasDeacon) {
    blocks.push(..._stripPriestBlocks(_litGreatLitany(liturgyFixed)));
  }

  // ── 2. First Antiphon (Psalm 102) ──────────────────────────────────────────
  const a1 = liturgyFixed['typical-antiphon-1'];
  {
    const section = 'First Antiphon (Psalm 102)';
    a1.verses.forEach((v, i) =>
      S(`a1-v${i}`, section, 'verse', 'choir', v));
    S('a1-glory', section, 'doxology', 'choir',
      `${a1.glory} ${a1.gloryRefrain || ''}`.trim());
  }

  // Little Litany between First and Second Antiphons (deacon present only).
  if (hasDeacon) {
    blocks.push(..._stripPriestBlocks(_litLittleLitany(liturgyFixed, 'exclamation1', 'ant1')));
  }

  // ── 3. Second Antiphon (Psalm 145) ─────────────────────────────────────────
  const a2 = liturgyFixed['typical-antiphon-2'];
  {
    const section = 'Second Antiphon (Psalm 145)';
    a2.verses.forEach((v, i) =>
      S(`a2-v${i}`, section, 'verse', 'choir', v));
    S('a2-glory', section, 'doxology', 'choir', a2.glory);
    S('only-begotten-son', section, 'hymn', 'choir',
      liturgyFixed['only-begotten-son']);
  }

  // Little Litany between Second Antiphon and Beatitudes (deacon present only).
  if (hasDeacon) {
    blocks.push(..._stripPriestBlocks(_litLittleLitany(liturgyFixed, 'exclamation2', 'ant2')));
  }

  // ── 4. Beatitudes (Reader's Typika form: verses + "In Thy Kingdom" refrain) ─
  // The Liturgy version interleaves canon-derived troparia between verses;
  // Reader's Typika uses only the fixed "In Thy Kingdom remember us" refrain.
  {
    const section = 'The Beatitudes';
    // verses[0] = "In Thy Kingdom" refrain itself
    // verses[1..10] = 10 Gospel verses (Matt 5:3–12, ending with "Rejoice...")
    // verses[11] = Glory, verses[12] = Both now (unused — we use the dedicated
    // typikaFixed Glory/Both-now strings, which are scoped to the refrain block).
    const verses  = liturgyFixed.beatitudes.verses;
    const refrain = typikaFixed.beatitudeRefrains.inThyKingdom;
    // Rubric so it's unambiguous to the choir that the refrain follows every verse.
    S('beat-rubric', section, 'rubric', null,
      'The choir sings the refrain "In Thy Kingdom remember us, O Lord, when Thou comest in Thy Kingdom" after each verse.');
    S('beat-refrain-0', section, 'response', 'choir',
      `${refrain} (Thrice)`, { label: 'Refrain' });
    for (let i = 1; i <= 10; i++) {
      S(`beat-v${i}`, section, 'verse',    'choir', verses[i]);
      S(`beat-r${i}`, section, 'response', 'choir', refrain, { label: 'Refrain' });
    }
    S('beat-glory',    section, 'doxology', 'choir',
      typikaFixed.beatitudeRefrains.glory);
    S('beat-r-glory',  section, 'response', 'choir', refrain, { label: 'Refrain' });
    S('beat-bothnow',  section, 'doxology', 'choir',
      typikaFixed.beatitudeRefrains.bothNow);
    S('beat-r-bothnow',section, 'response', 'choir', refrain, { label: 'Refrain' });
  }

  // ── 5. Troparia + Kontakia (from the Liturgy spec) ─────────────────────────
  blocks.push(..._litTroparia(spec.troparia));
  blocks.push(..._litKontakia(spec.kontakia));

  // ── 6. Trisagion (before the readings) ─────────────────────────────────────
  // Skip the Slavonic pre-Trisagion dialogue (Let us pray to the Lord / Save
  // the pious / hear us / unto ages) — that belongs to clergy. Just sing
  // Trisagion (or substitution per spec.trisagion). Then drop the closing
  // "Peace be unto all" / "And to thy spirit" blessing — that's a priestly
  // prerogative not exercised by reader or deacon-alone.
  const trisBlocks = _litTrisagion(spec.trisagion, liturgyFixed)
    .filter(b => b.id !== 'tris-peace' && b.id !== 'tris-peace-resp');
  blocks.push(...trisBlocks);

  // ── 7. Prokeimenon, Apostle, Alleluia, Gospel ──────────────────────────────
  // Reuse Liturgy reading helpers. They render the deacon's "Wisdom! / Let us
  // attend!" framing. When no deacon serves, swap deacon/priest → reader.
  const readingBlocks = [
    ..._litProkeimenon(spec.prokeimenon),
    ..._litEpistle(spec.epistle),
    ..._litAlleluia(spec.alleluia),
    ..._litGospel(spec.gospel),
  ]
  // Drop the priest's "Peace be unto thee" blessing after the Epistle —
  // addressed by a priest TO the reader, not said by the reader or deacon.
  .filter(b => b.id !== 'ep-peace' && b.id !== 'ep-peace-r');
  if (!hasDeacon) {
    for (const b of readingBlocks) {
      if (b.speaker === 'deacon') b.speaker = 'reader';
      if (b.speaker === 'priest') b.speaker = 'reader';
    }
  }
  blocks.push(...readingBlocks);

  // Skip Homily (no clergy preaching at Reader's Typika).

  // ── 7b. Augmented Litany (deacon present only) ─────────────────────────────
  // Canonically this is the Litany of Fervent Supplication after the Gospel
  // sequence. Priest exclamations are stripped since no priest serves.
  if (hasDeacon) {
    blocks.push(..._stripPriestBlocks(_litAugmentedLitany(liturgyFixed)));
  }

  // ── 8. After the Gospel ────────────────────────────────────────────────────
  {
    const section = 'After the Gospel';
    S('ag-lhm40', section, 'response', 'all',
      typikaFixed.afterGospel.lordHaveMercy40);
    S('ag-gn', section, 'doxology', 'reader',
      typikaFixed.afterGospel.gloryBothNow);
    S('ag-mh', section, 'prayer', 'reader',
      typikaFixed.afterGospel.moreHonorable);
    S('ag-pof', section, 'prayer', 'reader',
      typikaFixed.afterGospel.prayersOfHolyFathers);
    const mht = typikaFixed.afterGospel.mostHolyTrinity;
    S('ag-mht', section, 'prayer', 'reader', _pullText(mht));
  }

  // ── 9. Creed ───────────────────────────────────────────────────────────────
  S('typ-creed', 'The Creed', 'prayer', 'all', liturgyFixed.creed);

  // ── 10. After-Creed prayer (Remit, pardon...) + Our Father ────────────────
  S('typ-remit', 'After the Creed', 'prayer', 'reader',
    typikaFixed.afterCreed.remitPardon);
  // Deacon-led Litany before the Lord's Prayer when a deacon serves. Strip
  // priest exclamations and the helper's own emission of the Lord's Prayer
  // text (typ-of below covers it).
  if (hasDeacon) {
    blocks.push(..._stripPriestBlocks(_litLordsPrayer(false, liturgyFixed))
      .filter(b => b.id !== 'lords-prayer'));
  }
  S('typ-of', "The Lord's Prayer", 'prayer', 'all',
    liturgyFixed['lords-prayer'].text);
  S('typ-of-doxology', "The Lord's Prayer", 'prayer', 'reader',
    typikaFixed.afterCreed.doxologyByReader);

  // ── 11. [CRG only] Communion of the Reserved Gifts ─────────────────────────
  if (includeCRG) {
    const section = 'Communion of the Reserved Gifts';
    const cr = typikaFixed.communionReserved;
    const pc = liturgyFixed['pre-communion'];

    S('crg-draw',  section, 'prayer',   'deacon', _pullText(cr.drawNear));
    S('crg-blessed', section, 'hymn',   'choir',  cr.choirResponse);

    // The "I believe O Lord, and I confess" pre-Communion prayer is said by
    // all communicants together. Use Chrysostom's wording from liturgy-fixed.
    S('crg-believe', section, 'prayer', 'all', pc['prayer-chrysostom']);

    // Deacon's bidding formula spoken as each communicant receives. PROVISIONAL
    // wording per typika-fixed _note.
    S('crg-bidding', section, 'prayer', 'deacon',
      _pullText(cr.deaconCommunionBidding));

    // Communion hymn (Koinonikon of the day) sung during distribution.
    blocks.push(..._litCommunionHymn(spec.communionHymn));

    // Post-Communion choir hymns from liturgy-fixed.
    S('crg-seen-light', section, 'hymn', 'choir', liturgyFixed['we-have-seen']);
    S('crg-let-mouths', section, 'hymn', 'choir', liturgyFixed['let-our-mouths']);

    // Reader's short thanksgiving.
    S('crg-thanks', section, 'prayer', 'reader',
      _pullText(cr.readerPostCommunion));

    // Deacon-led Litany of Thanksgiving — Communion has actually been
    // distributed, so the deacon may say the petitions. Strip priest exclamation.
    blocks.push(..._stripPriestBlocks(_litThanksgiving(false, liturgyFixed)));
  }

  // ── 12. Closing ────────────────────────────────────────────────────────────
  const closing = typikaFixed.closing;
  S('typ-bbn', 'Closing', 'response', 'reader',
    `${_pullText(closing.blessedBeTheName)} (×${closing.blessedBeTheName.repetitions || 3})`);

  // Psalm 33
  const ps33 = liturgyFixed['psalm-33'];
  if (ps33.rubric) {
    S('typ-ps33-rubric', 'Psalm 33', 'rubric', null, ps33.rubric);
  }
  S('typ-ps33-text', 'Psalm 33', 'prayer', 'reader', ps33.text, { density: 'compact' });
  if (ps33.glory) {
    S('typ-ps33-glory', 'Psalm 33', 'doxology', 'reader', ps33.glory);
  }

  // Reader's dismissal sequence
  S('typ-glory-christ', 'Dismissal', 'prayer', 'reader',
    closing.gloryToTheeOChrist);
  S('typ-dismiss-glory', 'Dismissal', 'doxology', 'reader',
    closing.glory);
  S('typ-dismiss-lhm', 'Dismissal', 'response', 'reader',
    closing.lordHaveMercyThrice);
  S('typ-dismiss-final', 'Dismissal', 'prayer', 'reader',
    _pullText(closing.readerDismissal));

  blocks._warnings = warnings.get();
  return blocks;
}

module.exports = assembleTypika;
