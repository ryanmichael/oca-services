#!/usr/bin/env node
// Prototype parser for typiconman/english-md (Lambertsen Menaion, MIT).
// Parses one month's chapter files into structured hymn sections and counts
// stichera / troparia / kontakia / canon odes per commemoration.
//
// Usage: node parse-menaion.js <MonthDir> [--json]
//   e.g. node parse-menaion.js MenaionLambertsenApril
//
// Output: a per-chapter structured summary; with --json emits the full parse.

const fs = require('fs');
const path = require('path');

const REPO = process.env.MENAION_SRC || path.join(__dirname, 'english-md');

// ---- manifest ----------------------------------------------------------
function parseManifest(monthDir) {
  const xml = fs.readFileSync(path.join(REPO, monthDir, 'manifest.xml'), 'utf8');
  const chapters = [];
  const re = /<chapter\s+file="([^"]+)"\s+name="([^"]*)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) {
    const name = decodeEntities(m[2]);
    // "April 1: St. Mary of Egypt" -> day 1
    const dayMatch = name.match(/\b(\d{1,2})\b/);
    chapters.push({
      file: m[1],
      name,
      day: dayMatch ? parseInt(dayMatch[1], 10) : null,
      saint: name.replace(/^[A-Za-z]+\s+\d{1,2}:\s*/, '').trim(),
    });
  }
  return chapters;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&mdash;/g, '—')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ---- markdown chapter parsing -----------------------------------------
// Files are blank-line-delimited paragraphs. Some paragraphs are HEADERS
// (section labels ending in "—" or ":" or matching known markers); the rest
// are TEXT (the actual hymn body). We group texts under the preceding header.

// AT VESPERS: / AT MATINS: (all-caps) plus title-case "At Great/Little Vespers"
const SERVICE_RE = /^(AT\s+[A-Z][A-Z ']+:?|At\s+(?:Great|Little|Daily)?\s*Vespers)\s*$/;
const LIC_RE = /Lord,?\s+I have cried/i;                        // Lord-I-Call stichera intro
const APOSTICHA_RE = /Aposticha/i;
const PRAISES_RE = /(Praises|Lauds)/i;
const GLORY_RE = /^Glory\.{2,3}/i;
const NOWEVER_RE = /^(Now and ever|Both now)/i;
const TROPARION_RE = /^Troparion\b/i;
const KONTAKION_RE = /^Kontakion\b/i;
const IKOS_RE = /^Ikos\b/i;
const ODE_RE = /^Ode\s+[IVX]+\b/i;
const SESSIONAL_RE = /^Sessional\b/i;
const EXAPOST_RE = /^Exapostilarion\b/i;
const IRMOS_INLINE_RE = /^\*?Irmos:?\*?/i;
const THEOTOKION_INLINE_RE = /^\*?(Theotokion|Stavrotheotokion):?\*?/i;

// A header paragraph = short-ish and ends with the em-dash the corpus uses
// to introduce a following hymn, OR matches a structural marker.
// continuation of a stichera bucket: "And 4 in the same tone:", "And 3 stichera
// of the venerable one," (multi-saint day), "And 4 from the Pentecostarion,"
const CONT_RE = /^And\s+\d+\s+(sticher|in\b|from\b|of\b|the same)/i;

function classify(p) {
  const t = p.trim();
  if (SERVICE_RE.test(t)) return { kind: 'service', label: t.replace(/:$/, '') };
  if (ODE_RE.test(t) && t.length < 40) return { kind: 'ode', label: t };
  if (CONT_RE.test(t) && t.length < 160) return { kind: 'cont', label: t };
  // Intro headers end with the em-dash used corpus-wide.
  const isIntro = /[—]\s*$/.test(t) || /:\s*$/.test(t);
  if (isIntro && t.length < 240) {
    if (LIC_RE.test(t)) return { kind: 'lic-intro', label: t };
    if (APOSTICHA_RE.test(t)) return { kind: 'aposticha-intro', label: t };
    if (PRAISES_RE.test(t)) return { kind: 'praises-intro', label: t };
    if (GLORY_RE.test(t)) return { kind: 'glory', label: t };
    if (NOWEVER_RE.test(t)) return { kind: 'nowever', label: t };
    if (TROPARION_RE.test(t)) return { kind: 'troparion-intro', label: t };
    if (KONTAKION_RE.test(t)) return { kind: 'kontakion-intro', label: t };
    if (SESSIONAL_RE.test(t)) return { kind: 'sessional-intro', label: t };
    if (EXAPOST_RE.test(t)) return { kind: 'exapost-intro', label: t };
    return { kind: 'intro', label: t };
  }
  if (GLORY_RE.test(t) && t.length < 80) return { kind: 'glory', label: t };
  if (NOWEVER_RE.test(t) && t.length < 80) return { kind: 'nowever', label: t };
  if (KONTAKION_RE.test(t) && t.length < 60) return { kind: 'kontakion-intro', label: t };
  if (IKOS_RE.test(t) && t.length < 40) return { kind: 'ikos', label: t };
  return { kind: 'text', label: null };
}

function toneFromLabel(label) {
  if (!label) return null;
  const m = label.match(/Tone\s+([IVX]+)/i);
  if (!m) return null;
  const map = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };
  return map[m[1].toUpperCase()] || null;
}

function parseChapter(file, monthDir) {
  const raw = fs.readFileSync(
    path.join(REPO, monthDir, 'chapters', file + '.md'), 'utf8')
    .replace(/…/g, '...');   // corpus mixes … and ...; normalize so markers fire
  const paras = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const result = {
    title: paras[0] || null,
    commemoration: null,
    sections: [],                 // {kind,label,tone,texts:[]}
    counts: { licStichera: 0, aposticha: 0, troparia: 0, kontakia: 0, odes: 0, glory: 0 },
  };
  // "THE COMMEMORATION OF ..." line
  const commem = paras.find((p) => /^THE COMMEMORATION/i.test(p) || /^ON THIS DAY/i.test(p));
  if (commem) result.commemoration = commem;

  let cur = null;
  let service = null;
  const push = () => { if (cur) result.sections.push(cur); cur = null; };

  for (const p of paras) {
    const c = classify(p);
    if (c.kind === 'service') { push(); service = c.label; continue; }
    // "And N in the same tone:" / "And 3 stichera of Saint George" continues a
    // stichera bucket. Keep it as its OWN sub-group section (kind mirrors the
    // bucket it continues) so per-saint attribution can see the boundary; counts
    // sum across sub-groups.
    if (c.kind === 'cont') {
      const contKind = (cur && /-intro$/.test(cur.kind)) ? cur.kind : 'lic-intro';
      push();
      cur = { kind: contKind, label: c.label, service, tone: toneFromLabel(c.label),
              texts: [], continuation: true };
      continue;
    }
    if (c.kind === 'text') {
      // Inline-labeled canon members (Irmos/Theotokion) still count as text.
      if (cur) cur.texts.push(p);
      else {
        // orphan text (e.g. header line before first marker) — attach loosely
        cur = { kind: 'preamble', label: null, service, tone: null, texts: [p] };
      }
      continue;
    }
    // it's a header of some kind -> start a new section
    push();
    cur = { kind: c.kind, label: c.label, service, tone: toneFromLabel(c.label), texts: [] };
  }
  push();

  // ---- counts ----
  for (const s of result.sections) {
    const n = s.texts.length;
    if (s.kind === 'lic-intro') result.counts.licStichera += n;
    else if (s.kind === 'aposticha-intro') result.counts.aposticha += n;
    else if (s.kind === 'troparion-intro') result.counts.troparia += n;
    else if (s.kind === 'kontakion-intro') result.counts.kontakia += n || 1;
    else if (s.kind === 'ode') result.counts.odes += 1;
    else if (s.kind === 'glory') result.counts.glory += 1;
  }
  return result;
}

// ---- exports ----------------------------------------------------------
function parseMonth(monthDir) {
  const chapters = parseManifest(monthDir);
  return chapters.map((ch) => ({ ...ch, parse: parseChapter(ch.file, monthDir) }));
}
module.exports = { parseMonth, parseManifest, parseChapter, REPO };

if (require.main !== module) return;

// ---- main -------------------------------------------------------------
const monthDir = process.argv[2] || 'MenaionLambertsenApril';
const asJson = process.argv.includes('--json');
const chapters = parseManifest(monthDir);
const parsed = chapters.map((ch) => ({ ...ch, parse: parseChapter(ch.file, monthDir) }));

if (asJson) {
  process.stdout.write(JSON.stringify(parsed, null, 2));
  process.exit(0);
}

console.log(`\n${monthDir}: ${chapters.length} chapters\n`);
console.log('Day  LIC  Apo  Trop Kont Odes  Saint');
console.log('---  ---  ---  ---- ---- ----  ' + '-'.repeat(40));
for (const p of parsed) {
  const c = p.parse.counts;
  const row = [
    String(p.day ?? '?').padStart(3),
    String(c.licStichera).padStart(3),
    String(c.aposticha).padStart(3),
    String(c.troparia).padStart(4),
    String(c.kontakia).padStart(4),
    String(c.odes).padStart(4),
    ' ' + p.saint.slice(0, 46),
  ].join('  ');
  console.log(row);
}
const tot = parsed.reduce((a, p) => {
  const c = p.parse.counts;
  a.lic += c.licStichera; a.apo += c.aposticha; a.trop += c.troparia;
  a.kont += c.kontakia; a.odes += c.odes; return a;
}, { lic: 0, apo: 0, trop: 0, kont: 0, odes: 0 });
console.log('\nTotals: ' +
  `${tot.lic} LIC stichera, ${tot.apo} aposticha, ${tot.trop} troparia, ` +
  `${tot.kont} kontakia, ${tot.odes} canon odes across ${parsed.length} chapters.`);
