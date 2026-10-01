#!/usr/bin/env node
'use strict';

/**
 * CLI: ingest one choir-director blast into docs/choir-packets/<email-date>/.
 *
 *   node scripts/choir-mail-fetch.js --source manual --from <dir> --email-date 2026-09-24
 *   node scripts/choir-mail-fetch.js --source manual --from <dir> --email-date 2026-09-24 --dry-run
 *
 * Phase 1 supports `--source manual` only: the attachments are already on disk
 * (dragged out of Gmail by hand). `--source imap` lands in Phase 2 — see
 * docs/choir-email-pipeline-design.md §7. Everything downstream of this script
 * depends only on the folder it produces, so the fetch mechanism can change
 * without touching the review workflow.
 *
 * Deterministic and model-free, so it can run unattended. It classifies and
 * files; it never reads the liturgical content and never edits service texts.
 *
 * Exit codes:  0 = ok   2 = a REVISED attachment needs re-review   1 = usage/IO error
 */

const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const { parseAttachment } = require('./choir-mail-parse.js');
const choirOcr            = require('./choir-ocr.js');

const REPO     = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(REPO, 'docs', 'choir-packets');
const DIRECTOR = 'cjruss63@gmail.com';

// ── args ───────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { source: 'manual', out: DEFAULT_OUT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--source')     out.source    = argv[++i];
    else if (a === '--from')       out.from      = argv[++i];
    else if (a === '--email-date') out.emailDate = argv[++i];
    else if (a === '--subject')    out.subject   = argv[++i];
    else if (a === '--body')       out.body      = argv[++i];
    else if (a === '--exclude')  (out.exclude ||= []).push(argv[++i]);
    else if (a === '--out')        out.out       = path.resolve(argv[++i]);
    else if (a === '--dry-run')    out.dryRun    = true;
    else if (a === '--no-ocr')     out.noOcr     = true;
    else if (a === '--json')       out.json      = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(`unknown argument: ${a}`); process.exit(1); }
  }
  return out;
}

const USAGE = `
Usage: node scripts/choir-mail-fetch.js --source manual --from <dir> --email-date YYYY-MM-DD

  --source manual     attachments already on disk (Phase 1; 'imap' arrives in Phase 2)
  --from <dir>        folder holding this blast's attachments
  --email-date <iso>  the date the email was SENT — names the packet folder and
                      resolves year-less filenames. Required; never guessed.
  --subject <text>    optional, recorded in the manifest
  --body <file>       optional plain-text email body; a stub is written without it
  --exclude <substr>  skip files whose name contains this (repeatable). A drop
                      folder may hold OUR OWN documents — docs/9-7/ held a 17MB
                      print of backlog-2026-08-29-vespers-liturgy-review, which
                      the parser would otherwise file as a Great Vespers packet.
  --out <dir>         default docs/choir-packets
  --dry-run           classify and report, write nothing
  --no-ocr            skip the OCR sidecar (macOS only; ~1.5s a page)
  --json              machine-readable manifest to stdout
`.trimStart();

// ── file probes (degrade quietly if poppler is absent) ────────────────────

const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

function pdfPages(f) {
  try {
    const out = execFileSync('pdfinfo', [f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const m = out.match(/^Pages:\s+(\d+)/m);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/**
 * These packets are scans: 0 text characters is the norm, not an error. Record
 * it so the review step knows up front that pdftotext is useless here and the
 * pages must be read visually.
 */
function textChars(f) {
  try {
    const out = execFileSync('pdftotext', [f, '-'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.replace(/\s+/g, '').length;
  } catch { return null; }
}

// ── prior state: every hash and every stored name we already hold ─────────

function loadIndex(outDir) {
  const byHash = new Map();   // sha256 → { packet, original, stored }
  if (!fs.existsSync(outDir)) return byHash;
  for (const packet of fs.readdirSync(outDir).sort()) {
    const mf = path.join(outDir, packet, 'manifest.json');
    if (!fs.existsSync(mf)) continue;
    let data;
    try { data = JSON.parse(fs.readFileSync(mf, 'utf8')); } catch { continue; }
    for (const a of data.attachments || []) {
      if (a.sha256 && !byHash.has(a.sha256)) {
        byHash.set(a.sha256, { packet, original: a.original, stored: a.stored });
      }
    }
  }
  return byHash;
}

const hasDupeSuffix = (f) => (/\s\(\d+\)\.[A-Za-z0-9]+$/.test(f) ? 1 : 0);

/**
 * Whichever file is processed first becomes the canonical copy and supplies
 * `original` in the manifest, so un-suffixed names must come first. A plain
 * sort does the opposite: "… (1).pdf" precedes "….pdf" because space (0x20)
 * sorts below dot (0x2e).
 */
const canonicalOrder = (a, b) =>
  hasDupeSuffix(a) - hasDupeSuffix(b) || a.localeCompare(b);

/** `pdf/x.pdf` → `pdf/x-r2.pdf`, then -r3 … */
function revisionName(stored, n) {
  const ext = path.extname(stored);
  return `${stored.slice(0, -ext.length)}-r${n}${ext}`;
}

// ── main ──────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }

  if (args.source !== 'manual') {
    console.error(`--source ${args.source} is not implemented yet (Phase 1 is manual-only).`);
    console.error('See docs/choir-email-pipeline-design.md §7.');
    return 1;
  }
  if (!args.from || !args.emailDate) { console.error(USAGE); return 1; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.emailDate)) {
    console.error(`--email-date must be YYYY-MM-DD, got "${args.emailDate}"`);
    return 1;
  }
  if (!fs.existsSync(args.from) || !fs.statSync(args.from).isDirectory()) {
    console.error(`--from is not a directory: ${args.from}`);
    return 1;
  }

  const packetDir = path.join(args.out, args.emailDate);
  const pdfDir    = path.join(packetDir, 'pdf');
  const index     = loadIndex(args.out);

  // Carry forward anything already recorded for this packet, so a re-run is
  // additive rather than destructive.
  const manifestPath = path.join(packetDir, 'manifest.json');
  let prior = null;
  if (fs.existsSync(manifestPath)) {
    try { prior = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { prior = null; }
  }
  const priorByStored = new Map((prior?.attachments || []).map((a) => [a.stored, a]));

  // Order matters: whichever file is seen first becomes the canonical copy and
  // supplies `original` in the manifest. A plain readdir sort puts
  // "… (1).pdf" BEFORE "….pdf" (space 0x20 < dot 0x2e), which would record the
  // re-download as the provenance. Un-suffixed names therefore sort first.
  const excluded = [];
  const candidates = fs.readdirSync(args.from)
    .filter((f) => !f.startsWith('.'))
    .filter((f) => fs.statSync(path.join(args.from, f)).isFile())
    .filter((f) => /\.pdf$/i.test(f))
    .filter((f) => {
      const hit = (args.exclude || []).find((x) => f.includes(x));
      if (hit) { excluded.push({ filename: f, matched: hit }); return false; }
      return true;
    })
    .sort(canonicalOrder);

  if (candidates.length === 0) {
    console.error(`no PDFs in ${args.from}`);
    return 1;
  }

  const attachments = [];
  const unresolved  = [];
  const skipped     = [];
  const revisions   = [];
  const takenStored = new Set();

  for (const filename of candidates) {
    const src  = path.join(args.from, filename);
    const hash = sha256(src);
    const r    = parseAttachment(filename, args.emailDate);

    // Identical bytes we already hold — the "(1).pdf" case. Never stored twice.
    const seen = index.get(hash);
    if (seen) {
      skipped.push({ filename, reason: `identical to ${seen.packet}/${seen.stored}`, sha256: hash });
      continue;
    }

    // Same slot, different bytes = the director re-sent a corrected sheet.
    let stored = r.stored;
    if (takenStored.has(stored) || priorByStored.has(stored)) {
      const existing = priorByStored.get(stored);
      let n = 2;
      while (takenStored.has(revisionName(stored, n)) || priorByStored.has(revisionName(stored, n))) n++;
      const revised = revisionName(stored, n);
      revisions.push({ filename, supersedes: stored, stored: revised });
      if (existing) existing.supersededBy = revised;
      stored = revised;
    }
    takenStored.add(stored);

    const entry = {
      ...r,
      stored,
      sha256: hash,
      bytes: fs.statSync(src).size,
      pages: pdfPages(src),
      textChars: textChars(src),
    };
    entry.hasTextLayer = entry.textChars === null ? null : entry.textChars > 0;
    delete entry.textChars;

    if (entry.apiPath && entry.apiDate) {
      entry.apiUrl = `${entry.apiPath}?date=${entry.apiDate}`;
    }
    if (entry.kind === 'unclassified') {
      unresolved.push({ filename, stored, reasons: entry.reasons });
    }
    attachments.push(entry);
    index.set(hash, { packet: args.emailDate, original: filename, stored });
  }

  // The director can send TWO blasts in one day: on 2026-09-04 the weekly
  // "Blast 09.04" (15:32) was followed by "Feast of the Most Holy Theotokos
  // Music" (17:12) — "I will send music later today". A single `subject` field
  // would lose one of them, so provenance is a list and each attachment names
  // the message that carried it.
  const thisMessage = {
    subject: args.subject || null,
    sourceDir: path.relative(REPO, path.resolve(args.from)),
    fetchedAt: new Date().toISOString(),
    attachments: attachments.length,
  };
  for (const a of attachments) a.messageSubject = thisMessage.subject;

  const messages = [...(prior?.messages || [])];
  // Re-ingesting the same folder is not a new message.
  if (attachments.length || !messages.some((m) => m.sourceDir === thisMessage.sourceDir)) {
    messages.push(thisMessage);
  }

  const allAttachments = [...(prior?.attachments || []), ...attachments];
  const tones = [...new Set(allAttachments.map((a) => a.tone).filter(Boolean))];

  const manifest = {
    emailDate: args.emailDate,
    sender: DIRECTOR,
    subject: prior?.subject || args.subject || null,   // first seen, for a glance
    messages,
    source: 'manual',
    fetchedAt: thisMessage.fetchedAt,
    weekTone: tones.length === 1 ? tones[0] : (tones.length ? tones : null),
    attachments: allAttachments,
    directives: prior?.directives || [],
    unresolved: [...(prior?.unresolved || []), ...unresolved],
    skipped,
    excluded,
  };

  // ── report ──────────────────────────────────────────────────────────────
  if (args.json) {
    console.log(JSON.stringify(manifest, null, 2));
  } else {
    console.log(`\nPacket ${args.emailDate}  →  ${path.relative(REPO, packetDir)}${args.dryRun ? '   (DRY RUN)' : ''}`);
    if (manifest.weekTone) console.log(`Week tone (per the director): ${manifest.weekTone}`);

    if (revisions.length) {
      console.log('\n  REVISED — re-review required:');
      for (const r of revisions) {
        console.log(`    ! ${r.filename}`);
        console.log(`        supersedes ${r.supersedes} → stored as ${r.stored}`);
      }
    }

    const svc = attachments.filter((a) => a.kind === 'service');
    if (svc.length) {
      console.log('\n  Services:');
      for (const a of svc) {
        const shift = a.contentDate !== a.apiDate ? `  content← ${a.contentDate}` : '';
        const conf  = a.confidence === 'high' ? '' : `  [${a.confidence}]`;
        console.log(`    ${a.serviceLabel.padEnd(22)} ${a.apiUrl}${shift}${conf}`);
        console.log(`        ${a.original}  (${a.pages ?? '?'}pp, ${a.hasTextLayer ? 'has text' : 'SCAN — read visually'})`);
        for (const why of a.reasons) console.log(`        · ${why}`);
      }
    }

    for (const a of attachments.filter((x) => x.kind === 'tone')) {
      console.log(`\n  Tone packet: tone ${a.tone}  ← ${a.original} (${a.pages ?? '?'}pp)`);
    }

    if (unresolved.length) {
      console.log('\n  UNRESOLVED — filed under pdf/_unclassified/, decide by hand:');
      for (const u of unresolved) {
        console.log(`    ? ${u.filename}`);
        for (const why of u.reasons) console.log(`        · ${why}`);
      }
    }

    if (skipped.length) {
      console.log('\n  Already held (identical bytes):');
      for (const s of skipped) console.log(`    = ${s.filename}  ${s.reason}`);
    }

    if (excluded.length) {
      console.log('\n  Excluded by --exclude (NOT ingested):');
      for (const e of excluded) console.log(`    x ${e.filename}  (matched "${e.matched}")`);
    }
    console.log();
  }

  // ── write ───────────────────────────────────────────────────────────────
  if (!args.dryRun) {
    fs.mkdirSync(path.join(pdfDir, '_unclassified'), { recursive: true });
    for (const a of attachments) {
      const dest = path.join(packetDir, a.stored);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(args.from, a.original), dest);
    }
    // ── OCR sidecar ────────────────────────────────────────────────────
    //
    // The scans carry no text layer, so without this the only way to read a
    // packet is by eye, page by page. Vision OCR is near-perfect on the typed
    // pages — which is where the day's variable propers live — and partial on
    // the music scores, which carry settings of hymns we already hold.
    //
    // An INDEX over the scan, never a source: nothing here may be authored
    // into fixed-texts or the DB.
    // Every attachment still missing a sidecar, not only the ones copied in
    // this run — so a re-run backfills packets ingested before OCR existed,
    // and a byte-identical re-send does not silently skip it.
    const needOcr = manifest.attachments.filter(
      (a) => !a.ocr && !a.supersededBy && /\.pdf$/i.test(a.stored || ''));
    if (!args.noOcr && needOcr.length) {
      if (!choirOcr.available()) {
        if (!args.json) console.log('  (OCR skipped — needs macOS with swiftc and pdftoppm)');
      } else {
        const ocrDir = path.join(packetDir, 'ocr');
        fs.mkdirSync(ocrDir, { recursive: true });
        if (!args.json) console.log('\n  OCR:');
        for (const a of needOcr) {
          const pdf = path.join(packetDir, a.stored);
          if (!/\.pdf$/i.test(pdf) || !fs.existsSync(pdf)) continue;
          let r;
          try { r = choirOcr.ocrPdf(pdf); }
          catch (err) {
            if (!args.json) console.log(`    ! ${a.original}: ${err.message}`);
            continue;
          }
          const base = path.basename(a.stored).replace(/\.pdf$/i, '.txt');
          fs.writeFileSync(path.join(ocrDir, base), r.text);
          a.ocr = { file: `ocr/${base}`, pages: r.pages, textPages: r.textPages,
                    musicPages: r.musicPages, chars: r.chars };
          if (!args.json) {
            console.log(`    ${base.padEnd(34)} ${r.textPages} text / ${r.musicPages} music pages, ${r.chars} chars`);
          }
        }
      }
    }

    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const bodyPath = path.join(packetDir, 'body.md');
    if (!fs.existsSync(bodyPath)) {
      const bodyText = args.body ? fs.readFileSync(args.body, 'utf8') : null;
      fs.writeFileSync(bodyPath, bodyStub(args.emailDate, manifest.subject, bodyText));
    }
    if (!args.json) console.log(`  wrote ${path.relative(REPO, manifestPath)}\n`);
  }

  return revisions.length ? 2 : 0;
}

function bodyStub(emailDate, subject, text) {
  return `# Choir blast — ${emailDate}

${subject ? `**Subject:** ${subject}\n` : ''}
## Email text

${text ? text.trim() : `<!-- Paste the plain-text email body here. The body carries rubric
directives that appear in NO attachment — e.g. the 2026-09-24 blast introduced
the Byzantine "Lord Have Mercy" with the Troparion to St John of Damascus after
the Thanksgiving prayers, "trumped by the feast" on a feast or afterfeast. -->`}

## Directives

<!-- One row per instruction in the body that affects what we render.
     PROPOSED only — nothing here is applied. Route via /choir-correction. -->

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| | | | | |
`;
}

if (require.main === module) {
  // process.exit() discards stdout still queued for a pipe, which truncated
  // --json output at 64 KB. Set the code and let Node flush and exit on its own.
  try { process.exitCode = main(); }
  catch (err) { console.error(err.message); process.exitCode = 1; }
}

module.exports = { parseArgs, revisionName, loadIndex, canonicalOrder, hasDupeSuffix };
