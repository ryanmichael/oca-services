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

// Haiku 4.5 — user explicitly named it as the cheap path. Doesn't support
// `effort` or `thinking`; structured-output keyword check is enough here.
const MODEL = 'claude-haiku-4-5';

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
    max_tokens: 4096,
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
  try { return JSON.parse(raw); } catch (_) { return null; }
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY not set. Set it before running:');
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));
  if (!args.date) {
    console.error('Usage: node audit/llm-judge.js --date YYYY-MM-DD [--service liturgy] [--http http://localhost:3000]');
    process.exit(1);
  }
  const date     = args.date;
  const service  = args.service || 'liturgy';
  const httpBase = args.http    || 'http://localhost:3000';

  console.log(`LLM judge: ${date} ${service} (model: ${MODEL})`);

  const assembled = await fetchAssembled(httpBase, service, date);
  if (!assembled || !assembled.blocks) {
    console.error(`Failed to fetch ${service} for ${date} from ${httpBase}`);
    process.exit(1);
  }
  console.log(`  assembled: ${assembled.blocks.length} blocks`);

  let refPath = findLocalReference(date);
  if (!refPath) {
    console.log('  no local reference; fetching from oca.org…');
    refPath = await fetchOcaReference(date);
  }
  if (!refPath) {
    console.error(`  no OCA reference DOCX available for ${date}`);
    console.error('  this date may fall outside OCA\'s published weekly service-texts');
    process.exit(2);
  }
  console.log(`  reference: ${refPath}`);

  const refTextFull = extractText(refPath);
  const refText = scopeReferenceToService(refTextFull, service);
  const trimmed = refText.length < refTextFull.length;
  console.log(`  reference text: ${refText.length} chars${trimmed ? ` (trimmed from ${refTextFull.length} — Vespers prelude dropped)` : ''}`);

  const client = new Anthropic();
  console.log(`  calling ${MODEL}…`);
  const start = Date.now();
  let result;
  try {
    result = await judge(client, date, service, assembled, refText);
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error(`API error ${e.status}: ${e.message}`);
    } else {
      console.error('judge error:', e);
    }
    process.exit(1);
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const u = result.usage;
  console.log(`  done in ${elapsed}s — input=${u.input_tokens} cache_write=${u.cache_creation_input_tokens || 0} cache_read=${u.cache_read_input_tokens || 0} output=${u.output_tokens}`);

  const findings = tryParseFindings(result.text);
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
  md.push(`**Reference:** ${refPath}`);
  md.push(`**Tokens:** input ${u.input_tokens} · cache_write ${u.cache_creation_input_tokens || 0} · cache_read ${u.cache_read_input_tokens || 0} · output ${u.output_tokens}`);
  md.push(`**Wall time:** ${elapsed}s`);
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
    md.push(result.text);
    md.push('```');
  }

  fs.writeFileSync(reportPath, md.join('\n'));
  console.log(`Report: ${path.relative(process.cwd(), reportPath)}`);
  console.log('');
  console.log(summary);
}

main().catch(e => { console.error(e); process.exit(1); });
