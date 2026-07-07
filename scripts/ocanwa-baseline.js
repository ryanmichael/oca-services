#!/usr/bin/env node
'use strict';

// ocanwa parish-selection baseline audit.
//
// The ocanwa.org "Daily Sheet Music (by Month)" folders publish the parish's
// actual sung Vespers propers as one PDF per hymn, named:
//
//   MMDD-<Section>-<Slot>-<Saint>-<Incipit>-OBIKHOD-Tone<N>.pdf
//
// The hymn TEXT is trapped in music notation (not extractable), but the
// FILENAMES encode exactly what we need to audit selection & ordering:
// which saint the parish sings, how many stichera, in which tones, and who
// gets the Glory (doxastikon). This harness parses filename manifests under
// audit/ocanwa-baseline/*-vespers.txt, reconstructs the per-date parish
// baseline, queries our own /api/service, and flags where our principal /
// Glory / sticheron-count disagree with the parish.
//
// It reads only filenames — no PDF/music content — so adding a month is:
//   1. download the month's Vespers Dropbox folder as a zip (?dl=1)
//   2. `unzip -l` the zip, keep the .pdf lines
//   3. drop them in audit/ocanwa-baseline/<MM>-vespers.txt
//
// Usage:  node scripts/ocanwa-baseline.js [--month MM] [--host http://localhost:3000] [--year 2026]
// Requires the server running (for /api/service).

const fs   = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DIR  = path.join(ROOT, 'audit', 'ocanwa-baseline');

const args = process.argv.slice(2);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const onlyMonth = getArg('--month', null);
const HOST      = getArg('--host', 'http://localhost:3000');
const YEAR      = parseInt(getArg('--year', '2026'), 10);
const captureBaseline = getArg('--capture-baseline', null);
const checkBaseline   = getArg('--check', null);

// ── filename parse ──────────────────────────────────────────────────────────
const SECTION = /^(Lord I Call|Aposticha|Litya)$/i;
// slot forms: 1 · 2 · 4-3 · Glory · GloryNow · Now · Verse1 · Theotokion
const SLOT    = /^(Glory|GloryNow|Now|Verse\d|Theotokion|\d+(?:-\d+)?)$/i;

// Parse one filename into { date:'MMDD', section, slot, saint } or a booklet
// entry { date, booklet:true, saint }. Returns null for framework/fixed files.
function parseName(fn) {
  const base = fn.replace(/\.pdf$/i, '');
  const parts = base.split('-');
  const date = parts[0];
  if (!/^\d{4}$/.test(date)) return null;

  // Section-based hymn file: DATE - SECTION - SLOT - SAINT... - [Incipit] - OBIKHOD - ToneN
  if (parts[1] && SECTION.test(parts[1].trim())) {
    const section = parts[1].trim();
    const slot    = (parts[2] || '').trim();
    if (!SLOT.test(slot)) return { date, section, slot: slot || '?', saint: null, raw: fn };
    // saint = everything after slot up to the OBIKHOD/Tone tail, minus the incipit.
    let rest = parts.slice(3);
    // drop trailing OBIKHOD / ToneN
    rest = rest.filter(p => !/^OBIKHOD$/i.test(p) && !/^Tone\d+$/i.test(p));
    // saint is rest[0..n-2]; the last chunk is the incipit. If only one chunk,
    // it's the saint (some Theotokion/Now files have no saint name).
    const saint = rest.length >= 2 ? rest.slice(0, -1).join('-').trim() : (rest[0] || '').trim();
    return { date, section, slot, saint, raw: fn };
  }

  // Framework/fixed files we skip (no per-day saint): tone booklets, "Music", etc.
  if (/^(Lord I Call|Aposticha)\b/i.test(base.slice(5)) || /\bMusic\b/i.test(base)) return null;
  if (/Theotokion|Dogmatikon|Fixed/i.test(base)) return null;

  // Otherwise a full-service booklet: DATE - <Saint / feast title>
  const saint = parts.slice(1).join('-').trim();
  if (!saint) return null;
  return { date, booklet: true, saint, raw: fn };
}

// ── saint-name normalisation & matching ─────────────────────────────────────
const STOP = new Set([
  'the','of','and','at','in','on','a','an','our','with','his','her','their',
  'holy','saint','st','ss','venerable','ven','martyr','martyrs','greatmartyr',
  'great','hieromartyr','monk','monastic','blessed','prophet','apostle','apostles',
  'righteous','equal','apostles','archbishop','bishop','patriarch','wonderworker',
  'healer','passion','bearer','bearers','unmercenary','unmercenaries','confessor',
  'father','fathers','mother','new','virgin','maiden','nun','abbot','abbess',
  'hierarch','forerunner','icon','god','lord','christ','repose','translation',
  'relics','finding','uncovering','synaxis','afterfeast','forefeast','leavetaking',
  'prefeast','commemoration','miracle','dedication','placing','from','who','for',
]);
// Light hagiographic-name stemmer so spelling variants match:
// Kyriacus/Kyriakos, Procopius/Prokopios, Simeon/Symeon, etc.
function stem(t) {
  return t
    .replace(/k/g, 'c').replace(/ph/g, 'f').replace(/y/g, 'i')
    .replace(/(os|us|as|es|is|on|us)$/,'')   // drop common Greek/Latin case endings
    .replace(/(.)\1/g, '$1');                 // collapse doubled letters
}
function tokens(name) {
  return new Set(
    String(name || '')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/[""'']/g, ' ')
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length >= 3 && !STOP.has(t))
      .map(stem)
      .filter(t => t.length >= 3)
  );
}
// A saint matches if the parish + ours share any distinctive token.
function overlap(a, b) {
  const A = tokens(a), B = tokens(b);
  const shared = [...A].filter(t => B.has(t));
  return shared;
}

// Deterministic resolver: match a parish saint string against THIS date's own
// commemoration set (≈10 candidates from the API), not the whole calendar — so
// an incidental shared token can't cross-match an unrelated saint on another
// day. Returns the best-matching commemoration (most shared stem-tokens) or null.
function resolve(parishSaint, ourCommems) {
  let best = null, bestN = 0;
  for (let i = 0; i < ourCommems.length; i++) {
    const n = overlap(parishSaint, ourCommems[i].title).length;
    if (n > bestN) { bestN = n; best = { ...ourCommems[i], idx: i, shared: n }; }
  }
  return best;   // null ⇒ parish saint maps to none of our commemorations for the day
}

// ── our system ──────────────────────────────────────────────────────────────
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (r) => {
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}
// parish MMDD is the LITURGICAL day; Vespers is served the civil eve (day before).
function civilEve(mm, dd) {
  const d = new Date(Date.UTC(YEAR, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
const THEO = /Theotokos|Ever-?virgin|most pure Virgin|Lady Theotokos|Mother of God|Dogmatikon/i;

async function ourVespers(mm, dd) {
  const civil = civilEve(mm, dd);
  const j = await getJSON(`${HOST}/api/service?date=${civil}&format=json`);
  const lic = (j.blocks || []).filter(b => /Cried|Lord, I/.test(b.section || ''));
  let sawGlory = false, menCount = 0, gloryLabel = null;
  for (const b of lic) {
    if (b.type === 'doxology' && /^Glory to the Father/.test(b.text || '')) { sawGlory = true; continue; }
    if (b.type === 'hymn' && b.source === 'menaion') {
      if (!sawGlory) menCount++;
      else if (!gloryLabel) gloryLabel = b.label || null;
    }
  }
  const commems = (j.commemorations || []).map(c => ({ title: c.title, isPrincipal: !!c.isPrincipal }));
  // The LIC render follows the isPrincipal FLAG, not array order — the two can
  // disagree (e.g. Jul 4: [0]=Maximus but isPrincipal=Andrew, and Andrew is what
  // actually renders). Compare against the flag, falling back to [0].
  let principalIdx = commems.findIndex(c => c.isPrincipal);
  if (principalIdx < 0) principalIdx = 0;
  return {
    serviceType: j.serviceType,
    commems,
    principalIdx,
    principal: commems[principalIdx]?.title || null,
    gloryLabel,
    menCount,
    civil,
  };
}

// ── build per-date parish baseline ──────────────────────────────────────────
function loadManifests() {
  const files = fs.readdirSync(DIR).filter(f => /^\d{2}-vespers\.txt$/.test(f));
  const perDate = {};
  for (const f of files) {
    const mm = f.slice(0, 2);
    if (onlyMonth && mm !== onlyMonth) continue;
    const lines = fs.readFileSync(path.join(DIR, f), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      const p = parseName(line);
      if (!p) continue;
      const key = p.date;
      const rec = (perDate[key] ||= { date: key, licSaints: [], licGlory: null, licMaxSlot: 0, booklets: [] });
      if (p.booklet) { rec.booklets.push(p.saint); continue; }
      if (!/^Lord I Call$/i.test(p.section)) continue;
      if (/^Glory$/i.test(p.slot)) { rec.licGlory = p.saint; continue; }
      if (/^(GloryNow|Now|Theotokion)$/i.test(p.slot)) continue;   // theotokion slot
      if (p.saint) rec.licSaints.push(p.saint);
      const m = String(p.slot).match(/\d+/);
      if (m) rec.licMaxSlot = Math.max(rec.licMaxSlot, parseInt(m[0], 10));
    }
  }
  return perDate;
}

// Classify one date. Classes (only mismatch/unresolved are gated findings):
//   match       — parish principal resolves to OUR principal commemoration. OK.
//   rank        — parish principal resolves to one of our commemorations, but NOT
//                 our principal (we commemorate it, ranked lower). e.g. Jul 12.
//   unresolved  — parish principal maps to none of our date commemorations:
//                 either a coverage gap, or we label the day as a feast-period
//                 (afterfeast/forefeast) while the parish names the co-saint.
function classify(parishPrincipal, ours) {
  // Compare against the saint whose doxastikon we actually SING: the rendered
  // LIC Glory label. That's render-truth and sidesteps the array-order-vs-
  // isPrincipal split (which disagrees in both directions — Jul 4 [0] wrong /
  // flag right; Jul 23 [0] right / render wrong). Fall back to the isPrincipal
  // commemoration on days with no Menaion Glory (afterfeast/octoechos Glory).
  const ourDoxastikon = ours.gloryLabel || ours.principal;
  const m = resolve(parishPrincipal, ours.commems);   // where the parish saint sits in our list
  if (overlap(parishPrincipal, ourDoxastikon).length > 0) return { cls: 'match', match: m, ourDoxastikon };
  if (m) return { cls: 'rank', match: m, ourDoxastikon };
  return { cls: 'unresolved', match: null, ourDoxastikon };
}
// Stable finding key for baseline/check: date + normalized parish principal.
const findingKey = (key, parishPrincipal, cls) =>
  `${key}:${[...tokens(parishPrincipal)].sort().join('.')}:${cls}`;

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  const perDate = loadManifests();
  const dates = Object.keys(perDate).sort();
  const rows = [];
  const findingKeys = [];   // gated: rank + unresolved (non-Sunday)

  for (const key of dates) {
    const rec = perDate[key];
    const mm = parseInt(key.slice(0, 2), 10);
    const dd = parseInt(key.slice(2), 10);
    const parishPrincipal = rec.licGlory || rec.booklets[0] || rec.licSaints[0] || null;
    if (!parishPrincipal) continue;

    let ours;
    try { ours = await ourVespers(mm, dd); }
    catch (e) { rows.push({ key, parishPrincipal, err: e.message }); continue; }

    const isSunday = new Date(Date.UTC(YEAR, mm - 1, dd)).getUTCDay() === 0;
    const { cls, match, ourDoxastikon } = classify(parishPrincipal, ours);
    // Sundays are resurrection-dominant, so a lower-ranked saint is expected —
    // don't gate them (mirrors rescrape-diff excluding low-severity classes).
    const gated = !isSunday && (cls === 'rank' || cls === 'unresolved');
    if (gated) findingKeys.push(findingKey(key, parishPrincipal, cls));

    rows.push({
      key, isSunday, cls, gated, parishPrincipal, parishSlots: rec.licMaxSlot,
      ourPrincipal: ourDoxastikon, ourMatch: match ? match.title : null,
      ourMatchIdx: match ? match.idx : null, ourMen: ours.menCount,
    });
  }
  findingKeys.sort();

  // ── baseline capture ──
  if (captureBaseline) {
    fs.writeFileSync(captureBaseline, JSON.stringify({ keys: findingKeys }, null, 0) + '\n');
    console.log(`Baseline captured: ${findingKeys.length} keys → ${path.relative(ROOT, captureBaseline)}`);
    return;
  }

  // ── check mode: alert only on NEW divergences vs committed baseline ──
  if (checkBaseline) {
    const baseline = JSON.parse(fs.readFileSync(checkBaseline, 'utf8'));
    const known = new Set(baseline.keys);
    const now = new Set(findingKeys);
    const added = findingKeys.filter(k => !known.has(k));
    const removed = baseline.keys.filter(k => !now.has(k));
    console.log(`Parish-selection baseline check vs ${path.relative(ROOT, checkBaseline)}:`);
    console.log(`  baseline findings: ${baseline.keys.length} · current: ${findingKeys.length}`);
    console.log(`  NEW (divergence): ${added.length} · resolved-since-baseline: ${removed.length}`);
    if (removed.length) console.log(`  (${removed.length} baseline findings gone — a fix landed; refresh the baseline when convenient.)`);
    if (added.length) {
      console.log('\nNEW divergences (our pick changed, or a month was added):');
      added.forEach(k => console.log(`  + ${k}`));
      process.exitCode = 2;
    } else {
      console.log('\nNo new divergence. ✓');
    }
    return;
  }

  // ── default: human-readable table ──
  const TAG = { match: ' ok ', rank: 'RANK', unresolved: 'UNRES' };
  console.log(`\nocanwa parish-selection baseline — ${onlyMonth ? 'month ' + onlyMonth : 'all months'} (year ${YEAR})\n`);
  console.log('date  Sun  parish LIC Glory (doxastikon)           → our sung LIC Glory                      class  slots p/o');
  console.log('─'.repeat(128));
  for (const r of rows) {
    if (r.err) { console.log(`${r.key}   ERROR ${r.err}`); continue; }
    const detail = r.cls === 'rank' ? `RANK→#${r.ourMatchIdx} (${(r.ourMatch || '').slice(0, 24)})` : TAG[r.cls];
    const line =
      `${r.key}  ${r.isSunday ? ' S ' : '   '}  ` +
      `${(r.parishPrincipal || '').slice(0, 38).padEnd(38)} → ${(r.ourPrincipal || '').slice(0, 38).padEnd(38)} ` +
      `${String(detail).padEnd(6)} ${String(r.parishSlots || '-')}/${r.ourMen}`;
    console.log((r.gated ? '⚑ ' : '  ') + line);
  }
  console.log('─'.repeat(128));
  console.log(`\n${rows.length} dates compared · ⚑ ${findingKeys.length} gated findings (non-Sunday rank/unresolved).\n`);
  console.log('Classes: ok=parish principal is our principal · RANK=we rank it lower (our #idx) · UNRES=maps to none of our day commemorations.');
  console.log('Sundays (S) not gated (resurrection dominates). slots p/o = parish max LIC slot vs our menaion count.');
})();
