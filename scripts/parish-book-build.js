#!/usr/bin/env node
'use strict';

/**
 * Derive and freeze a Parish Book edition.
 *
 *   node scripts/parish-book-build.js <parish> [edition…]        # write <edition>.book.json
 *   node scripts/parish-book-build.js <parish> [edition…] --check  # exit 1 if the frozen book drifted
 *
 * Every sample date is assembled through the live `/api/<service>` route
 * (in-process), so the book is cut from exactly what the app serves.
 * Spec: features/parish-book.md
 */

const { execSync } = require('child_process');
const { boot } = require('../server-lib/boot/load-fixed');
const { getService } = require('../server-lib/parish-book/service-source');
const { deriveBook, splitService } = require('../server-lib/parish-book/split');
const E = require('../server-lib/parish-book/editions');

const args = process.argv.slice(2);
const check = args.includes('--check');
const pos = args.filter(a => !a.startsWith('--'));
const parish = pos[0];
if (!parish) { console.error('usage: parish-book-build <parish> [edition…] [--check]'); process.exit(2); }

function words(blocks) { return blocks.reduce((n, b) => n + (b.text || '').split(/\s+/).filter(Boolean).length, 0); }

async function buildEdition(ctx, edition) {
  const services = [];
  for (const date of E.candidateDates(edition, edition.sampleYears)) {
    let svc;
    try { svc = await getService(ctx, edition, date); } catch (e) { continue; } // no service that day
    if (E.claims(edition, date, svc)) services.push({ date, blocks: svc.blocks, svc });
  }
  const book = deriveBook(services, edition);
  const fits = [], misfits = [];
  for (const s of services) {
    const r = splitService(s.blocks, book);
    if (r.fits) fits.push({ date: s.date, insertWords: words(r.stretches.flatMap(x => x.blocks)) + words(r.also.flatMap(a => a.blocks)), also: r.also.length });
    else misfits.push({ date: s.date, label: s.svc.liturgicalLabel, ...r.misfit });
  }
  let commit = null;
  try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (_) {}
  return {
    edition: { parish: edition.parish, id: edition.id, title: edition.title, service: edition.service, translation: edition.translation },
    builtFrom: { commit, sampleYears: edition.sampleYears, claimed: services.length, fits: fits.length, misfits },
    ...book,
    _stats: { bookWords: words(book.items.filter(i => i.kind === 'block').map(i => i.block)), fits },
  };
}

(async () => {
  const ctx = boot();
  const editions = (pos.length > 1 ? pos.slice(1).map(id => E.loadEdition(parish, id)) : E.listEditions(parish));
  let drift = false;
  for (const edition of editions) {
    const built = await buildEdition(ctx, edition);
    const { _stats, ...frozen } = built;
    const avg = _stats.fits.length ? Math.round(_stats.fits.reduce((n, f) => n + f.insertWords, 0) / _stats.fits.length) : 0;
    console.log(`\n${parish}/${edition.id}  fingerprint ${frozen.fingerprint}`);
    console.log(`  claimed ${frozen.builtFrom.claimed} dates, ${frozen.builtFrom.fits} fit, ${frozen.builtFrom.misfits.length} do not`);
    console.log(`  book: ${frozen.anchors.length} blocks, ~${_stats.bookWords} words; ${frozen.slots.length} occasional slots; insert averages ~${avg} words`);
    for (const s of frozen.slots) console.log(`    slot ${s.id.padEnd(34)} ${s.section.padEnd(26)} usual ${s.usual ? Math.round(s.usualShare * 100) + '%' : 'none → see insert'}`);
    for (const m of frozen.builtFrom.misfits) console.log(`    misfit ${m.date} ${m.label || ''}: ${m.reason} ${m.anchor || m.after || ''} ${m.section ? '(' + m.section + ')' : ''}`);

    if (check) {
      const old = E.loadBook(parish, edition.id);
      if (!old) { console.log('  DRIFT: no frozen book'); drift = true; }
      else if (old.fingerprint !== frozen.fingerprint) {
        console.log(`  DRIFT: frozen ${old.fingerprint} (built at ${old.builtFrom.commit}) ≠ current ${frozen.fingerprint}`);
        console.log('  The printed book no longer matches what the service assembles. Review, then rebuild and reprint (or accept).');
        drift = true;
      } else console.log('  frozen book is current');
    } else {
      E.writeBook(parish, edition.id, frozen);
      console.log(`  wrote parish-books/${parish}/${edition.id}.book.json`);
    }
  }
  process.exit(drift ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
