'use strict';

/**
 * OCR a choir-packet PDF into a text sidecar.
 *
 * The packets are physical scans — 354 pages, zero extractable characters — so
 * until now reviewing one meant reading every page by eye. macOS's Vision text
 * recogniser changes that for the pages that matter: on the typed text pages it
 * is near-perfect, and those are the ones carrying the day's variable propers.
 *
 * WHAT THIS IS FOR. The sidecar is an INDEX over the scan: something to grep,
 * diff, and compare against what we render. It is NOT a source of liturgical
 * text. A mis-read word in a sticheron is worse than no word, so nothing here
 * may ever be authored into fixed-texts or the DB — the same rule the project
 * already holds about never writing liturgical text from memory.
 *
 * macOS only (Vision + swiftc). Everywhere else `available()` is false and the
 * caller skips OCR with a note rather than failing.
 */

const fs     = require('fs');
const os     = require('os');
const path   = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT      = path.resolve(__dirname, '..');
const SRC       = path.join(ROOT, 'scripts', 'ocr', 'page-ocr.swift');
const CACHE_DIR = path.join(ROOT, 'scripts', 'ocr', '.build');
const BIN       = path.join(CACHE_DIR, 'page-ocr');

// No shell: passing args through `shell: true` concatenates rather than
// escapes them, which Node now warns about.
const has = (cmd) => spawnSync('/usr/bin/which', [cmd], { stdio: 'ignore' }).status === 0;

/** Can we OCR on this machine at all? */
function available() {
  return process.platform === 'darwin' && has('swiftc') && has('pdftoppm') && fs.existsSync(SRC);
}

/**
 * Compile once, reuse thereafter. Interpreted `swift` runs the same code 8x
 * slower (6.4s vs 0.76s a page), which over a 41-page packet is 4 minutes
 * against 30 seconds.
 */
function ensureBinary() {
  if (fs.existsSync(BIN) && fs.statSync(BIN).mtimeMs >= fs.statSync(SRC).mtimeMs) return BIN;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  execFileSync('swiftc', ['-O', SRC, '-o', BIN], { stdio: ['ignore', 'ignore', 'pipe'] });
  return BIN;
}

/**
 * A music score or a page of prose?
 *
 * Vision returns a score's lyrics syllable-hyphenated and broken across the
 * staves, mixed with noise read off the stave lines ("551 ald 88 a les"). The
 * giveaways are a high proportion of 1-2 character tokens and many intra-word
 * hyphens. Prose pages have neither.
 *
 * This is advisory: it tells a reader which pages to trust, and lets the
 * review skip the scores. It is not a correctness gate.
 */
function classifyPage(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 15) return 'blank';
  const shortRatio = tokens.filter((t) => t.length <= 2).length / tokens.length;
  const hyphens = (text.match(/ - /g) || []).length + (text.match(/\w-\w/g) || []).length;
  return (shortRatio > 0.25 || hyphens > 12) ? 'music' : 'text';
}

/**
 * OCR every page of one PDF.
 * @returns {{pages, textPages, musicPages, blankPages, chars, text}}
 */
function ocrPdf(pdfPath, opts = {}) {
  const bin = ensureBinary();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'choir-ocr-'));
  try {
    // 250 dpi is the floor at which the packets' body text reads cleanly;
    // 300 is slower for no measurable gain on these scans.
    execFileSync('pdftoppm', ['-r', String(opts.dpi || 250), '-png', pdfPath, path.join(tmp, 'p')],
      { stdio: ['ignore', 'ignore', 'pipe'] });

    const pages = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
    const out = [];
    let textPages = 0, musicPages = 0, blankPages = 0, chars = 0;

    pages.forEach((file, i) => {
      let text = '';
      try {
        text = execFileSync(bin, [path.join(tmp, file)],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { text = ''; }
      const kind = classifyPage(text);
      if (kind === 'text') { textPages++; chars += text.length; }
      else if (kind === 'music') musicPages++;
      else blankPages++;
      out.push(`--- page ${i + 1} [${kind}] ---\n${text.trim()}\n`);
    });

    return {
      pages: pages.length, textPages, musicPages, blankPages, chars,
      text: out.join('\n'),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = { available, ocrPdf, classifyPage, ensureBinary };

/**
 * Give every packet attachment that lacks a sidecar one, and record it in the
 * manifest. Idempotent: an attachment already carrying `ocr` is left alone.
 */
function backfill() {
  const root = path.join(ROOT, 'docs', 'choir-packets');
  if (!fs.existsSync(root)) { console.error('no packets'); return 1; }
  let done = 0, skipped = 0;
  for (const packet of fs.readdirSync(root).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()) {
    const mfPath = path.join(root, packet, 'manifest.json');
    if (!fs.existsSync(mfPath)) continue;
    const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
    const need = (mf.attachments || []).filter(
      (a) => !a.ocr && !a.supersededBy && /\.pdf$/i.test(a.stored || ''));
    if (!need.length) { skipped++; continue; }
    const ocrDir = path.join(root, packet, 'ocr');
    fs.mkdirSync(ocrDir, { recursive: true });
    console.log(`  ${packet}`);
    for (const a of need) {
      const pdf = path.join(root, packet, a.stored);
      if (!fs.existsSync(pdf)) { console.log(`    - ${a.stored} (not on disk)`); continue; }
      let r;
      try { r = ocrPdf(pdf); } catch (err) { console.log(`    ! ${a.stored}: ${err.message}`); continue; }
      const base = path.basename(a.stored).replace(/\.pdf$/i, '.txt');
      fs.writeFileSync(path.join(ocrDir, base), r.text);
      a.ocr = { file: `ocr/${base}`, pages: r.pages, textPages: r.textPages,
                musicPages: r.musicPages, chars: r.chars };
      console.log(`    ${base.padEnd(34)} ${r.textPages} text / ${r.musicPages} music, ${r.chars} chars`);
      done++;
    }
    fs.writeFileSync(mfPath, `${JSON.stringify(mf, null, 2)}\n`);
  }
  console.log(`\n  ${done} sidecar(s) written; ${skipped} packet(s) already complete.`);
  return 0;
}

// CLI: node scripts/choir-ocr.js <pdf> [...]   — print one sidecar to stdout
//      node scripts/choir-ocr.js --backfill    — give every packet its sidecars
if (require.main === module) {
  const args = process.argv.slice(2);
  if (!available()) {
    console.error('OCR unavailable: needs macOS with swiftc and pdftoppm');
    process.exitCode = 1;
  } else if (args[0] === '--backfill') {
    process.exitCode = backfill();
  } else if (!args.length) {
    console.error('usage: node scripts/choir-ocr.js <pdf> [...] | --backfill');
    process.exitCode = 1;
  } else {
    for (const f of args) {
      const r = ocrPdf(f);
      console.error(`${path.basename(f)}: ${r.pages}pp — ${r.textPages} text, ${r.musicPages} music, ${r.chars} chars`);
      process.stdout.write(r.text);
    }
  }
}
