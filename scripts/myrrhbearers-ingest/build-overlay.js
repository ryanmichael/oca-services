#!/usr/bin/env node
// Phase 2: map parsed Myrrh-bearers Octoechos HTML into an overlay mirroring
// variable-sources/octoechos.json, tagged _source:'myrrhbearers'. Writes
// variable-sources/octoechos-myrrhbearers.json. Never touches the base file.
//
// Scope (pilot): Saturday Great Vespers for all 8 tones (structurally uniform).
// Sunday Matins/Liturgy sections are a follow-on.
//
// Usage: node build-overlay.js <dir-with-english-N.htm>

const fs = require('fs');
const path = require('path');
const { parseTone } = require('./parse-octoechos.js');

const SRC = process.argv[2] || '.';
const OUT = path.join(__dirname, '../../variable-sources/octoechos-myrrhbearers.json');
const S = 'myrrhbearers';

// Strip the trailing chant-break token our normalizer also handles, keep text as-is.
const clean = (t) => t.replace(/\s+/g, ' ').trim();

function mapSaturdayVespers(sections) {
  const find = (re) => sections.find((s) => re.test(s.label));
  const v = {};

  const res = find(/Resurrectional Stichera/i);
  if (res && res.hymns.length >= 2) {
    const hymns = res.hymns.map(clean);
    const glory = hymns.pop();                    // last item = Glory doxastikon
    v.lordICall = {
      resurrectional: { _source: S, hymns: hymns.map((text, i) => ({ order: i + 1, text })) },
      glory: { _source: S, tone: null, label: 'Resurrectional Doxastichon', text: glory },
    };
  }
  const dog = find(/dogmatic theotokion/i);
  if (dog && dog.hymns[0]) v.dogmatikon = { _source: S, label: 'Theotokion — Dogmatikon', text: clean(dog.hymns[0]) };

  const apo = find(/aposticha stichera/i);
  if (apo && apo.hymns.length) v.aposticha = { _source: S, hymns: apo.hymns.map((t, i) => ({ order: i + 1, text: clean(t) })) };

  // The two "Glory…, Now and ever…, Theotokion" sections are positional:
  // the one after the aposticha block is the aposticha theotokion; the one
  // after the troparion is the dismissal theotokion.
  const idxApo = apo ? sections.indexOf(apo) : -1;
  const trop = find(/Resurrectional troparion/i);
  const idxTrop = trop ? sections.indexOf(trop) : -1;
  const theotokia = sections
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => /Now and ever.*Theotokion/i.test(s.label) && s.hymns[0]);
  const apoTheo = theotokia.find(({ i }) => i > idxApo && (idxTrop < 0 || i < idxTrop));
  const dismTheo = theotokia.find(({ i }) => i > idxTrop);
  if (apo && apoTheo) v.aposticha.theotokion = { _source: S, label: 'Aposticha Theotokion', text: clean(apoTheo.s.hymns[0]) };
  if (trop) v.troparion = { _source: S, label: 'Resurrectional Troparion', text: clean(trop.hymns[0]) };
  if (dismTheo) v.dismissalTheotokion = { _source: S, label: 'Resurrectional Dismissal Theotokion', text: clean(dismTheo.s.hymns[0]) };

  return v;
}

const overlay = {
  _meta: {
    description: "Myrrh-bearers Octoechos overlay — source-tagged alternates that cascade onto octoechos.json when a parish selects the Myrrh-bearers stack. Base file is never modified.",
    _source: 'https://www.myrrh-bearers.org/octoechos/',
    _permission: 'Used and redistributed with permission of Holy Myrrh-bearers, Etna CA (2026-07-07). Please retain this attribution.',
    scope: 'Saturday Great Vespers (all 8 tones). Sunday Matins/Liturgy: TODO.',
  },
};

const report = [];
for (let t = 1; t <= 8; t++) {
  const file = path.join(SRC, `english-${t}.htm`);
  if (!fs.existsSync(file)) { report.push(`tone${t}: MISSING ${file}`); continue; }
  const satVespers = parseTone(file)[0];          // first service = Saturday Great Vespers
  const v = mapSaturdayVespers(satVespers.sections);
  overlay[`tone${t}`] = { saturday: { vespers: v } };
  const n = v.lordICall?.resurrectional?.hymns.length ?? 0;
  report.push(`tone${t}: ${n} resurrectional + ${v.lordICall?.glory ? 'glory ' : ''}${v.dogmatikon ? 'dogmatikon ' : ''}${v.aposticha ? v.aposticha.hymns.length + 'apo ' : ''}${v.troparion ? 'trop ' : ''}${v.dismissalTheotokion ? 'dismTheo' : ''}`);
}

fs.writeFileSync(OUT, JSON.stringify(overlay, null, 2));
console.log('wrote ' + OUT + '\n');
console.log(report.join('\n'));
