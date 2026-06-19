'use strict';

// Aposticha Theotokion tone match: when a Menaion Glory (doxastichon) is
// followed by a Theotokion, Slavic Vespers rubric requires the Theotokion to
// be sung in the *tone of the doxastichon*, not the week tone. Today's
// 8139b3f shipped the fix in for-date.js; this rule guards against a
// regression where someone re-keys to the week tone or a static value.
//
// The rule is best-effort: when block labels don't expose tones, we skip.

module.exports = {
  id:             'D4-vespers-aposticha-theotokion-tone',
  family:         'structure',
  severity:       'high',
  description:    'When the Aposticha has a Menaion Glory, the trailing Theotokion must be in the tone of the Glory (not the week tone).',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const apost = blocks.filter(b => b.section === 'Aposticha');
    if (!apost.length) return [];

    // Find the Glory doxology + the following hymn (the Menaion doxastichon).
    const gloryIdx = apost.findIndex(b =>
      b.type === 'doxology' &&
      /^Glory to the Father/i.test(b.text || '') &&
      !/now and ever/i.test(b.text || '')
    );
    if (gloryIdx === -1) return [];

    const gloryHymn = apost.slice(gloryIdx + 1).find(b => b.type === 'hymn');
    if (!gloryHymn || gloryHymn.tone == null) return [];

    // Skip when Glory is sourced from the Triodion or Pentecostarion — those
    // books legitimately pair their doxastichon with a forefeast/feast
    // Theotokion in a different tone (e.g. Publican-Pharisee Sat-eve Vespers
    // pairs the penitential Glory in Tone 5 with the Meeting-of-the-Lord
    // forefeast Theotokion in Tone 2). The tone-match rubric applies to
    // Menaion-injected Glory, not Triodion/Pentecostarion-supplied Glory.
    if (/^from the (Lenten Triodion|Pentecostarion|Triodion)/i.test(gloryHymn.label || '')) return [];

    // Find the following Theotokion hymn.
    const theoHymn = apost.slice(gloryIdx + 1).find(b =>
      b.type === 'hymn' && /theotokion/i.test(b.label || '')
    );
    if (!theoHymn || theoHymn.tone == null) return [];

    // Skip when the Theotokion comes from the Triodion/Pentecostarion —
    // those books supply a forefeast/feast Theotokion at the section's
    // authored tone, distinct from the Glory doxastichon's tone.
    // Example: 02-21 Cheesefare-prep, Menaion Glory "for the Forerunner"
    // (Tone 2) paired with Triodion "Adam ate the forbidden fruit" (Tone 6).
    if (theoHymn.source === 'triodion' || theoHymn.source === 'pentecostarion') return [];
    // Skip when the Theotokion is the saint's own (menaion order=-1) —
    // authored as a pair with the saint's doxastichon and may legitimately
    // sit at a different tone. Example: 06-13 NA Saints Sun (Glory Tone 4,
    // saint's-own Theotokion Tone 5). The tone-match rubric applies to
    // Octoechos-appendix Theotokion lookups, not saint's-own pairings.
    if (theoHymn.source === 'menaion') return [];

    if (theoHymn.tone === gloryHymn.tone) return [];
    return [{
      message: `Aposticha Theotokion tone ${theoHymn.tone} does not match Glory tone ${gloryHymn.tone}.`,
      hint:    'Re-key apost.now to `tone${apostGlory.tone}.${eve}.vespers.aposticha.theotokion` when injecting the Menaion glory (see commit 8139b3f).',
    }];
  },
};
