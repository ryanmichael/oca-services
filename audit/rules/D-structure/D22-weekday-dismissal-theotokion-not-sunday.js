'use strict';

const path = require('path');
const OCTOECHOS = require(path.join(__dirname, '..', '..', '..', 'variable-sources', 'octoechos.json'));

// Weekday dismissal Theotokion must be the DAILY one, not Sunday's (discovered
// 2026-10-02 from the choir director's 10-07 Daily Vespers sheet, which appoints
// the Thursday Theotokion "O Pure Theotokos and gate of eternal life" where we
// printed the Saturday/resurrectional one).
//
// Until 2026-10-02 `dismissalTheotokion` existed ONLY under `saturday` in all 8
// tones, in both octoechos.json and octoechos-myrrhbearers.json, and for-date.js
// hardcoded `tone${T}.saturday.vespers.dismissalTheotokion`. Every weekday
// Vespers therefore closed with Sunday's hymn — at the correct tone, which is
// why 203 of 365 dates shipped wrong while every tone-based rule (D4, D16) and
// every presence-based rule passed clean.
//
// This asserts against the DATA, not a label: it collects the 8 Saturday
// Theotokion texts and fails if one of them is rendered on an evening that has a
// daily Theotokion of its own. A label check would not have caught the original
// bug, because the slot label read "Dismissal Theotokion" throughout — correct
// in both the broken and the fixed state.

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// The evenings our source covers (keyed by CIVIL EVENING, per octoechos.json
// _meta.weekdayVespersConvention). Friday evening (liturgical Saturday) has no
// daily Theotokion in our source and legitimately falls back — see
// _meta.knownGaps['friday.vespers.dismissalTheotokion']. Saturday evening is
// liturgical Sunday, where the resurrectional hymn is correct.
const COVERED_EVES = new Set(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']);
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const saturdayTexts = new Set(
  Object.keys(OCTOECHOS)
    .filter(k => /^tone[1-8]$/.test(k))
    .map(k => OCTOECHOS[k]?.saturday?.vespers?.dismissalTheotokion?.text)
    .filter(Boolean)
    .map(norm)
);

module.exports = {
  id:             'D22-weekday-dismissal-theotokion-not-sunday',
  family:         'structure',
  severity:       'high',
  description:    "A weekday Vespers must close with its own daily dismissal Theotokion, not the Saturday/resurrectional one. [discovered 2026-10-02, Wed 10-07 choir sheet]",
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    // The API date IS the civil evening the service is sung (Vespers date-shift).
    const d = new Date(`${ctx.date}T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return [];
    const eve = DOW[d.getUTCDay()];
    if (!COVERED_EVES.has(eve)) return [];

    const blocks = ctx.assembled?.blocks || [];
    const trop = blocks.filter(b => b.section === 'Troparia');
    if (!trop.length) return [];

    let nowIdx = -1;
    trop.forEach((b, i) => {
      if (b.type === 'doxology' && /^Now and ever/i.test(b.text || '')) nowIdx = i;
    });
    if (nowIdx === -1) return [];          // presence is D3's job

    const theo = trop.slice(nowIdx + 1).find(b => b.type === 'hymn');
    if (!theo) return [];

    // A festal/afterfeast closing troparion or a saint's own Theotokion
    // legitimately occupies this slot; only the Octoechos appendix is in scope.
    if (theo.source && theo.source !== 'octoechos') return [];

    if (!saturdayTexts.has(norm(theo.text))) return [];

    const expected = OCTOECHOS[`tone${theo.tone}`]?.[eve]?.vespers?.dismissalTheotokion?.text;
    return [{
      message:
        `${eve}-evening Vespers closed with the Saturday/resurrectional dismissal Theotokion ` +
        `(tone ${theo.tone}) instead of the daily one for that evening.`,
      hint: expected
        ? `tone${theo.tone}.${eve}.vespers.dismissalTheotokion exists ("${norm(expected).slice(0, 48)}…") — ` +
          'for-date.js should key the Troparia `now` slot via dailyTheotokionKey(), which maps the ' +
          'liturgical day to its sung evening through VESPERS_SUNG_EVE.'
        : `No tone${theo.tone}.${eve}.vespers.dismissalTheotokion in octoechos.json — source it, ` +
          'or record the gap in _meta.knownGaps.',
    }];
  },
};
