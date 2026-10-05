'use strict';

const path = require('path');
const { familyOfText, LABEL } =
  require(path.join(__dirname, '..', '..', '..', 'server-lib', 'sources', 'translation-provenance'));

// A service should be sung from the books the parish actually uses — and only
// those.
//
// ── WHY THIS RULE WAS REWRITTEN (2026-10-05) ───────────────────────────────
//
// Its first form counted TRANSLATIONS PER SERVICE and flagged any service with
// more than one. That found the real defect it was written for: on 2026-10-04
// the seven Resurrection stichera were the OCA Obikhod's English beside St
// Hierotheus's three in st-sergius.org's, and a parishioner heard the seam.
//
// But the premise was wrong, and chunk 4 proved it. Moving the weekday cycle to
// the parish's own Daily Octoechos — demonstrably what they sing — made the
// count go UP, 223 to 250, because a weekday now draws the cycle from one book
// and the saint from another. That is CORRECT PRACTICE, not a defect. Before
// the move, weekdays looked clean only because the Octoechos and the saints
// happened to be the same third-party source — an accident of sourcing.
//
// So "one service, one translation" is false. What matters is whether a mix is
// the parish's DECLARED PAIRING or an accident, and that question is asked per
// ROLE and per DAY TYPE:
//
//   * Within a role — the Octoechos hymns, or the Menaion hymns — there should
//     be ONE translation. Two means one saint's hymns sit in a different
//     English from another's, which is always an accident.
//   * A Sunday or Great Feast should be OCA throughout: that is what OCA
//     publishes for those days and what the parish sings. The Hierotheus defect
//     lives here, and is still caught.
//   * A weekday draws its cycle from the Daily Octoechos and its saint from
//     whatever book publishes that saint. Two books, by design — not a finding.

const SUNG_SECTIONS = new Set([
  'Lord, I Have Cried', 'Aposticha', 'Litya', 'Lauds', 'Praises',
]);

// The parish's weekday cycle book. Chunk 4 established this from their own
// sheets: a verbatim match at two tones, bar `thou`->`ye` for plural address.
const WEEKDAY_CYCLE = 'mtmary';

/** Which book a block is drawn from, as opposed to whose English it is. */
function roleOf(block) {
  const s = String(block.source || '');
  if (s === 'octoechos') return 'octoechos';
  if (s === 'menaion') return 'menaion';
  if (s === 'triodion' || s === 'pentecostarion') return 'moveable';
  return null;                      // db/auto/fixed — not a book we track here
}

module.exports = {
  id:             'D23-translation-mix-within-service',
  family:         'structure',
  severity:       'low',
  description:    'A service should draw on the books the parish uses: one translation within each role, and OCA throughout on a Sunday or Great Feast. [discovered 2026-10-03; rewritten 2026-10-05 for expected pairings]',
  needsAssembled: true,

  appliesTo: (ctx) => ctx.service === 'vespers' || ctx.service === 'matins' || ctx.service === 'vigil',

  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];

    // The API date IS the civil evening, so a Saturday evening opens Sunday.
    const d = new Date(`${ctx.date}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return [];
    const opensSunday = d.getUTCDay() === 6;
    const isGreatFeast = !!ctx.assembled?.liturgicalContext?.greatFeast
                      || !!ctx.calendarEntry?.liturgicalContext?.greatFeast;

    // The Daily Octoechos is the book for DAILY Vespers. A Great Vespers or
    // Vigil is festal and draws on OCA, so expecting the parish's daily book
    // there is wrong — that mistake produced 46 false positives of the 47
    // "weekday cycle" findings, 45 of them Friday-evening Great Vespers.
    const serviceName = String(ctx.assembled?.serviceName || '');
    const isDaily     = /Daily Vespers/i.test(serviceName);
    const isFestal    = /Great Vespers|Vigil/i.test(serviceName);

    // role -> family -> { count, sample }
    const byRole = new Map();
    for (const b of blocks) {
      if (b.type !== 'hymn') continue;
      if (!SUNG_SECTIONS.has(b.section || '')) continue;
      const role = roleOf(b);
      if (!role) continue;
      const fam = familyOfText(b.text);
      // 'unknown' is a generated or transformed hymn, not a second translation.
      if (fam === 'unknown') continue;
      if (!byRole.has(role)) byRole.set(role, new Map());
      const fams = byRole.get(role);
      if (!fams.has(fam)) fams.set(fam, { count: 0, sample: b });
      fams.get(fam).count++;
    }
    if (!byRole.size) return [];

    const findings = [];
    const name = (f) => LABEL[f] || f;

    // 1. One translation within a role. Two means one saint's hymns are in a
    //    different English from another's — always an accident.
    for (const [role, fams] of byRole) {
      if (fams.size < 2) continue;
      const parts = [...fams.entries()].sort((a, b) => b[1].count - a[1].count)
        .map(([f, v]) => `${name(f)} x${v.count}`);
      const minority = [...fams.entries()].sort((a, b) => a[1].count - b[1].count)[0];
      findings.push({
        message: `The ${role} hymns draw on ${fams.size} translations: ${parts.join(', ')}.`,
        hint: `Within one book the English should be consistent. The minority is ` +
              `${name(minority[0])} — e.g. "${(minority[1].sample.text || '').replace(/\s+/g, ' ').slice(0, 52)}…". ` +
              'See features/translation-mix.md.',
      });
    }

    // 2. A Sunday or Great Feast is OCA throughout — what OCA publishes for
    //    those days, and what the parish sings. This is the Hierotheus case.
    // A Sunday, a Great Feast, or any festal Great Vespers / Vigil.
    if (opensSunday || isGreatFeast || isFestal) {
      const offenders = [];
      for (const [role, fams] of byRole) {
        for (const [fam, v] of fams) {
          if (fam === 'oca') continue;
          // A festal service falling on a WEEKDAY evening still draws its
          // Octoechos Theotokion from that evening's weekday node — which for
          // this parish is the Daily Octoechos. Six vigils were flagged for a
          // single Stavrotheotokion on exactly that path ("When she beheld Thee
          // nailed upon the Cross"), which is the right hymn from the right
          // book. Expecting OCA there asks the service to draw a weekday hymn
          // from a book that does not print one.
          if (fam === WEEKDAY_CYCLE && role === 'octoechos' && !opensSunday) continue;
          offenders.push({ role, fam, v });
        }
      }
      if (offenders.length) {
        const worst = offenders.sort((a, b) => b.v.count - a.v.count)[0];
        findings.push({
          message: `${opensSunday ? 'Sunday' : (isGreatFeast ? 'Great Feast' : 'Festal')} service draws on ` +
                   `${offenders.map(o => `${name(o.fam)} (${o.role} x${o.v.count})`).join(', ')} ` +
                   'where OCA is expected throughout.',
          hint: `e.g. "${(worst.v.sample.text || '').replace(/\s+/g, ' ').slice(0, 52)}…" ` +
                `(${worst.v.sample.section}). Convert it if files.oca.org publishes that day — ` +
                'see scripts/oca-convert-plan.js.',
        });
      }
      return findings;
    }

    // 3. A weekday: the cycle should come from the parish's Daily Octoechos.
    //    Which book supplies the SAINT is not a finding — that is the expected
    //    pairing, and flagging it is what made this rule's count meaningless.
    // Only a DAILY Vespers draws the weekday cycle from the parish's book.
    if (!isDaily) return findings;

    const octo = byRole.get('octoechos');
    if (octo && octo.size === 1) {
      const [fam, v] = [...octo.entries()][0];
      if (fam !== WEEKDAY_CYCLE) {
        findings.push({
          message: `Weekday cycle is ${name(fam)} (x${v.count}); the parish sings the Daily Octoechos.`,
          hint: `e.g. "${(v.sample.text || '').replace(/\s+/g, ' ').slice(0, 52)}…". ` +
                'Not every node could be converted — see features/daily-octoechos-parse.md.',
        });
      }
    }
    return findings;
  },
};
