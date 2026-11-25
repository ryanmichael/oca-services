#!/usr/bin/env node
/**
 * One-off print-out for an Akathist (first use: Akathist of Thanksgiving,
 * St John of Damascus, Wed 2026-11-25). Not wired into the service catalog —
 * there is no `akathist` service type yet (see packet 2026-11-25 body.md).
 *
 * The Kontakia and Ikoi come from a plain-text SOURCE FILE the parish supplies.
 * This script never invents or transcribes hymn text; it only lays it out.
 *
 * Source format (UTF-8 text):
 *
 *   # Kontakion 1
 *   Everlasting King, ...
 *   Glory to Thee, O God, from age to age!
 *
 *   # Ikos 1
 *   I was born ...
 *   Glory to Thee for ...          ← "Glory to Thee for…" lines print as the
 *   Glory to Thee for ...             Ikos refrain list
 *   Glory to Thee, O God, from age to age!
 *
 *   # Kontakion 13 (thrice)        ← anything in (…) prints as a rubric
 *   # Repeat: Ikos 1               ← reprint an earlier section by name
 *   # Repeat: Kontakion 1
 *   # Prayer                       ← any other heading prints as given
 *
 * A line that is exactly "Alleluia!" (any repetition) or begins
 * "Glory to Thee, O God, from age to age" prints as the people's refrain.
 *
 * Usage:
 *   node scripts/print-akathist.js --source <text file> --out <dir>
 *        [--title "Akathist of Thanksgiving"] [--subtitle "Glory to God for All Things"]
 *        [--date "Wednesday, November 25, 2026"] [--with-beginning] [--no-pdf]
 *
 * Writes <out>/akathist.html and, unless --no-pdf, <out>/akathist.pdf
 * (US Letter portrait, 13pt EB Garamond — the Parish Book's ≥12pt floor).
 */
'use strict';
const fs = require('fs');
const path = require('path');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return dflt;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const REFRAIN_RE = /^(Glory to Thee,? O God,? from age to age[!.]?|(Alleluia[!,.]?\s*)+)$/i;
const IKOS_LINE_RE = /^Glory to Thee\b(?!,? O God,? from age to age)/i;

function parseSource(text) {
  const sections = [];
  let cur = null;
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    const h = line.match(/^#\s*(.+)$/);
    if (h) {
      const head = h[1].trim();
      const rep = head.match(/^Repeat:\s*(.+)$/i);
      cur = rep ? { repeat: rep[1].trim(), lines: [] } : { heading: head, lines: [] };
      sections.push(cur);
      continue;
    }
    if (!cur) { if (line) throw new Error(`Text before the first "# heading": "${line.slice(0, 40)}…"`); continue; }
    cur.lines.push(line);
  }
  return sections;
}

function splitHeading(heading) {
  const m = heading.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  return m ? { name: m[1], rubric: m[2] } : { name: heading, rubric: null };
}

function renderBody(lines) {
  // Paragraphs = runs of non-empty lines; refrain and Ikos "Glory to Thee for…"
  // lines get their own treatment so the people can find their part.
  const out = [];
  let para = [];
  let list = [];
  const flushPara = () => { if (para.length) out.push(`<p class="hymn">${para.map(esc).join(' ')}</p>`); para = []; };
  const flushList = () => {
    if (list.length) out.push(`<ul class="ikos-glory">${list.map(i => `<li${i.cont ? ' class="cont"' : ''}>${esc(i.t)}</li>`).join('')}</ul>`);
    list = [];
  };
  for (const l of lines) {
    if (!l) { flushPara(); flushList(); continue; }
    if (REFRAIN_RE.test(l)) { flushPara(); flushList(); out.push(`<p class="refrain">${esc(l)}</p>`); continue; }
    if (IKOS_LINE_RE.test(l)) { flushPara(); list.push({ t: l }); continue; }
    // Inside the "Glory to Thee…" list, a line that does not open with
    // "Glory to Thee" continues the line above it ("…heaven / and earth…").
    if (list.length) { list.push({ t: l, cont: true }); continue; }
    para.push(l);
  }
  flushPara(); flushList();
  return out.join('\n');
}

function beginningHtml() {
  const fx = require('../fixed-texts/vespers-fixed.json');
  // Some keys carry a literal dot (prayers["ourFather.doxology"]), so split
  // only at the FIRST dot: section, then key.
  const get = k => { const i = k.indexOf('.'); return fx[k.slice(0, i)] && fx[k.slice(0, i)][k.slice(i + 1)]; };
  const txt = k => { const v = get(k); return typeof v === 'string' ? v : (v && v.text) || ''; };
  const rows = [
    ['priest', 'Blessed is our God, always, now and ever, and unto ages of ages.'],
    ['people', 'Amen.'],
    ['people', 'Glory to Thee, our God, glory to Thee.'],
    ['people', txt('prayers.heavenlyKing')],
    ['people', txt('prayers.trisagion')],
    ['people', txt('doxology.gloryNow')],
    ['people', txt('prayers.mostHolyTrinity')],
    ['people', txt('responses.lordHaveMercyThrice')],
    ['people', txt('doxology.gloryNow')],
    ['people', txt('prayers.ourFather')],
    ['priest', txt('prayers.ourFather.doxology')],
    ['people', 'Amen.'],
  ];
  for (const [, t] of rows) if (!t) throw new Error('--with-beginning: a fixed text is missing from vespers-fixed.json');
  return `<section class="part beginning">
  <h2>The Beginning</h2>
  ${rows.map(([who, t]) => `<p class="${who === 'priest' ? 'priest' : 'hymn'}">${who === 'priest' ? '<span class="who">Priest:</span> ' : ''}${esc(t)}</p>`).join('\n  ')}
</section>`;
}

function build({ source, title, subtitle, date, withBeginning }) {
  const sections = parseSource(fs.readFileSync(source, 'utf8'));
  const byName = new Map();
  const parts = [];
  for (const s of sections) {
    let heading = s.heading, lines = s.lines;
    if (s.repeat) {
      const orig = byName.get(s.repeat.toLowerCase());
      if (!orig) throw new Error(`"# Repeat: ${s.repeat}" — no earlier section named "${s.repeat}"`);
      heading = `${splitHeading(orig.heading).name} (repeated)`; lines = orig.lines;
    } else {
      byName.set(splitHeading(s.heading).name.toLowerCase(), s);
    }
    const { name, rubric } = splitHeading(heading);
    // A refrain alone is not the hymn: a template section left unfilled must
    // stop the build, not print a Kontakion that is only "Alleluia!".
    if (!lines.some(l => l && !REFRAIN_RE.test(l))) throw new Error(`Section "${name}" has no hymn text yet`);
    parts.push(`<section class="part">
  <h2>${esc(name)}${rubric ? ` <span class="rubric">(${esc(rubric)})</span>` : ''}</h2>
  ${renderBody(lines)}
</section>`);
  }
  if (!parts.length) throw new Error('Source has no "# heading" sections');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 0.75in 0.85in 0.8in; }
  :root { --rubric: #8B1A1A; --text: #1a1209; --muted: #5a5048; }
  html, body { background: #fff; color: var(--text); margin: 0; }
  body { font-family: 'EB Garamond', Georgia, serif; font-size: 13pt; line-height: 1.38; }
  @media screen { body { max-width: 6.8in; margin: 0 auto; padding: 24px 16px 48px; } }
  header { text-align: center; margin-bottom: 0.25in; }
  header .parish { font-family: 'Cinzel', serif; font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: var(--muted); }
  header h1 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 20pt; letter-spacing: .06em; color: var(--rubric); margin: 6px 0 2px; }
  header .sub { font-style: italic; font-size: 14pt; }
  header .date { font-size: 11pt; color: var(--muted); margin-top: 4px; }
  .part { margin: 0 0 0.16in; }
  h2 { font-family: 'Cinzel', serif; font-weight: 600; font-size: 11.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--rubric); margin: 0.14in 0 0.04in; break-after: avoid; }
  h2 .rubric { font-family: 'EB Garamond', serif; font-style: italic; text-transform: none; letter-spacing: 0; font-weight: 400; }
  p { margin: 0 0 0.06in; orphans: 3; widows: 3; }
  .hymn { text-align: justify; hyphens: auto; }
  .priest .who { color: var(--rubric); font-style: italic; }
  .refrain { font-weight: 500; color: var(--rubric); margin-top: 0.04in; break-before: avoid; }
  ul.ikos-glory { list-style: none; margin: 0.02in 0 0.06in; padding: 0 0 0 0.22in; }
  ul.ikos-glory li { text-indent: -0.22in; padding-left: 0.22in; margin: 0 0 1px; break-inside: avoid; }
  ul.ikos-glory li.cont { text-indent: 0; padding-left: 0.44in; margin-top: -1px; break-before: avoid; }
  .beginning { border-bottom: 1px solid #d9cfc2; padding-bottom: 0.1in; margin-bottom: 0.18in; }
</style>
</head>
<body>
<header>
  <div class="parish">St. John of Damascus Orthodox Church · Tyler, Texas</div>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<div class="sub">${esc(subtitle)}</div>` : ''}
  ${date ? `<div class="date">${esc(date)}</div>` : ''}
</header>
${withBeginning ? beginningHtml() : ''}
${parts.join('\n')}
</body>
</html>
`;
}

async function toPdf(htmlPath, pdfPath) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.pdf({
      path: pdfPath, format: 'Letter', preferCSSPageSize: true, printBackground: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font:9px Georgia,serif;color:#777"><span class="pageNumber"></span></div>',
    });
  } finally { await browser.close(); }
}

async function main() {
  const source = arg('source');
  const out = arg('out');
  if (!source || !out || source === true || out === true) {
    console.error('usage: node scripts/print-akathist.js --source <file> --out <dir> [--with-beginning] [--no-pdf]');
    process.exit(1);
  }
  const html = build({
    source,
    title: arg('title', 'Akathist of Thanksgiving'),
    subtitle: arg('subtitle', 'Glory to God for All Things'),
    date: arg('date', ''),
    withBeginning: !!arg('with-beginning', false),
  });
  fs.mkdirSync(out, { recursive: true });
  const htmlPath = path.join(out, 'akathist.html');
  fs.writeFileSync(htmlPath, html);
  console.log('wrote', htmlPath);
  if (!arg('no-pdf', false)) {
    const pdfPath = path.join(out, 'akathist.pdf');
    await toPdf(htmlPath, pdfPath);
    console.log('wrote', pdfPath);
  }
}

if (require.main === module) main().catch(e => { console.error('error:', e.message); process.exit(1); });
module.exports = { parseSource, build };
