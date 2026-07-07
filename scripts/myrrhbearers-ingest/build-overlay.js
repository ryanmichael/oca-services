#!/usr/bin/env node
// Phase 2: map parsed Myrrh-bearers Octoechos HTML into an overlay mirroring
// variable-sources/octoechos.json, tagged _source:'myrrhbearers'. Writes
// variable-sources/octoechos-myrrhbearers.json. Never touches the base file.
//
// Scope: Saturday Great Vespers + Sunday Matins (sessional hymns, hypakoï,
// antiphons of degrees, matins prokeimenon, post-Gospel sticheron, the canon
// [irmoi + resurrection/cross/theotokos troparia], lauds) + Sunday Liturgy
// (beatitudes), all 8 tones.
//
// Usage: node build-overlay.js <dir-with-english-N.htm>

const fs = require('fs');
const path = require('path');
const { parseTone } = require('./parse-octoechos.js');

const SRC = process.argv[2] || '.';
const OUT = path.join(__dirname, '../../variable-sources/octoechos-myrrhbearers.json');
const S = 'myrrhbearers';
const clean = (t) => t.replace(/^Irmos:\s*/i, '').replace(/\s+/g, ' ').trim();
const CANON_REFRAIN = {
  resurrection: 'Glory to Thy holy Resurrection, O Lord.',
  crossResurrection: 'Glory to Thy precious Cross and Resurrection, O Lord.',
  theotokos: 'Most holy Theotokos, save us.',
};

const byName = (svcs, re) => svcs.find((s) => re.test(s.service));
const NOW_THEO = /Now and ever.*Theotokion|Now and ever…$/i;

// ---- Saturday Great Vespers ------------------------------------------
function mapSatVespers(sections) {
  const find = (re) => sections.find((s) => re.test(s.label));
  const v = {};
  const res = find(/Resurrectional Stichera/i);
  if (res && res.hymns.length >= 2) {
    const h = res.hymns.map(clean);
    const glory = h.pop();
    v.lordICall = {
      resurrectional: { _source: S, hymns: h.map((text, i) => ({ order: i + 1, text })) },
      glory: { _source: S, label: 'Resurrectional Doxastichon', text: glory },
    };
  }
  const dog = find(/dogmatic theotokion/i);
  if (dog?.hymns[0]) v.dogmatikon = { _source: S, label: 'Theotokion — Dogmatikon', text: clean(dog.hymns[0]) };
  const apo = find(/aposticha stichera/i);
  if (apo?.hymns.length) v.aposticha = { _source: S, hymns: apo.hymns.map((t, i) => ({ order: i + 1, text: clean(t) })) };
  const idxApo = apo ? sections.indexOf(apo) : -1;
  const trop = find(/Resurrectional troparion/i);
  const idxTrop = trop ? sections.indexOf(trop) : -1;
  const theos = sections.map((s, i) => ({ s, i })).filter(({ s }) => NOW_THEO.test(s.label) && s.hymns[0]);
  const apoTheo = theos.find(({ i }) => i > idxApo && (idxTrop < 0 || i < idxTrop));
  const dismTheo = theos.find(({ i }) => i > idxTrop);
  if (apo && apoTheo) v.aposticha.theotokion = { _source: S, label: 'Aposticha Theotokion', text: clean(apoTheo.s.hymns[0]) };
  if (trop) v.troparion = { _source: S, label: 'Resurrectional Troparion', text: clean(trop.hymns[0]) };
  if (dismTheo) v.dismissalTheotokion = { _source: S, label: 'Resurrectional Dismissal Theotokion', text: clean(dismTheo.s.hymns[0]) };
  return v;
}

// ---- Sunday Matins ----------------------------------------------------
function mapSundayMatins(mat, canon) {
  const secs = mat.sections;
  const out = { _source: S };

  // sessional hymns: the 2 troparia of each chanting + trailing theotokion
  const sessional = (labelRe) => {
    const i = secs.findIndex((s) => labelRe.test(s.label));
    if (i < 0) return null;
    const hy = secs[i].hymns.length ? secs[i] : secs.slice(i + 1).find((s) => s.hymns.length);
    if (!hy) return null;
    const arr = hy.hymns.map((t) => ({ label: null, text: clean(t) }));
    const theo = secs.slice(secs.indexOf(hy) + 1).find((s) => NOW_THEO.test(s.label) && s.hymns[0]);
    if (theo) arr.push({ label: 'Theotokion', text: clean(theo.hymns[0]) });
    return arr;
  };
  const k2 = sessional(/first chanting/i), k3 = sessional(/second chanting/i);
  out.sessionalHymns = {};
  if (k2) out.sessionalHymns.afterKathisma2 = k2;
  if (k3) out.sessionalHymns.afterKathisma3 = k3;

  const hyp = secs.find((s) => /hypaco|hypako/i.test(s.label));
  if (hyp?.hymns[0]) out.hypakoe = clean(hyp.hymns[0]);

  // antiphons of degrees: emit as many as the source has (usually 3; Tone 8 has
  // 4). Each = its troparia + the Glory that follows. (Tone 4's source is missing
  // Antiphon II — we emit what's present and flag it in the report.)
  const antiSecs = secs.filter((s) => /^Antiphon /i.test(s.label));
  if (antiSecs.length) {
    out.antiphonsOfDegrees = antiSecs.map((sec, n) => {
      const troparia = sec.hymns.map(clean);
      const g = secs.slice(secs.indexOf(sec) + 1).find((s) => /Now and ever/i.test(s.label) && s.hymns[0]);
      if (g) troparia.push(clean(g.hymns[0]));
      return { number: n + 1, troparia };
    });
  }
  const prok = secs.find((s) => /Prokimenon/i.test(s.label));
  if (prok?.hymns[0]) out.prokeimenon = { _source: S, refrain: clean(prok.hymns[0]) };
  const postG = secs.find((s) => /this sticheron/i.test(s.label));
  if (postG?.hymns[0]) out.postGospelSticheron = clean(postG.hymns[0]);

  // NOTE: the resurrection canon (irmoi + res/cross/theotokos troparia) is
  // DEFERRED to Phase 2b — its per-tone structure varies (troparia counts differ,
  // <p> splits are irregular; ode-section counts range 11–24 across tones), so a
  // count-based grouping would mis-assign troparia. It needs a label-based ode
  // parser ("Ode N" / "Canon of…" headers + irmos/troparion detection).
  // lauds (also in the canon service) — uniform [8], safe to map now

  const lauds = (canon?.sections || []).find((s) => /On the Praises/i.test(s.label));
  if (lauds?.hymns.length) out.laudsStichera = lauds.hymns.map((t) => ({ text: clean(t) }));
  return out;
}

// ---- Sunday Liturgy ---------------------------------------------------
function mapLiturgy(lit) {
  const b = lit.sections.find((s) => /On the Beatitudes/i.test(s.label));
  if (!b?.hymns.length) return null;
  return { beatitudes: { _source: S, troparia: b.hymns.map((t) => ({ label: null, text: clean(t) })) } };
}

// ---- assemble ---------------------------------------------------------
const overlay = {
  _meta: {
    description: "Myrrh-bearers Octoechos overlay — source-tagged alternates that cascade onto octoechos.json when a parish selects the Myrrh-bearers stack. Base file is never modified.",
    _source: 'https://www.myrrh-bearers.org/octoechos/',
    _permission: 'Used and redistributed with permission of Holy Myrrh-bearers, Etna CA (2026-07-07). Please retain this attribution.',
    scope: 'Saturday Great Vespers + Sunday Matins (sessional/hypakoe/antiphons/prokeimenon/post-Gospel/lauds) + Sunday Liturgy (beatitudes), all 8 tones. Resurrection CANON deferred to Phase 2b.',
  },
};

const report = [];
for (let t = 1; t <= 8; t++) {
  const file = path.join(SRC, `english-${t}.htm`);
  if (!fs.existsSync(file)) { report.push(`tone${t}: MISSING ${file}`); continue; }
  const svcs = parseTone(file);
  const satV = byName(svcs, /Vespers/i) || svcs[0];
  const mat = byName(svcs, /Matins/i);
  const canon = byName(svcs, /Canon/i);
  const lit = byName(svcs, /Liturgy/i);
  const tone = { saturday: { vespers: mapSatVespers(satV.sections) }, sunday: {} };
  if (mat) tone.sunday.matins = mapSundayMatins(mat, canon);
  if (lit) { const l = mapLiturgy(lit); if (l) tone.sunday.liturgy = l; }
  overlay[`tone${t}`] = tone;
  const m = tone.sunday.matins || {};
  report.push(`tone${t}: satVes✓  matins[${Object.keys(m.sessionalHymns || {}).length}sess ${m.antiphonsOfDegrees ? m.antiphonsOfDegrees.length + 'anti' : 'NO-anti'} ${m.hypakoe ? 'hyp' : ''} ${m.prokeimenon ? 'prok' : ''} ${m.postGospelSticheron ? 'postG' : ''} ${m.laudsStichera ? m.laudsStichera.length + 'lauds' : ''}] liturgy[${tone.sunday.liturgy?.beatitudes?.troparia.length || 0}beat]`);
}

fs.writeFileSync(OUT, JSON.stringify(overlay, null, 2));
console.log('wrote ' + OUT + '\n' + report.join('\n'));
