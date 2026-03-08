/**
 * OCA Service Text Collector
 *
 * Scrapes the OCA service texts listing page, downloads new .docx files,
 * extracts the document XML, and stores it locally for parsing.
 *
 * Usage:
 *   node collector.js              — download all new files
 *   node collector.js --dry-run    — show what would be downloaded
 *   node collector.js --status     — show storage summary
 *
 * Storage layout:
 *   storage/
 *     raw/               ← extracted word/document.xml files
 *     manifest.json      ← { url → { downloadedAt, localFile } }
 */

'use strict';

const https    = require('https');
const http     = require('http');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const { execSync } = require('child_process');

// ─── Config ───────────────────────────────────────────────────────────────────

const LISTING_URL  = 'https://www.oca.org/liturgics/service-texts';
const STORAGE_DIR  = path.join(__dirname, 'storage');
const RAW_DIR      = path.join(STORAGE_DIR, 'raw');
const MANIFEST     = path.join(STORAGE_DIR, 'manifest.json');
const RATE_LIMIT   = 1500; // ms between downloads — be polite to OCA's servers
const USER_AGENT   = 'OCA-Liturgical-Collector/1.0 (personal liturgical research)';

// ─── Storage helpers ──────────────────────────────────────────────────────────

function ensureDirs() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
}

function loadManifest() {
  if (fs.existsSync(MANIFEST)) return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return {};
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

// ─── Network ──────────────────────────────────────────────────────────────────

/**
 * Fetch a URL. Returns a Buffer (binary=true) or UTF-8 string (binary=false).
 * Follows up to 5 redirects.
 */
function fetchUrl(url, binary = false, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft === 0) return reject(new Error(`Too many redirects: ${url}`));
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': USER_AGENT } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchUrl(res.headers.location, binary, redirectsLeft - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end',  () => {
        const buf = Buffer.concat(chunks);
        resolve(binary ? buf : buf.toString('utf8'));
      });
      res.on('error', reject);
    });
    req.on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Parsing ──────────────────────────────────────────────────────────────────

/**
 * Extract all .docx links from the OCA listing page HTML.
 */
function extractDocxLinks(html) {
  const re = /href="(https:\/\/files\.oca\.org\/service-texts\/[^"]+\.docx)"/g;
  const links = [];
  let m;
  while ((m = re.exec(html)) !== null) links.push(m[1]);
  return [...new Set(links)];
}

/**
 * Derive a stable local filename from a URL.
 * e.g. "2026-0307-texts-vespers-tt.docx" → "2026-0307-texts-vespers-tt.xml"
 */
function localFilename(url) {
  return path.basename(url).replace(/\.docx$/, '.xml');
}

/**
 * Parse metadata out of a URL filename.
 * Returns { date, type, pronoun } where available.
 * e.g. "2026-0307-texts-vespers-tt" → { date:"2026-03-07", type:"vespers", pronoun:"tt" }
 */
function parseUrlMeta(url) {
  const name = path.basename(url, '.docx');
  const m = name.match(/^(\d{4})-(\d{2})(\d{2})-texts(?:-([a-z]+))?-(tt|yy)-?$/);
  if (!m) return { raw: name };
  const [, year, month, day, type, pronoun] = m;
  return {
    date:    `${year}-${month}-${day}`,
    type:    type || 'main',
    pronoun,
  };
}

// ─── Download + extract ───────────────────────────────────────────────────────

/**
 * Download a .docx, extract word/document.xml from the zip, save to RAW_DIR.
 * Returns the path of the saved XML file.
 */
async function downloadAndExtract(url) {
  const tmpPath = path.join(os.tmpdir(), `oca-${Date.now()}.docx`);
  try {
    const buf = await fetchUrl(url, true);
    fs.writeFileSync(tmpPath, buf);

    // unzip -p pipes the named entry to stdout; execSync captures it as a Buffer
    const xmlBuf = execSync(`unzip -p "${tmpPath}" word/document.xml`);
    const outFile = path.join(RAW_DIR, localFilename(url));
    fs.writeFileSync(outFile, xmlBuf);
    return outFile;
  } finally {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
  }
}

// ─── Status report ────────────────────────────────────────────────────────────

function printStatus(manifest) {
  const entries = Object.entries(manifest);
  if (entries.length === 0) {
    console.log('No files downloaded yet.');
    return;
  }

  // Group by date
  const byDate = {};
  for (const [url, info] of entries) {
    const meta = parseUrlMeta(url);
    const date = meta.date || 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ type: meta.type, pronoun: meta.pronoun, ...info });
  }

  console.log(`\nStorage: ${entries.length} files in ${RAW_DIR}\n`);
  for (const date of Object.keys(byDate).sort()) {
    const files = byDate[date].map(f => `${f.type}/${f.pronoun}`).join(', ');
    console.log(`  ${date}  ${files}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args    = new Set(process.argv.slice(2));
  const dryRun  = args.has('--dry-run');
  const status  = args.has('--status');

  ensureDirs();
  const manifest = loadManifest();

  if (status) {
    printStatus(manifest);
    return;
  }

  console.log('Fetching OCA service texts listing…');
  let html;
  try {
    html = await fetchUrl(LISTING_URL);
  } catch (err) {
    console.error(`Failed to fetch listing page: ${err.message}`);
    process.exit(1);
  }

  const links    = extractDocxLinks(html);
  const newLinks = links.filter(url => !manifest[url]);

  console.log(`Found ${links.length} file(s) on the listing page.`);
  console.log(`${newLinks.length} new (not yet downloaded), ${links.length - newLinks.length} already have.\n`);

  if (newLinks.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (dryRun) {
    console.log('Dry run — would download:');
    for (const url of newLinks) {
      const meta = parseUrlMeta(url);
      console.log(`  ${meta.date}  ${meta.type}/${meta.pronoun}  ${path.basename(url)}`);
    }
    return;
  }

  let downloaded = 0;
  let failed     = 0;

  for (let i = 0; i < newLinks.length; i++) {
    const url  = newLinks[i];
    const meta = parseUrlMeta(url);
    process.stdout.write(`  [${i + 1}/${newLinks.length}] ${meta.date} ${meta.type}/${meta.pronoun} … `);

    try {
      const localFile = await downloadAndExtract(url);
      manifest[url] = {
        downloadedAt: new Date().toISOString(),
        localFile:    path.relative(__dirname, localFile),
        ...meta,
      };
      saveManifest(manifest);
      console.log(`✓`);
      downloaded++;
    } catch (err) {
      console.log(`✗  ${err.message}`);
      failed++;
    }

    if (i < newLinks.length - 1) await sleep(RATE_LIMIT);
  }

  console.log(`\nDone. Downloaded: ${downloaded}  Failed: ${failed}`);
  if (downloaded > 0) {
    console.log(`XML files in: ${path.relative(__dirname, RAW_DIR)}/`);
    console.log(`Manifest:     ${path.relative(__dirname, MANIFEST)}`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
