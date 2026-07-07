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
  return {
    serviceType: j.serviceType,
    principal: (j.commemorations || [])[0]?.title || null,
    gloryLabel,
    menCount,
    dow: j.blocks ? null : null,
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

// ── run ─────────────────────────────────────────────────────────────────────
(async () => {
  const perDate = loadManifests();
  const dates = Object.keys(perDate).sort();
  const rows = [];
  let flags = 0;

  for (const key of dates) {
    const rec = perDate[key];
    const mm = parseInt(key.slice(0, 2), 10);
    const dd = parseInt(key.slice(2), 10);
    // The parish "principal" is whoever gets the LIC Glory (doxastikon).
    const parishPrincipal = rec.licGlory || rec.booklets[0] || rec.licSaints[0] || null;
    if (!parishPrincipal) continue;

    let ours;
    try { ours = await ourVespers(mm, dd); }
    catch (e) { rows.push({ key, parishPrincipal, err: e.message }); continue; }

    // Sunday resurrection dominates → principal comparison is not meaningful; note only.
    const isSunday = new Date(Date.UTC(YEAR, mm - 1, dd)).getUTCDay() === 0;

    const shareP = overlap(parishPrincipal, ours.principal);
    const shareG = rec.licGlory && ours.gloryLabel ? overlap(rec.licGlory, ours.gloryLabel) : null;
    const principalMatch = shareP.length > 0;
    const gloryMatch = shareG ? shareG.length > 0 : null;

    // Flag: non-Sunday where our principal doesn't share a token with the parish
    // Glory-saint, OR where the LIC-Glory saint disagrees.
    const flagged = !isSunday && (!principalMatch || gloryMatch === false);
    if (flagged) flags++;

    rows.push({
      key, isSunday, parishPrincipal, parishSlots: rec.licMaxSlot,
      ourPrincipal: ours.principal, ourGlory: ours.gloryLabel, ourMen: ours.menCount,
      serviceType: ours.serviceType, principalMatch, gloryMatch, flagged,
    });
  }

  // ── report ──
  const M = (b) => b === true ? 'ok' : b === false ? 'MISS' : '—';
  console.log(`\nocanwa parish-selection baseline — ${onlyMonth ? 'month ' + onlyMonth : 'all months'} (year ${YEAR})\n`);
  console.log('date  Sun  parish principal (LIC Glory)            → our principal                          prn glo  slots p/o');
  console.log('─'.repeat(128));
  for (const r of rows) {
    if (r.err) { console.log(`${r.key}   ERROR ${r.err}`); continue; }
    const line =
      `${r.key}  ${r.isSunday ? ' S ' : '   '}  ` +
      `${(r.parishPrincipal || '').slice(0, 38).padEnd(38)} → ${(r.ourPrincipal || '').slice(0, 38).padEnd(38)} ` +
      `${M(r.principalMatch).padEnd(4)}${M(r.gloryMatch).padEnd(4)} ${String(r.parishSlots || '-')}/${r.ourMen}`;
    console.log((r.flagged ? '⚑ ' : '  ') + line);
  }
  console.log('─'.repeat(128));
  console.log(`\n${rows.length} dates compared · ⚑ ${flags} flagged (non-Sunday principal/Glory mismatch) — review these.\n`);
  console.log('Legend: prn=principal saint token-match · glo=LIC Glory saint match · slots p/o=parish max LIC slot vs our menaion sticheron count.');
  console.log('Sundays (S) are not flagged on principal (resurrection dominates); check their slots/Glory manually.');
})();
