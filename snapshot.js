/**
 * Snapshot service HTML for one or more dates × services × translations.
 *
 * Hits a running server (default http://localhost:3000) and writes
 * snapshots/<date>/<service>__<translation>.html
 *
 * Examples
 *   node snapshot.js --date 2026-03-15
 *   node snapshot.js --date 2026-03-15 --translations base,sts-sluzhebnik
 *   node snapshot.js --dates 2026-03-07,2026-03-15 --services vespers,liturgy
 *   node snapshot.js --date 2026-03-15 --out snapshots/before
 *
 * Then compare with:  diff -r snapshots/before snapshots/after
 */

const fs   = require('fs');
const path = require('path');

const ALL_SERVICES = ['vespers', 'matins', 'liturgy', 'presanctified', 'paschal-hours'];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) { args[key] = true; }
      else { args[key] = next; i++; }
    }
  }
  return args;
}

function listFrom(v) {
  if (!v || v === true) return null;
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

// Vespers is served under /api/service (the catch-all daily-service route),
// not /api/vespers. Other services have their own endpoints.
const SERVICE_ENDPOINT = { vespers: 'service' };

async function fetchOne(base, service, date, translation) {
  const params = new URLSearchParams({ date, format: 'html' });
  if (translation && translation !== 'base') params.set('translation', translation);
  const endpoint = SERVICE_ENDPOINT[service] || service;
  const url = `${base}/api/${endpoint}?${params}`;
  const res = await fetch(url);
  const text = await res.text();
  return { url, status: res.status, contentType: res.headers.get('content-type') || '', text };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const base = args.base || 'http://localhost:3000';

  const dates = listFrom(args.dates) || (args.date ? [args.date] : null);
  if (!dates) {
    console.error('Provide --date YYYY-MM-DD or --dates a,b,c');
    process.exit(1);
  }
  const services = listFrom(args.services) || ALL_SERVICES;
  const translations = listFrom(args.translations) || ['base'];
  const outRoot = args.out || 'snapshots';

  // Sanity: server up?
  try {
    await fetch(`${base}/`, { method: 'HEAD' });
  } catch (e) {
    console.error(`Server not reachable at ${base}. Start it with: node server.js`);
    process.exit(1);
  }

  let ok = 0, skipped = 0, failed = 0;

  for (const date of dates) {
    const dir = path.join(outRoot, date);
    fs.mkdirSync(dir, { recursive: true });
    for (const service of services) {
      for (const translation of translations) {
        const file = path.join(dir, `${service}__${translation}.html`);
        const { status, contentType, text } = await fetchOne(base, service, date, translation);
        if (status === 404) {
          // Service not served on this date — record a stub so diffs stay honest.
          fs.writeFileSync(file + '.skip', `404\n${text}\n`);
          skipped++;
          console.log(`  skip  ${date} ${service} (${translation}) — 404`);
          continue;
        }
        if (status !== 200 || !contentType.includes('text/html')) {
          fs.writeFileSync(file + '.err', `status=${status}\n${text}\n`);
          failed++;
          console.log(`  FAIL  ${date} ${service} (${translation}) — ${status} ${contentType}`);
          continue;
        }
        fs.writeFileSync(file, text);
        ok++;
        console.log(`  ok    ${date} ${service} (${translation}) — ${text.length} bytes`);
      }
    }
  }

  console.log(`\nDone. ok=${ok} skipped=${skipped} failed=${failed}   out=${outRoot}/`);
  if (failed) process.exit(2);
}

main().catch(e => { console.error(e); process.exit(1); });
