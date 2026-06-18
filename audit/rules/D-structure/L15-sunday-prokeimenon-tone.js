'use strict';

// On every ordinary-time Sunday Liturgy the Prokeimenon section must contain
// a hymn at the Octoechos cycle tone (assembled.tone). Polyeleos+ saints
// falling on Sunday co-celebrate a second festal prokeimenon at their own
// tone — that's expected and is why this rule does a *presence* check
// ("at least one prokeimenon hymn at the Octoechos tone") rather than an
// all-hymns-match check.
//
// Excluded: pre-Lenten, Triodion, Great Lent, Bright Week, and Pentecostarion
// — all of those use season-specific prokeimena that don't follow the
// Octoechos cycle.

module.exports = {
  id:             'L15-sunday-prokeimenon-tone',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Prokeimenon tone equals assembled.tone (Octoechos cycle).',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.season !== 'ordinaryTime') return false;
    return true;
  },
  check: (ctx) => {
    const expectedTone = ctx.assembled?.tone;
    if (!expectedTone) return [];

    const label = (ctx.assembled?.liturgicalLabel || '').toLowerCase();
    if (/transfiguration|nativity of (christ|our lord)|theophany|elevation of the cross|meeting of (the )?lord|annunciation|ascension/.test(label)) {
      return [];
    }

    const prokHymns = (ctx.assembled?.blocks || [])
      .filter(b => b.section === 'Prokeimenon' && b.type === 'hymn' && b.tone != null);
    if (!prokHymns.length) return [];

    if (prokHymns.some(b => b.tone === expectedTone)) return [];
    const tones = prokHymns.map(b => b.tone).join(', ');
    return [{
      message: `Sunday Prokeimenon section has no hymn at the Octoechos tone (expected tone ${expectedTone}, got tone(s) ${tones}).`,
      hint:    'Prokeimenon selector is reading a different tone than the Octoechos selector — check the liturgy prokeimenon builder.',
    }];
  },
};
