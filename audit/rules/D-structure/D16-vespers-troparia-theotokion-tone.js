'use strict';

// Troparia dismissal-Theotokion tone match (discovered 2026-07-04 auditing
// Sun 07-05 Great Vespers): when a Menaion Glory troparion is spliced into the
// dismissal Troparia, the trailing resurrectional dismissal Theotokion must be
// sung in the *tone of the Glory* (saint's troparion), not the week tone —
// Slavic rubric "Богородичен по гласу Славы". This is the Troparia analogue of
// D4 (which enforces the identical rule for the Aposticha). The bug: the
// Saturday Great Vespers branch in for-date.js spliced the saint's Glory but
// left the `now` dismissal Theotokion at the week tone authored by the calendar
// generator (fixed by re-keying to `tone${gloryTone}...dismissalTheotokion`).
//
// Best-effort: when block labels/tones aren't exposed, we skip.

module.exports = {
  id:             'D16-vespers-troparia-theotokion-tone',
  family:         'structure',
  severity:       'high',
  description:    'When the Troparia has a Menaion Glory troparion, the trailing dismissal Theotokion must be in the tone of the Glory (not the week tone). [discovered 2026-07-04, Sun 07-05]',
  needsAssembled: true,
  appliesTo: (ctx) => ctx.service === 'vespers',
  check: (ctx) => {
    const blocks = ctx.assembled?.blocks || [];
    if (!blocks.length) return [];
    const trop = blocks.filter(b => b.section === 'Troparia');
    if (!trop.length) return [];

    // Find the Glory doxology (not the combined "Glory...now and ever") and
    // the following hymn — the Menaion doxastichon troparion.
    const gloryIdx = trop.findIndex(b =>
      b.type === 'doxology' &&
      /^Glory to the Father/i.test(b.text || '') &&
      !/now and ever/i.test(b.text || '')
    );
    if (gloryIdx === -1) return [];

    const gloryHymn = trop.slice(gloryIdx + 1).find(b => b.type === 'hymn');
    if (!gloryHymn || gloryHymn.tone == null) return [];

    // Only the Menaion-injected Glory triggers the tone-of-Glory rubric.
    // Triodion/Pentecostarion Glory troparia legitimately pair with a
    // feast/forefeast Theotokion at a different tone (parallels D4's guard).
    if (/^from the (Lenten Triodion|Pentecostarion|Triodion)/i.test(gloryHymn.label || '')) return [];
    if (gloryHymn.source === 'triodion' || gloryHymn.source === 'pentecostarion') return [];

    // Find the trailing Theotokion after the "Now and ever" doxology.
    let nowIdx = -1;
    trop.forEach((b, i) => {
      if (b.type === 'doxology' && /^Now and ever/i.test(b.text || '')) nowIdx = i;
    });
    if (nowIdx === -1) return [];   // presence is D3's job

    const theoHymn = trop.slice(nowIdx + 1).find(b => b.type === 'hymn');
    if (!theoHymn || theoHymn.tone == null) return [];

    // The tone-match rubric applies to Octoechos-appendix dismissal Theotokia.
    // A festal/afterfeast closing troparion or a saint's-own Theotokion may sit
    // at its own tone (parallels D4's menaion/triodion skips).
    if (theoHymn.source !== 'octoechos') return [];

    if (theoHymn.tone === gloryHymn.tone) return [];
    return [{
      message: `Troparia dismissal Theotokion tone ${theoHymn.tone} does not match Glory tone ${gloryHymn.tone}.`,
      hint:    'Re-key the Troparia `now` slot to `tone${gloryTone}.saturday.vespers.dismissalTheotokion` when splicing the Menaion Glory (see for-date.js Saturday Great Vespers branch).',
    }];
  },
};
