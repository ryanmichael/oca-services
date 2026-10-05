#!/usr/bin/env node
'use strict';

// CLI: node scripts/menaion-ingest/raphaela-fetch.js [--out <dir>] [--only <Month>]
//
// Re-fetch the Mother Raphaela Menaion corpus from the Tyler choir site, so the
// align/batch scripts beside this one have something to read.
//
// WHY THIS EXISTS. The 2026-09-20 batch downloaded the corpus into a session
// scratchpad, which is ephemeral — by 2026-10-05 it was gone, leaving
// reference/raphaela/batch-2026-09-20.json as the only record of a 425-row
// write. Anything that wants to revisit the 218 HELD rows (the ones the matcher
// could not place) has to fetch the corpus again, so the fetch is tooling now
// rather than an ad-hoc transcript.
//
// PERMISSION. Confirmed by Ryan 2026-09-20 for this corpus specifically; see
// memory project_raphaela_batch_2026_09_20 and project_choir_document_permission.
// The files land in a GITIGNORED directory and no corpus text is committed —
// only derived rows in oca.db, as before. Third-party musical settings on the
// same site (OBIKHOD / Znamenny / Byzantine) are NOT covered by that grant and
// this script does not touch them.
//
// HOW IT WORKS, AND WHY NOT THE DRIVE API. The 13 month/Common folders are
// public, so no credentials and no API key: the folder page embeds its own
// listing as hex-escaped JSON in `window['_DRIVE_ivd']`, and each file then
// downloads from the uc?export=download endpoint. Folder ids are not hardcoded
// blind — they are scraped from the Menaion page, each confirmed by the month
// name next to it, so a folder the director re-creates is picked up rather than
// silently 404ing.

const fs   = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const MENAION_PAGE =
  'https://sites.google.com/view/st-john-of-damascus-choir/liturgical-year-texts/daily-menaion';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December', 'Common'];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)';

function get(url, { binary = false } = {}) {
  const args = ['-sSL', '--max-time', '90', '-A', UA, url];
  return execFileSync('curl', args, {
    encoding: binary ? 'buffer' : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** Scrape the Menaion page for the 13 folder ids, each proven by a nearby label. */
function folderIds(html) {
  const out = [];
  const re = /[01][A-Za-z0-9_-]{27,43}/g;
  let m;
  while ((m = re.exec(html))) {
    const ctx = html.slice(Math.max(0, m.index - 300), m.index + 300);
    // A bare id is not enough: the page carries plenty of other long tokens.
    // Require the month (or "Common") to sit beside it, and take the first id
    // claimed by each label so a repeated mention cannot add a duplicate.
    const label = MONTHS.find((x) => ctx.includes(x));
    if (label && !out.some((o) => o.label === label)) out.push({ label, id: m[0] });
  }
  return out;
}

/** A public Drive folder lists itself in window['_DRIVE_ivd'] as escaped JSON. */
function listFolder(id) {
  const html = get(`https://drive.google.com/drive/folders/${id}`);
  const m = html.match(/_DRIVE_ivd'\]\s*=\s*'([\s\S]*?)';/);
  if (!m) throw new Error(`no _DRIVE_ivd in folder ${id} — Drive changed its markup`);
  const json = m[1].replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
                   .replace(/\\\//g, '/');
  const data = JSON.parse(json);
  return (data[0] || [])
    .filter((f) => Array.isArray(f) && typeof f[2] === 'string')
    .map((f) => ({ id: f[0], name: f[2] }));
}

function main() {
  const argv = process.argv.slice(2);
  const outArg = argv.indexOf('--out');
  const onlyArg = argv.indexOf('--only');
  const only = onlyArg >= 0 ? argv[onlyArg + 1] : null;
  const OUT = path.resolve(outArg >= 0 ? argv[outArg + 1]
    : path.join(__dirname, '..', '..', 'reference', 'raphaela', 'corpus'));
  const DOC = path.join(OUT, 'doc');
  const TXT = path.join(OUT, 'txt');
  for (const d of [DOC, TXT]) fs.mkdirSync(d, { recursive: true });

  console.log(`fetching the Menaion page…`);
  const folders = folderIds(get(MENAION_PAGE));
  console.log(`  ${folders.length} folders: ${folders.map((f) => f.label).join(', ')}`);
  if (folders.length < 13) {
    console.error(`  WARNING: expected 13, got ${folders.length} — the page markup may have changed`);
  }

  const manifest = [];
  let got = 0, skipped = 0, failed = 0;

  for (const f of folders) {
    if (only && f.label !== only) continue;
    let files;
    try { files = listFolder(f.id); }
    catch (e) { console.error(`  ${f.label}: ${e.message}`); failed++; continue; }
    const docs = files.filter((x) => /\.docx?$/i.test(x.name));
    console.log(`  ${f.label}: ${docs.length} doc files`);

    for (const d of docs) {
      const doc = path.join(DOC, d.name);
      const txt = path.join(TXT, d.name.replace(/\.docx?$/i, '.txt'));
      if (fs.existsSync(txt) && fs.statSync(txt).size > 0) { skipped++; manifest.push({ ...d, folder: f.label, txt: path.relative(OUT, txt) }); continue; }
      try {
        const buf = get(`https://drive.google.com/uc?export=download&id=${d.id}`, { binary: true });
        // A Drive interstitial ("too large to scan for viruses") is HTML, not a
        // .doc. Writing it would hand the parser a page of markup as a hymn.
        if (buf.slice(0, 512).toString('utf8').includes('<html')) {
          console.error(`    ${d.name}: got an HTML interstitial, not the file`);
          failed++; continue;
        }
        fs.writeFileSync(doc, buf);
        execFileSync('textutil', ['-convert', 'txt', '-output', txt, doc], { stdio: 'pipe' });
        got++;
        manifest.push({ ...d, folder: f.label, txt: path.relative(OUT, txt), bytes: buf.length });
      } catch (e) {
        console.error(`    ${d.name}: ${e.message.split('\n')[0]}`);
        failed++;
      }
    }
  }

  fs.writeFileSync(path.join(OUT, 'manifest.json'),
    JSON.stringify({ fetchedAt: new Date().toISOString(), source: MENAION_PAGE,
                     folders, files: manifest }, null, 1) + '\n');
  console.log(`\ndownloaded ${got}, already held ${skipped}, failed ${failed}`);
  console.log(`  -> ${path.relative(process.cwd(), OUT)}`);
  if (failed) process.exitCode = 2;
}

if (require.main === module) main();
module.exports = { folderIds, listFolder };
