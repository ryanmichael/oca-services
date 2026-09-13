'use strict';

// Parallel to L15 for the Alleluia. On every ordinary-time Sunday Liturgy
// the Alleluia section must contain a hymn at the Octoechos cycle tone
// (assembled.tone). Polyeleos+ saints falling on Sunday co-celebrate a
// festal alleluia at their own tone — presence check, not all-match.

module.exports = {
  id:             'L20-sunday-alleluia-tone',
  family:         'structure',
  severity:       'high',
  description:    'Sunday Alleluia section contains a hymn at the Octoechos cycle tone.',
  needsAssembled: true,
  appliesTo: (ctx) => {
    if (ctx.service !== 'liturgy') return false;
    if (ctx.dow !== 'sunday') return false;
    if (ctx.season !== 'ordinaryTime') return false;
    // The Sunday Before the Exaltation (the Sunday in Sept 7-13) sings its own
    // Tone-1 alleluia IN PLACE of the Octoechos pair — the assumption this
    // rule encodes is exactly what was wrong there (2026-09-13). L41 owns that
    // day's alleluia identity; a date window, not a label, keeps the two from
    // overlapping.
    const md = (ctx.date || '').slice(5);
    if (md >= '09-07' && md <= '09-13') return false;
    return true;
  },
  check: (ctx) => {
    const expectedTone = ctx.assembled?.tone;
    if (!expectedTone) return [];

    const label = (ctx.assembled?.liturgicalLabel || '').toLowerCase();
    if (/transfiguration|nativity of (christ|our lord)|theophany|elevation of the cross|meeting of (the )?lord|annunciation|ascension/.test(label)) {
      return [];
    }

    const allHymns = (ctx.assembled?.blocks || [])
      .filter(b => b.section === 'Alleluia' && b.type === 'hymn' && b.tone != null);
    if (!allHymns.length) return [];

    if (allHymns.some(b => b.tone === expectedTone)) return [];
    const tones = allHymns.map(b => b.tone).join(', ');
    return [{
      message: `Sunday Alleluia section has no hymn at the Octoechos tone (expected tone ${expectedTone}, got tone(s) ${tones}).`,
      hint:    'Alleluia selector is reading a different tone than the Octoechos selector — check the liturgy alleluia builder.',
    }];
  },
};
