#!/usr/bin/env node
'use strict';

// LLM-as-judge: compare an assembled service against the canonical OCA
// reference DOCX for the same date, flag discrepancies via Claude. This
// catches the semantic bugs the rule-based auditor can't see — translation
// nuance, missing rubrical phrases, subtle ordering issues — at ~$0.005/date.
//
// Usage:
//   ANTHROPIC_API_KEY=sk-ant-... node audit/llm-judge.js --date 2026-05-31
//   node audit/llm-judge.js --date 2026-05-31 --service liturgy --http http://localhost:3000

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env at repo root if present (no dependency on dotenv).
(() => {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const [, k, vRaw] = m;
    if (process.env[k]) continue;
    process.env[k] = vRaw.replace(/^['"]|['"]$/g, '');
  }
})();

// Sonnet 4.6 — Haiku 4.5 wasn't reliable enough on liturgical reasoning
// (1 false positive per clean date even after prompt tightening). Sonnet
// brings noticeably better domain knowledge at ~3x the cost (~$0.015/run).
// Adaptive thinking lets the model decide when to reason carefully; medium
// effort balances quality vs. token usage for a per-date audit.
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You are an expert in Orthodox Christian liturgical practice and OCA English-language service translations.

You will receive:
1. The OCA published service text for a date (extracted from a DOCX, may include Vespers, Matins, and Liturgy)
2. The assembled output of a service-text generator (block-by-block dump) for ONE specific service

CRITICAL SCOPE NOTE: the assembled output covers ONE service at a time (vespers OR matins OR liturgy). The reference DOCX typically contains the FULL Saturday-night Vigil (Vespers + Matins) followed by the Divine Liturgy on Sunday morning, all in one document. You MUST ignore reference sections that are not part of the service being audited.

When auditing a Divine Liturgy:
- IGNORE reference sections: "Lord I Call", "Aposticha", "Litya", "Old Testament Readings", "(at Great Vespers)", "(at Vigil)" — these are Vespers.
- IGNORE: "Matins Gospel", "Matins Prokeimenon", "Praises", "Antiphons of Degrees", "Polyeleos" — these are Matins.
- AUDIT: antiphons (First/Second/Third), Trisagion, Liturgy Prokeimenon, Epistle, Alleluia, Gospel, megalynarion ("Instead of 'It is truly meet'"), Communion Hymn, Liturgy Troparia/Kontakia.

Identify SPECIFIC, ACTIONABLE discrepancies in the audited service. Focus on:
- Wrong, missing, or extra sections within the audited service
- Substitutions not applied (e.g., baptismal Trisagion on Pentecost/Bright Week/Nativity/Theophany)
- Translation mode mismatches — ONLY flag if the assembled text clearly uses "you/your" where OCA uses "thee/thy". READ the assembled text carefully before flagging.
- Wrong or missing feast labels
- Wrong troparion text, wrong communion hymn, wrong megalynarion

DO NOT flag:
- Whitespace, formatting, or capitalization differences
- Verse numbering differences
- Section-name synonyms ("Lauds" vs "The Praises", "Aposticha" vs "Apostichon")
- Music notation marks (// or ^ in OCA published text)
- Reference document header/footer ("Department of Liturgical Music…", page numbers)
- Missing optional rubrics that are bracketed in the reference

Known assembler conventions — DO NOT flag any of these as bugs:
- VESPERS LIC RESURRECTIONAL SET: when the Octoechos data for a tone ships only 6 resurrectional stichera but the slot count is 7 (Sunday Great Vespers with 3 saint stichera), the first sticheron is intentionally sung twice (at the V.10 and V.9 verses). This is OCA convention for tones whose source has 6 hymns. If the assembled output repeats the first sticheron at the first two verse positions, this is correct.
- VESPERS DISMISSAL THEOTOKION: the Dismissal Theotokion is keyed by the RESURRECTIONAL TROPARION TONE, not by an OCA reference table's published tone. If our resurrectional troparion is Tone 2, the Dismissal Theotokion is the Tone 2 ("All beyond thought, all most glorious…") even if the reference DOCX shows a different tone's Theotokion. Do not flag a tone disagreement here.
- SUNDAY LITURGY KONTAKIA RESTRUCTURE: on ordinary Sundays (no great feast / polyeleos+ saint cocelebration), the Sunday Liturgy Kontakia intentionally render as: [optional patron Kontakion] + Glory: principal saint or patron Kontakion + Now-and-ever: "Protection of Christians..." Theotokion-Kontakion. The Resurrection Kontakion ("Hell became afraid…" / "On this day Thou didst rise…" / etc.) is INTENTIONALLY DROPPED because the Sunday is carried by the Resurrection Troparion in the Troparia section. Do not flag the absence of the Resurrection Kontakion on ordinary Sundays. (See server-lib/routes/api-liturgy.js:169 for the rubric rationale.)
- SAINT-SPECIFIC vs GENERAL-TEMPLATE TROPARION: many saints have a PROPER troparion (Tone-N, podoben-tagged, addressing the specific saint by name and biography) that the OCA Service Book sometimes substitutes with the general martyr/hierarch/monastic template ("Thy holy martyr [N], O Lord, through his sufferings…"). When the assembled output uses a Tone-X proper saint troparion and the reference uses the Tone-4 general martyr template, do NOT flag this — both are valid OCA Service Book entries and our DB prefers the proper text when available.

Common afterfeast / festal substitutions (do NOT flag these):
- During an afterfeast, the post-Communion "We have seen the true Light" is replaced by the festal troparion (e.g., during the Ascension afterfeast, the Ascension troparion "Thou didst ascend in glory" is sung in its place).
- The dismissal Magnify hymn ("Magnify, O my soul…") changes per feast — different text on Ascension, Pentecost, Theophany, etc.
- The megalynarion ("Instead of 'It is truly meet'") changes per feast.

Output format: a JSON array of findings. Each finding:
{
  "severity": "high" | "medium" | "low",
  "section": "<liturgical section name>",
  "issue": "<one-sentence description of the discrepancy>",
  "hint": "<where to look in the code, if obvious — else omit>"
}

If clean, return [].

Be conservative. False positives erode trust faster than missed catches build it. When in doubt about whether something is intentional, do NOT flag.

CRITICAL self-check before emitting each finding: re-read your own "issue" text. If the issue contains phrases like "matches the reference", "is correct", "correctly uses", "this is correct for", "appears to be labeling confusion in the reference itself" — DELETE the finding. If after reasoning you conclude the assembled output is correct or the discrepancy is in the reference document's labeling rather than in the assembled output, the finding should not be in the array. Only include findings where you are confident the assembled output is wrong.`;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { args[key] = true; }
    else { args[key] = next; i++; }
  }
  return args;
}

function compactDate(date) {
  return date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1-$2$3');
}

async function fetchAssembled(httpBase, service, date) {
  const endpoint = service === 'vespers' ? 'service' : service;
  const r = await fetch(`${httpBase}/api/${endpoint}?date=${date}`);
  if (!r.ok) return null;
  return await r.json();
}

function findLocalReference(date) {
  const ymd = compactDate(date);
  const candidates = [
    `reference/${ymd}-texts-tt.docx`,
    `reference/orders/${ymd}-order-services.txt`,
    `reference/orders/${ymd}-order-services.docx`,
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function fetchOcaReference(date) {
  const ymd = compactDate(date);
  const url = `https://files.oca.org/service-texts/${ymd}-texts-tt.docx`;
  const tmp = path.join('/tmp', `oca-${date}.docx`);
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(tmp, buf);
    return tmp;
  } catch (_) { return null; }
}

function extractText(filepath) {
  if (filepath.endsWith('.txt')) return fs.readFileSync(filepath, 'utf8');
  // DOCX is a zip; word/document.xml has the body text.
  return execSync(
    `unzip -p "${filepath}" word/document.xml | sed 's|<[^>]*>| |g' | tr -s ' '`,
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
}

// OCA weekly DOCXes typically lay out as: Vespers stichera / aposticha / litya /
// OT readings → (at Great Vespers) Troparion → (at Vigil) → (at the Divine
// Liturgy) Troparion → Liturgy Prokeimenon/Epistle/Alleluia/Gospel/megalynarion/
// Communion Hymn. For a Liturgy audit, splitting at "(at the Divine Liturgy)"
// drops the entire Vespers+Matins prelude — the source of most false positives
// on the first pass. If the marker isn't present (some feast DOCXes use other
// headings), return the full text unchanged.
function scopeReferenceToService(refText, service) {
  if (service !== 'liturgy') return refText;
  const marker = /\(at the Divine Liturgy\)/i;
  const m = refText.match(marker);
  if (!m) return refText;
  return refText.slice(m.index);
}

function blocksToText(blocks) {
  return (blocks || []).map(b => {
    const sec = b.section ? `[${b.section}]` : '';
    const lbl = b.label   ? ` (${b.label})` : '';
    const spk = b.speaker ? `${b.speaker}: ` : '';
    return `${sec}${lbl} ${spk}${(b.text || '').replace(/\s+/g, ' ').trim()}`;
  }).join('\n');
}

async function judge(client, date, service, assembled, refText) {
  const assembledText = blocksToText(assembled.blocks);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium' },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `## OCA Reference (canonical) — ${date}\n\n${refText}`,
          },
          {
            type: 'text',
            text: `## Assembled Output — ${service} on ${date}\n` +
                  `Label: ${assembled.liturgicalLabel || '(none)'}\n` +
                  `Season: ${assembled.season || '(none)'}\n` +
                  `Tone: ${assembled.tone || '(none)'}\n` +
                  `Block count: ${(assembled.blocks || []).length}\n\n` +
                  `${assembledText}\n\n` +
                  `Report findings now as a JSON array per the schema in the system prompt. Return [] if clean.`,
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n');

  return { text, usage: response.usage };
}

function tryParseFindings(text) {
  // Model usually returns markdown-wrapped JSON or bare JSON; try a few shapes.
  const fenced = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
  const raw    = fenced ? fenced[1] : (text.match(/\[[\s\S]*\]/) || [])[0];
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) {}

  // Fall back: max_tokens cut the output mid-array. Salvage findings up to
  // the last complete object before the cutoff so we don't lose what the
  // model already wrote. Look for a JSON-array opening, walk object-by-object
  // matching braces, stop at the first incomplete one.
  const open = text.indexOf('[');
  if (open < 0) return null;
  const out = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; continue; }
    if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch (_) {}
        start = -1;
      }
    }
    if (c === ']' && depth === 0) break;
  }
  return out.length > 0 ? out : null;
}

// Single-date/service judge invocation. Returns { findings, usage, refPath,
// elapsed, error? }; NEVER throws. Called by both the single-date CLI path
// and the --sweep loop. Reuses `client` so cache_read hits accumulate.
async function judgeOne(client, httpBase, date, service, { verbose = true } = {}) {
  if (verbose) console.log(`LLM judge: ${date} ${service} (model: ${MODEL})`);

  const assembled = await fetchAssembled(httpBase, service, date);
  if (!assembled || !assembled.blocks) {
    return { error: `fetch failed: ${service} @ ${date}` };
  }
  if (verbose) console.log(`  assembled: ${assembled.blocks.length} blocks`);

  const referenceDate = service === 'vespers'
    ? new Date(new Date(date + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
    : date;
  let refPath = findLocalReference(referenceDate);
  if (!refPath) {
    if (verbose) console.log(`  no local reference; fetching from oca.org (ref date ${referenceDate})…`);
    refPath = await fetchOcaReference(referenceDate);
  }
  if (!refPath) {
    return { error: `no OCA reference DOCX for ${referenceDate}` };
  }
  if (verbose) console.log(`  reference: ${refPath}`);

  const refTextFull = extractText(refPath);
  const refText = scopeReferenceToService(refTextFull, service);
  if (verbose && refText.length < refTextFull.length) {
    console.log(`  reference: ${refText.length} chars (trimmed from ${refTextFull.length})`);
  }

  const start = Date.now();
  let result;
  try {
    result = await judge(client, date, service, assembled, refText);
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `API ${e.status}: ${e.message}` : String(e);
    return { error: msg };
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const u = result.usage;
  if (verbose) console.log(`  done in ${elapsed}s — in=${u.input_tokens} cache_r=${u.cache_read_input_tokens || 0} out=${u.output_tokens}`);

  const findings = tryParseFindings(result.text);
  return { findings, usage: u, refPath, elapsed, rawText: result.text };
}

// Sonnet 4.6 pricing (as of 2026-07): $3/M input, $15/M output, cache read $0.30/M.
// Rough per-run estimate used only for CLI progress display.
function costFor(u) {
  if (!u) return 0;
  const inCost = ((u.input_tokens - (u.cache_read_input_tokens || 0)) / 1e6) * 3.0;
  const cacheCost = ((u.cache_read_input_tokens || 0) / 1e6) * 0.30;
  const outCost = (u.output_tokens / 1e6) * 15.0;
  return inCost + cacheCost + outCost;
}

// Build the sweep date list: Sundays + rank-bearing weekdays + Great Feasts
// across a year. Deduped, sorted. Skips dates where no OCA-published service
// texts exist (out of scope for the judge — those dates use stSergius etc.).
function generateSweepDates(year, opts = {}) {
  const cal = require('../calendar-rules.js');
  const { VIGIL_SAINTS, POLYELEOS_SAINTS } = require('../calendar/fixed-feasts.js');

  const dates = new Set();
  const DAY = 86400000;

  // Sundays: all 52.
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const firstSunOffset = (7 - jan1.getUTCDay()) % 7;
  for (let d = firstSunOffset; d < 365; d += 7) {
    const day = new Date(jan1.getTime() + d * DAY);
    if (day.getUTCFullYear() === year) dates.add(day.toISOString().slice(0, 10));
  }
  // Rank-bearing fixed dates.
  for (const md of [...VIGIL_SAINTS.keys(), ...POLYELEOS_SAINTS.keys()]) {
    const [m, d] = md.split('-').map(Number);
    dates.add(`${year}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
  }
  // Great Feasts: iterate the year and pick any date with getGreatFeastKey != null.
  for (let d = 0; d < 365; d++) {
    const day = new Date(Date.UTC(year, 0, 1) + d * DAY);
    if (cal.getGreatFeastKey(day)) dates.add(day.toISOString().slice(0, 10));
  }
  return Array.from(dates).sort();
}

async function runSweep(args) {
  const httpBase = args.http || 'http://localhost:3000';
  const year     = args.year ? parseInt(args.year, 10) : new Date().getUTCFullYear();
  const services = (args.services ? String(args.services) : 'vespers,liturgy').split(',');
  const limit    = args.limit ? parseInt(args.limit, 10) : null;

  let dates;
  if (typeof args.dates === 'string') {
    dates = args.dates.split(',').map(s => s.trim()).filter(Boolean);
  } else {
    dates = generateSweepDates(year);
  }
  if (limit) dates = dates.slice(0, limit);

  const total = dates.length * services.length;
  console.log(`Sweep: ${dates.length} dates × ${services.length} services = ${total} runs`);
  console.log(`Services: ${services.join(', ')}`);
  console.log(`Estimated cost @ $0.03-0.10/run: $${(total * 0.03).toFixed(2)}-$${(total * 0.10).toFixed(2)}`);
  console.log('');

  const client = new Anthropic();
  const results = [];
  const errors  = [];
  let totalCost = 0;
  let idx = 0;

  for (const date of dates) {
    for (const service of services) {
      idx++;
      const prefix = `[${idx}/${total}]`;
      process.stdout.write(`${prefix} ${date} ${service}… `);
      const t0 = Date.now();
      const r = await judgeOne(client, httpBase, date, service, { verbose: false });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.error) {
        console.log(`SKIP (${r.error})`);
        errors.push({ date, service, error: r.error });
        continue;
      }
      const cost = costFor(r.usage);
      totalCost += cost;
      const count = r.findings?.length ?? -1;
      const summary = count < 0 ? 'PARSE FAIL' :
        `${count} findings` +
        (count > 0 ? ` (${r.findings.filter(f=>f.severity==='high').length}h/${r.findings.filter(f=>f.severity==='medium').length}m/${r.findings.filter(f=>f.severity==='low').length}l)` : '');
      console.log(`${summary} · ${elapsed}s · $${cost.toFixed(3)} · total $${totalCost.toFixed(2)}`);
      results.push({ date, service, ...r });
    }
  }

  // Aggregate report.
  const reportPath = path.join(__dirname, 'reports', `judge-sweep-${year}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const md = [];
  md.push(`# LLM Judge Sweep Report — ${year}`);
  md.push('');
  md.push(`**Model:** ${MODEL}`);
  md.push(`**Scope:** ${dates.length} date(s) × ${services.length} service(s) = ${total} runs`);
  md.push(`**Completed:** ${results.length} · **Skipped:** ${errors.length}`);
  md.push(`**Cost:** ~$${totalCost.toFixed(2)}`);
  md.push('');

  // Findings by class — group by section + issue-prefix so recurring drift shows up.
  const allFindings = [];
  for (const r of results) {
    for (const f of (r.findings || [])) {
      allFindings.push({ ...f, date: r.date, service: r.service });
    }
  }
  const bySeverity = { high: [], medium: [], low: [] };
  for (const f of allFindings) (bySeverity[f.severity] || bySeverity.low).push(f);

  md.push(`## Summary`);
  md.push('');
  md.push(`- High: ${bySeverity.high.length}`);
  md.push(`- Medium: ${bySeverity.medium.length}`);
  md.push(`- Low: ${bySeverity.low.length}`);
  md.push(`- Dates with 0 findings: ${results.filter(r => r.findings?.length === 0).length}`);
  md.push(`- Dates with parse failure: ${results.filter(r => !r.findings).length}`);
  md.push('');

  if (errors.length) {
    md.push(`## Skipped (${errors.length})`);
    md.push('');
    for (const e of errors) md.push(`- ${e.date} ${e.service} — ${e.error}`);
    md.push('');
  }

  for (const sev of ['high', 'medium', 'low']) {
    const items = bySeverity[sev];
    if (!items.length) continue;
    md.push(`## ${sev[0].toUpperCase() + sev.slice(1)} severity (${items.length})`);
    md.push('');
    // Group by section then by issue keyword-cluster
    const bySection = {};
    for (const f of items) (bySection[f.section || '(unspecified)'] ??= []).push(f);
    const sortedSections = Object.keys(bySection).sort((a, b) => bySection[b].length - bySection[a].length);
    for (const section of sortedSections) {
      md.push(`### ${section} (${bySection[section].length})`);
      md.push('');
      for (const f of bySection[section]) {
        md.push(`- \`${f.date} ${f.service}\` — ${f.issue}`);
        if (f.hint) md.push(`  - hint: ${f.hint}`);
      }
      md.push('');
    }
  }

  fs.writeFileSync(reportPath, md.join('\n'));
  console.log('');
  console.log(`Sweep complete: ${results.length}/${total} runs, ${allFindings.length} findings, ~$${totalCost.toFixed(2)}`);
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  return { results, errors, totalCost };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it before running:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  // Sweep mode
  if (args.sweep) {
    await runSweep(args);
    return;
  }

  if (!args.date) {
    console.error('Usage:');
    console.error('  node audit/llm-judge.js --date YYYY-MM-DD [--service liturgy] [--http http://localhost:3000]');
    console.error('  node audit/llm-judge.js --sweep [--year 2026] [--services vespers,liturgy] [--limit 10] [--dates a,b,c]');
    process.exit(1);
  }
  const date     = args.date;
  const service  = args.service || 'liturgy';
  const httpBase = args.http    || 'http://localhost:3000';

  const client = new Anthropic();
  const r = await judgeOne(client, httpBase, date, service);
  if (r.error) { console.error(r.error); process.exit(1); }
  const u = r.usage;
  const findings = r.findings;

  const summary = findings
    ? `${findings.length} finding(s) — ` +
      ['high','medium','low'].map(s => `${findings.filter(f => f.severity === s).length} ${s}`).join(', ')
    : 'could not parse findings as JSON';

  const reportPath = path.join(__dirname, 'reports', `llm-judge-${date}-${service}.md`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });

  const md = [];
  md.push(`# LLM Judge Report — ${date} / ${service}`);
  md.push('');
  md.push(`**Model:** ${MODEL}`);
  md.push(`**Reference:** ${r.refPath}`);
  md.push(`**Tokens:** input ${u.input_tokens} · cache_write ${u.cache_creation_input_tokens || 0} · cache_read ${u.cache_read_input_tokens || 0} · output ${u.output_tokens}`);
  md.push(`**Wall time:** ${r.elapsed}s`);
  md.push(`**Summary:** ${summary}`);
  md.push('');

  if (findings && findings.length) {
    for (const sev of ['high', 'medium', 'low']) {
      const items = findings.filter(f => f.severity === sev);
      if (!items.length) continue;
      md.push(`## ${sev[0].toUpperCase() + sev.slice(1)} severity (${items.length})`);
      md.push('');
      for (const f of items) {
        md.push(`- **${f.section || '(unspecified)'}** — ${f.issue}`);
        if (f.hint) md.push(`  - hint: ${f.hint}`);
      }
      md.push('');
    }
  } else if (findings && findings.length === 0) {
    md.push('_No discrepancies flagged._');
    md.push('');
  } else {
    md.push('## Raw model output (parse failed)');
    md.push('');
    md.push('```');
    md.push(r.rawText);
    md.push('```');
  }

  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  console.log('');
  console.log(summary);

  if (!findings) process.exit(3);
  if (findings.some(f => f.severity === 'high')) process.exit(2);
  if (findings.length > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
