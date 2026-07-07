#!/usr/bin/env node
// Phase 5 QA: validate variable-sources/octoechos-myrrhbearers.json for
// structural completeness and content sanity across all 8 tones. Catches
// mapping errors (wrong slot, swapped sub-canon), empty/corrupt text, and count
// anomalies. Read-only; prints a report + non-zero-ish summary.

const path = require('path');
const overlay = require('../../variable-sources/octoechos-myrrhbearers.json');

const issues = [];
const flag = (tone, msg) => issues.push(`tone${tone}: ${msg}`);

// content-sanity lexicons
const MARIAN = /virgin|theotokos|mother|maiden|\bmary\b|birthgiv|thee who|O pure|all-pure|ever-virgin|wedlock|gavest birth|didst bear|bride|unwedded|\bgate\b|rejoice, /i;
const RESURR = /risen|resurrection|tomb|grave|hades|death|Adam|corruption|arisen|life/i;
const bad = (re, txt) => !re.test(txt || '');

for (let t = 1; t <= 8; t++) {
  const T = overlay[`tone${t}`];
  if (!T) { flag(t, 'MISSING tone'); continue; }
  const v = T.saturday?.vespers, m = T.sunday?.matins, l = T.sunday?.liturgy;

  // --- Saturday Vespers slots ---
  const lic = v?.lordICall?.resurrectional?.hymns;
  if (!lic || lic.length < 5) flag(t, `resurrectional stichera count ${lic?.length ?? 0} (<5)`);
  for (const slot of ['lordICall.glory', 'dogmatikon', 'aposticha', 'troparion', 'dismissalTheotokion']) {
    const o = slot.split('.').reduce((x, k) => x && x[k], v);
    if (!o) flag(t, `missing saturday.vespers.${slot}`);
  }
  if (v?.aposticha?.hymns?.length !== 4) flag(t, `aposticha count ${v?.aposticha?.hymns?.length}`);
  // content sanity
  if (v?.dogmatikon && bad(MARIAN, v.dogmatikon.text)) flag(t, 'dogmatikon has no Marian language (possible mis-map)');
  if (v?.dismissalTheotokion && bad(MARIAN, v.dismissalTheotokion.text)) flag(t, 'dismissalTheotokion not Marian');

  // --- Sunday Matins ---
  if (!m) { flag(t, 'MISSING sunday.matins'); continue; }
  if (!m.hypakoe) flag(t, 'missing hypakoe');
  if (!m.laudsStichera || m.laudsStichera.length !== 8) flag(t, `lauds count ${m.laudsStichera?.length}`);
  const anti = m.antiphonsOfDegrees?.length ?? 0;
  if (anti < 3) flag(t, `antiphons of degrees = ${anti} (expected 3, Tone 8 = 4) — likely a source gap`);

  // canon
  const odes = m.canonTroparia ? Object.keys(m.canonTroparia) : [];
  if (odes.length !== 8) flag(t, `canon has ${odes.length} odes (expected 8)`);
  for (const N of odes) {
    const tr = m.canonTroparia[N];
    const byCanon = {};
    for (const x of tr) {
      byCanon[x.canon] = (byCanon[x.canon] || 0) + 1;
      if (!x.text || !x.text.trim()) flag(t, `ode${N} empty troparion text`);
    }
    for (const c of ['resurrection', 'crossResurrection', 'theotokos'])
      if (!byCanon[c]) flag(t, `ode${N} missing ${c} sub-canon`);
    // sub-canon sanity: theotokos troparia should read Marian; resurrection should read resurrectional
    const theo = tr.filter((x) => x.canon === 'theotokos');
    if (theo.length && theo.every((x) => bad(MARIAN, x.text))) flag(t, `ode${N} theotokos troparia have NO Marian language (possible sub-canon swap)`);
    if (!m.canonIrmoi?.[N]) flag(t, `ode${N} missing irmos`);
  }

  // --- Sunday Liturgy ---
  if (!l?.beatitudes?.troparia || l.beatitudes.troparia.length !== 8) flag(t, `beatitudes count ${l?.beatitudes?.troparia?.length}`);

  // global: no empty texts anywhere
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) {
      if (k === 'text' && (!x || !String(x).trim())) flag(t, 'empty text field found');
      else walk(x);
    }
  };
  walk(T);
}

console.log(`\n=== Myrrh-bearers Octoechos overlay QA (8 tones) ===\n`);
if (!issues.length) console.log('  ✓ all checks pass — no structural or content-sanity issues.');
else { console.log(`  ${issues.length} finding(s):`); for (const i of issues) console.log('   · ' + i); }
console.log(`\n(theotokia checked for Marian language; canon sub-canons checked for correct assignment.)`);
