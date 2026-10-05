#!/usr/bin/env node
'use strict';

// CLI: node scripts/daily-octoechos-apply.js [--apply]
//
// Chunk 4, the write: move the weekday Lord-I-Call stichera of
// variable-sources/octoechos.json to the parish's Daily Octoechos translation.
// DRY-RUN BY DEFAULT.
//
// WHAT IT REPLACES, AND WHAT IT DELIBERATELY DOES NOT.
//
// Every weekday node holds SIX Lord-I-Call hymns, which are two sets of three:
// a primary theme and a secondary one (sunday repentance + angels; monday
// repentance + Forerunner; tuesday Cross + Theotokos; wednesday apostles + St
// Nicholas; thursday Cross + Theotokos; friday martyrs + all saints). Six are
// held so the assembler can draw three when a Menaion saint supplies the other
// three, and more when the Menaion is short.
//
// The Daily Octoechos prints only the PRIMARY set — the three the parish
// actually sings — which is why its nodes carry 3 stichera plus a Theotokion
// and ours carry 6. That is not over-supply on our side; the two books serve
// different purposes. So this replaces hymns 0-2 and leaves 3-5 alone.
//
// Measured: of 239 weekday Daily Vespers in 2026, 201 render exactly three
// Octoechos stichera and would be wholly in the parish's translation after this.
// Five render four or five because their Menaion is short (02-15, 04-19, 05-12,
// 07-01, 12-15); those keep one or two hymns from the secondary set, which
// remains st-sergius.org. 33 render none at all.
//
// VALIDATION BEHIND THIS: the parser is proven three ways (see
// features/daily-octoechos-parse.md) — 48/48 day alignment against the existing
// corpus, themes derived from the book's own markers, and the parish's own
// packets reproduced at two different tones (tone1 and tone4 wednesday).

const fs   = require('fs');
const path = require('path');
const { parseDailyOctoechos, EVENINGS } = require('../server-lib/sources/daily-octoechos-parse');

const ROOT   = path.resolve(__dirname, '..');
const BOOK   = path.join(ROOT, 'reference', 'books', 'daily-octoechos-mtmary.pdf');
const TARGET = path.join(ROOT, 'variable-sources', 'octoechos.json');
const SRC    = 'mtMaryDailyOctoechos';
const PRIMARY = 3;   // the primary set; the book prints exactly these

function main() {
  const apply = process.argv.includes('--apply');
  if (!fs.existsSync(BOOK)) {
    console.error(`Book not found: ${path.relative(ROOT, BOOK)}`);
    console.error('Fetch it from ponomar.net/data/octoechos_week_days_MtMary.pdf');
    process.exit(2);
  }

  const parsed = parseDailyOctoechos(BOOK);
  const data   = JSON.parse(fs.readFileSync(TARGET, 'utf8'));

  const ops = [];
  const skipped = [];

  for (let t = 1; t <= 8; t++) {
    for (const eve of EVENINGS) {
      const node = parsed.tones[`tone${t}`]?.[eve];
      if (!node) { skipped.push({ tone: t, eve, reason: 'withheld by the parser' }); continue; }

      const ours = data[`tone${t}`]?.[eve]?.vespers?.lordICall?.hymns;
      if (!Array.isArray(ours) || ours.length < PRIMARY) {
        skipped.push({ tone: t, eve, reason: `our node has ${ours ? ours.length : 0} hymns` });
        continue;
      }
      const book = node.lordICall.slice(0, PRIMARY);
      if (book.length < PRIMARY) {
        skipped.push({ tone: t, eve, reason: `book printed ${book.length} stichera` });
        continue;
      }
      // The Theotokion is the hymn the book prints after "Glory... Now and
      // ever...", and the parser now tags it from that heading. This replaced
      // an exact-count rule ("entry 3 of exactly 4") that left every
      // differently-sized node unconverted — 7 Lord-I-Call Theotokia and 1
      // Aposticha, each then surfacing as a lone St. Sergius hymn among 7-8
      // from the parish's book.
      const licTheotokion = node.lordICall.find(h => h.afterGlory) || null;

      // Aposticha: the stichera before that heading, then the Theotokion.
      const apoTheotokion = node.aposticha.find(h => h.afterGlory) || null;
      const apoStichera   = node.aposticha.filter(h => !h.afterGlory);
      const apo = apoTheotokion && apoStichera.length >= 3
        ? [...apoStichera.slice(0, 3), apoTheotokion]
        : null;

      ops.push({ tone: t, eve, book, licTheotokion, apo });
    }
  }

  console.log(apply ? 'APPLYING' : 'DRY RUN (pass --apply to write)');
  console.log(`  replacing hymns 0-${PRIMARY - 1} in ${ops.length} weekday nodes (${ops.length * PRIMARY} hymns)`);
  console.log(`  leaving hymns ${PRIMARY}-5 (the secondary set) untouched`);
  if (skipped.length) {
    console.log(`\n  skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`    tone${s.tone} ${s.eve}: ${s.reason}`);
  }
  console.log('\n  sample — tone1 wednesday:');
  const sample = ops.find(o => o.tone === 1 && o.eve === 'wednesday');
  if (sample) {
    const before = data.tone1.wednesday.vespers.lordICall.hymns;
    for (let i = 0; i < PRIMARY; i++) {
      console.log(`    [${i}] was: ${before[i].text.replace(/\s+/g, ' ').slice(0, 62)}`);
      console.log(`         now: ${sample.book[i].text.replace(/\s+/g, ' ').slice(0, 62)}`);
    }
  }

  if (!apply) { console.log('\nNothing written.'); return; }

  let nLic = 0, nTheo = 0, nApo = 0;
  for (const op of ops) {
    const vesp = data[`tone${op.tone}`][op.eve].vespers;

    op.book.forEach((h, i) => {
      // Keep the slot's own verse/order metadata; only text and source change.
      vesp.lordICall.hymns[i] = { ...vesp.lordICall.hymns[i], text: h.text, _source: SRC };
      nLic++;
    });

    if (op.licTheotokion && vesp.lordICall.theotokion) {
      vesp.lordICall.theotokion = { ...vesp.lordICall.theotokion,
                                    text: op.licTheotokion.text, _source: SRC };
      nTheo++;
    }

    if (op.apo && Array.isArray(vesp.aposticha?.hymns) && vesp.aposticha.hymns.length >= 3) {
      for (let i = 0; i < 3; i++) {
        vesp.aposticha.hymns[i] = { ...vesp.aposticha.hymns[i], text: op.apo[i].text, _source: SRC };
      }
      // Our node stores the same closing hymn under BOTH `glory` and
      // `theotokion`; keep that shape rather than reinterpreting it here.
      for (const k of ['glory', 'theotokion']) {
        if (vesp.aposticha[k]) vesp.aposticha[k] = { ...vesp.aposticha[k], text: op.apo[3].text, _source: SRC };
      }
      nApo++;
    }
  }
  console.log(`  lordICall stichera: ${nLic} | lordICall Theotokia: ${nTheo} | aposticha nodes: ${nApo}`);

  data._meta.sources['all.<weekday>.vespers.lordICall.hymns[0-2]'] =
    'Daily Octoechos, ponomar.net/data/octoechos_week_days_MtMary.pdf — the book St John of ' +
    'Damascus, Tyler sings the weekday cycle from, established from their own choir sheets ' +
    '(verbatim match at tone 1 and tone 4 Wednesday, bar `thou`->`ye` where the address is ' +
    'plural). Only the PRIMARY set of three is replaced: the book prints the three sung when ' +
    'a Menaion saint supplies the other three. Hymns 3-5, the secondary set (angels, ' +
    'Forerunner, St Nicholas and so on), are not printed in this book and remain stSergius. ' +
    `Parsed by server-lib/sources/daily-octoechos-parse.js; tagged _source: '${SRC}'.`;

  fs.writeFileSync(TARGET, JSON.stringify(data, null, 2) + '\n');
  console.log(`\nwrote ${ops.length * PRIMARY} hymns into ${path.relative(ROOT, TARGET)}`);
}

if (require.main === module) main();
