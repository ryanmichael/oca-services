'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');

function handle(req, res, ctx) {
  const url = req.url || '/';
  const pathname = url.split('?')[0];

  const {
    sources, fixedTexts, liturgyFixed, presanctifiedFixed,
    paschalHoursFixed, midnightOfficeFixed, paschalMatinsFixed,
    passionGospelsFixed, bridegroomMatinsFixed, lamentationsFixed,
    vesperalLiturgyFixed, kneelingVespersFixed, royalHoursFixed,
    matinsFixed,
    parseQuery, escHtml, formatDate, serveStatic, loadJSON,
    getCalendarEntry, getNextDateStr,
    getMenaionRanked, getSticheraDay, getMenaionDay, getMenaionDayList,
    getGeneralMenaionTexts, GENERAL_MENAION_FALLBACK,
    GREAT_FEAST_VARIANTS, PENTECOSTARION_SUNDAY_OVERRIDES,
    LITURGICAL_DAY_LABELS, DAY_PATRONS,
    buildMatinsSpec, buildLiturgyFromOrthocal,
    buildDbSource, getDbBlocks, mapDbBlocks,
    openDb, ensureOrthocalCacheTable, fetchOrthocalDay,
    fixedTextRegistry, getOverlayFixed, getLiturgyFixed, getOverlayRubrics,
    getTranslationManifests, tagBlocksWithOverlay, diffOverlay, resolveTranslation,
    assembleForDate, applyYouYour, getDayLabel,
    HOME_CSS, renderHomePage, getCollectedDates,
    formatAssemblyWarning, renderErrorPage, renderServiceHTML,
    buildDashboardData, formatSticheraSource,
    assembleVespers, assembleLiturgy, assemblePresanctified, assemblePaschalHours,
    assembleMidnightOffice, assemblePaschalMatins, assembleBridegroomMatins,
    assemblePassionGospels, assembleLamentations, assembleVesperalLiturgy,
    assembleRoyalHours, assembleMatins, resolveSource,
    generateCalendarEntry, getLiturgicalSeason, getDayOfWeek, getLiturgicalKey,
    getLiturgyVariant, getTone, getTrisagionSubstitution, isLiturgyServed,
    isPresanctifiedDay, isBridegroomMatins, isPassionGospelsDay, isLamentationsDay,
    isVesperalLiturgyDay, isRoyalHoursDay, isBurialVespersDay,
    getWeekOfLent, calculatePascha, getGreatFeastKey, isSoulSaturday, getEothinon,
    renderService, renderVespers, getMatinsKathismata, deduplicateBySource,
  } = ctx;

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
        result = assembleForDate(date, pronoun, entryOverride, fixedTexts, sources);
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

}

module.exports = handle;
