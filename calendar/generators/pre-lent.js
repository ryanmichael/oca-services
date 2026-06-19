/**
 * Pre-Lenten (Triodion) Sunday + Meatfare Saturday Vespers generator.
 *
 *   - Publican & Pharisee Sunday
 *   - Prodigal Son Sunday
 *   - Meatfare Saturday (Soul Saturday structure)
 *   - Meatfare Sunday (Judgment)
 *   - Forgiveness Sunday (Cheesefare)
 *
 * Extracted from calendar-rules.js as Track D Step 8d.
 */

'use strict';

const { nowIso, SATURDAY_GREAT_VESPERS_PROKEIMENON } = require('../vespers-shared');

function generatePreLentenDay(dateStr, dow, tone, litKey) {
  const NAMES = {
    'triodion.publicanPharisee':  'Sunday of the Publican and Pharisee',
    'triodion.prodigalSon':       'Sunday of the Prodigal Son',
    'triodion.meatfareSaturday':  'Meatfare Saturday — Memorial for All the Departed',
    'triodion.meatfareSunday':    'Meatfare Sunday — Judgment Sunday',
    'triodion.forgivenessSunday': 'Forgiveness Sunday (Cheesefare Sunday)',
  };
  const name = NAMES[litKey] || `Pre-Lenten ${dow}`;
  const tk = `tone${tone}`;

  // ── Meatfare Saturday — Soul Saturday structure ─────────────────────────
  if (litKey === 'triodion.meatfareSaturday') {
    return {
      _meta: { generated: true, generatedAt: nowIso(),
               note: `Auto-generated ${name}. Variable texts (source:'db') keyed by '${litKey}'.` },
      date: dateStr, dayOfWeek: 'saturday',
      liturgicalContext: { season: 'preLenten', tone, toneSource: 'octoechosCycle' },
      commemorations: [],
      vespers: {
        serviceType: 'greatVespers',
        rubricNote: `${name} — Great Vespers (sung on Friday evening)`,
        lordICall: {
          tone,
          totalStichera: 6,
          slots: [{ verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' }],
          glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
          now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Dogmatikon' },
        },
        prokeimenon: { pattern: 'soulSaturday' },
        aposticha: {
          slots: [
            { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
            { position: 2, repeatPrevious: true },
            { position: 3, repeatPrevious: true },
          ],
          glory: { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone },
          now:   { source: 'db', key: `${litKey}.vespers.aposticha.now`,   tone, label: 'Theotokion' },
        },
        troparia: {
          source: 'db',
          slots: [
            { order: 1,          tone, source: 'db', key: `${litKey}.vespers.troparia` },
            { position: 'glory', tone, source: 'db', key: `${litKey}.vespers.troparia` },
            { position: 'now',   tone, source: 'db', key: `${litKey}.vespers.troparia.now`   },
          ],
        },
      },
    };
  }

  // ── Triodion Sundays — Great Vespers ────────────────────────────────────
  return {
    _meta: { generated: true, generatedAt: nowIso(),
             note: `Auto-generated ${name}. Tone ${tone}. Variable texts (source:'db') keyed by '${litKey}'.` },
    date: dateStr, dayOfWeek: 'sunday',
    liturgicalContext: { season: 'preLenten', tone, toneSource: 'octoechosCycle' },
    commemorations: [],
    vespers: {
      serviceType: 'greatVespers',
      rubricNote: `${name} — Great Vespers (sung on Saturday evening)`,
      lordICall: {
        tone,
        totalStichera: 6,
        slots: [
          { verses: [6, 5, 4, 3, 2, 1], count: 6, source: 'db', key: `${litKey}.vespers.lordICall`, tone, label: 'Stichera' },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.lordICall.glory`, tone },
        now:   { source: 'octoechos', key: `${tk}.saturday.vespers.dogmatikon`, tone, label: 'Dogmatikon' },
      },
      prokeimenon: { ...SATURDAY_GREAT_VESPERS_PROKEIMENON },
      aposticha: {
        slots: [
          { position: 1, source: 'db', key: `${litKey}.vespers.aposticha`, tone, label: 'Sticheron' },
          { position: 2, repeatPrevious: true },
          { position: 3, repeatPrevious: true },
        ],
        glory: { source: 'db', key: `${litKey}.vespers.aposticha.glory`, tone },
        now:   { source: 'db', key: `${litKey}.vespers.aposticha.now`,   tone, label: 'Theotokion' },
      },
      troparia: {
        source: 'db',
        slots: [
          { order: 1,          tone, source: 'db', key: `${litKey}.vespers.troparia` },
          { position: 'glory', tone, source: 'db', key: `${litKey}.vespers.troparia.glory` },
          { position: 'now',   tone, source: 'octoechos', key: `${tk}.saturday.vespers.dismissalTheotokion`, label: 'Dismissal Theotokion' },
        ],
      },
    },
  };
}

module.exports = { generatePreLentenDay };
