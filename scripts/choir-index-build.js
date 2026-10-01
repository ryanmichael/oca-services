#!/usr/bin/env node
'use strict';

/**
 * CLI: build docs/choir-packets/index.json — the liturgical index over every
 * choir asset we hold.
 *
 *   node scripts/choir-index-build.js            # write
 *   node scripts/choir-index-build.js --check    # CI: fail if stale
 *   node scripts/choir-index-build.js --dry-run  # report only
 *
 * The packet folders are addressed by PROVENANCE (which email brought a file).
 * Lookup needs LITURGICAL addressing (which service, which hymn), and one is not
 * a reshuffle of the other — a standing hymn applies from a date onward, a tone
 * packet recurs every eight weeks, and one event's music can arrive across
 * several emails. See docs/choir-asset-addressing-design.md.
 *
 * Generated — never hand-edit. Every binding carries the packet it came from, so
 * provenance survives the derivation.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const REPO        = path.resolve(__dirname, '..');
const PACKET_ROOT = path.join(REPO, 'docs', 'choir-packets');
const INDEX_PATH  = path.join(PACKET_ROOT, 'index.json');

/**
 * Thematic folders that are not email packets. These hold the director's
 * per-hymn and per-tone material and predate the manifest, so they are indexed
 * directly from their filenames.
 */
// `scope` records which service family the folder's material belongs to, so a
// lookup never offers a Vespers sticheron sheet for Matins or Liturgy. Recorded
// at build time because it is a fact about the folder, not about the query.
const THEMATIC = [
  { dir: 'docs/Vespers-july',                  packet: 'vespers-july',  parse: 'perHymn', scope: 'vespers' },
  { dir: 'docs/LIC',                           packet: 'lic',           parse: 'licTone', scope: 'vespers' },
  { dir: 'docs/Fixed Divine Liturgy - St John', packet: 'fixed-liturgy', parse: 'fixed',   scope: 'liturgy' },
];

const assetId = (sha) => (sha || '').slice(0, 12);

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if      (a === '--check')   out.check  = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--json')    out.json   = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(`unknown argument: ${a}`); process.exit(1); }
  }
  return out;
}

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ── the director's per-hymn convention ────────────────────────────────────
//
//   0701-Lord I Call-4-3-Unmercenaries Cosmas and Damian-At first instructed by the-OBIKHOD-Tone1.pdf
//   MMDD  section    pos   commemoration                incipit               melody    tone
//
// Fields are hyphen-separated but several fields contain spaces and the position
// itself may contain a hyphen ("4-3"), so this is parsed positionally from both
// ends rather than by a naive split.
const SECTIONS = ['Lord I Call', 'Aposticha', 'Litya', 'Troparion', 'Theotokion', 'Prokeimenon'];

/**
 * Sections sung at Vespers, whose sheet is therefore sung on the EVENING BEFORE
 * the date in its filename. "Troparion"/"Theotokion" appear in several services,
 * so no eve is derived for them rather than guessing the wrong one.
 */
const VESPERS_SECTIONS = new Set(['Lord I Call', 'Aposticha', 'Litya']);

const minusOneDay = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * @param {string} filename
 * @param {number} year  these filenames carry MMDD only; the year comes from the
 *                       folder's context and is marked `yearInferred` so a
 *                       consumer never mistakes it for stated fact.
 */
function parsePerHymn(filename, year) {
  const stem = filename.replace(/\.pdf$/i, '');
  const m = stem.match(/^(\d{2})(\d{2})-(.*)$/);
  if (!m) return null;
  const [, mm, dd, rest] = m;
  const mo = Number(mm), da = Number(dd);
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  // `contentDate` is the LITURGICAL day — the same meaning the manifest gives it.
  const contentDate = `${year}-${mm}-${dd}`;

  const section = SECTIONS.find((s) => rest.startsWith(`${s}-`));
  if (!section) {
    // A whole-day sheet: "0702-Placing of Robe of Theotokos at Blachernae"
    return { kind: 'day', contentDate, yearInferred: true, title: rest };
  }

  let tail = rest.slice(section.length + 1);
  const tone = tail.match(/-Tone\s*(\d+)$/i);
  let toneNum = null;
  if (tone) { toneNum = Number(tone[1]); tail = tail.slice(0, tone.index); }

  // Melody source is the last hyphen-delimited field, and is upper-case by
  // convention (OBIKHOD, ZNAMENNY, …). Treat it as such only when it looks it,
  // so a hymn whose incipit ends in a hyphenated word is not eaten.
  let melody = null;
  const lastDash = tail.lastIndexOf('-');
  if (lastDash > 0) {
    const cand = tail.slice(lastDash + 1);
    if (/^[A-Z][A-Z0-9 .'&-]*$/.test(cand)) { melody = cand; tail = tail.slice(0, lastDash); }
  }

  // Position leads: a number, a number pair, Glory, GloryNow, Now.
  const pos = tail.match(/^(GloryNow|Glory|Now|\d+(?:-\d+)?)-/);
  let position = null;
  if (pos) { position = pos[1]; tail = tail.slice(pos[0].length); }

  // What remains is "<commemoration>-<incipit>". The split is genuinely
  // ambiguous when either contains a hyphen, so we do not pretend to resolve
  // it: the whole string is kept and the incipit is only ever a CONFIRMATION
  // signal, never the binding key (the director's translation differs from ours
  // — 2 of 5 exact matches measured on 2026-07-01).
  const lastSplit = tail.lastIndexOf('-');
  const commemoration = lastSplit > 0 ? tail.slice(0, lastSplit) : tail;
  const incipit       = lastSplit > 0 ? tail.slice(lastSplit + 1) : null;

  return {
    kind: 'block', contentDate, yearInferred: true,
    // The eve on which this is actually sung, for a Vespers section.
    apiDate: VESPERS_SECTIONS.has(section) ? minusOneDay(contentDate) : null,
    section, position, tone: toneNum, melody, commemoration, incipit,
    // Bind on (contentDate, section, position, tone, commemoration). The incipit
    // is CONFIRMATION ONLY: the director's sources are `yy` where we render `tt`,
    // and only 2 of 5 incipits matched exactly on 2026-07-01. A tone
    // disagreement should refuse a binding, not warn.
    bindKey: [contentDate, section, position, toneNum].join('|'),
  };
}

function parseLicTone(filename) {
  const m = filename.match(/Tone\s*(\d+)/i);
  return m ? { kind: 'tone', tone: Number(m[1]), role: 'lord-i-call-setting' } : null;
}

// ── build ─────────────────────────────────────────────────────────────────

function build() {
  const bindings = [];
  const unbound  = [];
  const assets   = {};

  const note = (sha, rel, filename, bytes, pages) => {
    const id = assetId(sha);
    assets[id] ||= { id, sha256: sha, path: rel, filename, bytes, pages: pages ?? null };
    return id;
  };

  // 1. email packets, via their manifests
  const packets = fs.existsSync(PACKET_ROOT)
    ? fs.readdirSync(PACKET_ROOT).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    : [];

  for (const packet of packets) {
    const mfPath = path.join(PACKET_ROOT, packet, 'manifest.json');
    if (!fs.existsSync(mfPath)) continue;
    const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));

    for (const a of mf.attachments || []) {
      const rel = `${packet}/${a.stored}`;
      const id  = note(a.sha256, rel, a.original, a.bytes, a.pages);

      if (a.supersededBy) {
        bindings.push({ kind: 'superseded', asset: id, supersededBy: a.supersededBy, packet });
        continue;
      }
      if (a.kind === 'service') {
        bindings.push({
          kind: 'service', date: a.apiDate, contentDate: a.contentDate,
          service: a.service, role: 'booklet', tone: a.tone ?? mf.weekTone ?? null,
          asset: id, packet,
          ...(a.remappedFrom ? { remapped: true } : {}),
        });
      } else if (a.kind === 'tone') {
        bindings.push({ kind: 'tone', tone: a.tone, role: 'intro-packet', asset: id, packet });
      } else {
        unbound.push({ asset: id, filename: a.original, packet,
                       reasons: a.reasons || [], path: rel });
      }
    }
  }

  // 2. thematic folders, via the director's filename conventions
  const year = new Date().getUTCFullYear();
  for (const t of THEMATIC) {
    const abs = path.join(REPO, t.dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).filter((x) => /\.pdf$/i.test(x)).sort()) {
      const full = path.join(abs, f);
      const rel  = path.relative(REPO, full);
      const id   = note(sha256(full), rel, f, fs.statSync(full).size);

      let parsed = null;
      if      (t.parse === 'perHymn') parsed = parsePerHymn(f, year);
      else if (t.parse === 'licTone') parsed = parseLicTone(f);
      else if (t.parse === 'fixed')   parsed = { kind: 'standing', service: 'liturgy',
                                                 role: 'fixed-sections', title: f.replace(/\.pdf$/i, '') };

      if (parsed) bindings.push({ ...parsed, scope: t.scope || null, asset: id, packet: t.packet });
      else unbound.push({ asset: id, filename: f, packet: t.packet,
                          reasons: ['filename did not match a known convention'], path: rel });
    }
  }

  const counts = bindings.reduce((acc, b) => { acc[b.kind] = (acc[b.kind] || 0) + 1; return acc; }, {});

  return {
    generated: 'scripts/choir-index-build.js — do not hand-edit',
    packets: packets.length,
    counts: { ...counts, unbound: unbound.length, assets: Object.keys(assets).length },
    assets,
    bindings,
    unbound,
  };
}

/** Stable comparison that ignores only the volatile header. */
const comparable = (idx) => JSON.stringify({ ...idx, generated: undefined });

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/choir-index-build.js [--check|--dry-run|--json]');
    return 0;
  }

  const index = build();

  if (args.json) { console.log(JSON.stringify(index, null, 2)); return 0; }

  console.log(`\nchoir index — ${index.packets} packets`);
  for (const [k, v] of Object.entries(index.counts)) console.log(`  ${String(v).padStart(4)}  ${k}`);

  const byKind = (k) => index.bindings.filter((b) => b.kind === k);
  const blocks = byKind('block');
  if (blocks.length) {
    console.log(`\n  per-hymn bindings, e.g.:`);
    for (const b of blocks.slice(0, 3)) {
      console.log(`    ${b.contentDate}  ${b.section} @${b.position}  tone ${b.tone}  ${b.melody || '?'}`);
      console.log(`        "${b.incipit}"  — ${b.commemoration}`);
    }
  }
  if (index.unbound.length) {
    console.log(`\n  UNBOUND (${index.unbound.length}) — visible backlog, not silently dropped:`);
    for (const u of index.unbound.slice(0, 8)) console.log(`    ? ${u.packet}/${u.filename}`);
    if (index.unbound.length > 8) console.log(`    … ${index.unbound.length - 8} more`);
  }

  if (args.check) {
    if (!fs.existsSync(INDEX_PATH)) { console.error('\n  index.json missing — run without --check\n'); return 1; }
    const onDisk = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
    if (comparable(onDisk) !== comparable(index)) {
      console.error('\n  index.json is STALE — run: npm run choir:index\n');
      return 1;
    }
    console.log('\n  index.json is up to date\n');
    return 0;
  }

  if (!args.dryRun) {
    fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
    console.log(`\n  wrote ${path.relative(REPO, INDEX_PATH)}\n`);
  } else {
    console.log('\n  (dry run — nothing written)\n');
  }
  return 0;
}

if (require.main === module) {
  // process.exit() discards stdout still queued for a pipe, which truncated
  // --json output at 64 KB. Set the code and let Node flush and exit on its own.
  try { process.exitCode = main(); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}

module.exports = { build, parsePerHymn, parseLicTone, assetId };
