'use strict';

// Parallel to L15/L20 for Matins. On every ordinary-time Sunday Matins the
// Prokeimenon section must contain a hymn at the Octoechos cycle tone
// (assembled.tone). Polyeleos+ saints + festal Sundays may co-celebrate a
// second festal prokeimenon at their own tone — presence check, not
// all-match.

module.exports = {
  id:             'M14-matins-prokeimenon-tone',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Matins Prokeimenon section contains a hymn at the Octoechos cycle tone.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'matins') return false;
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
      .filter(b => b.section === 'Matins Prokeimenon' && b.type === 'hymn' && b.tone != null);
    if (!prokHymns.length) return [];

    if (prokHymns.some(b => b.tone === expectedTone)) return [];
    const tones = prokHymns.map(b => b.tone).join(', ');
    return [{
      message: `Sunday Matins Prokeimenon has no hymn at the Octoechos tone (expected tone ${expectedTone}, got tone(s) ${tones}).`,
      hint:    'Matins prokeimenon selector is reading a different tone than the Octoechos selector.',
    }];
  },
};
