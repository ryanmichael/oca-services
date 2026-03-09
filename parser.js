/**
 * OCA Service Text Parser
 *
 * Reads raw word/document.xml files (collected by collector.js) and
 * outputs structured JSON organised by service type and section.
 *
 * Usage:
 *   node parser.js storage/raw/2026-0222-texts-tt-.xml
 *   node parser.js --all       — parse every file in storage/raw/
 *   node parser.js --file foo  — parse one specific file
 *
 * Output: storage/parsed/<same-name>.json
 *
 * Output shape per file:
 * {
 *   _meta: { date, pronoun, sourceFile, parsedAt },
 *   header: { tone, rawLines[], commemorations[] },
 *   services: {
 *     vespers: { sections: { lordICall: { tone, blocks[] }, aposticha: ..., ... } },
 *     liturgy: { sections: { ... } },
 *     ...
 *   }
 * }
 *
 * Block types:
 *   hymn         — underlined text; has tone, label?, verse?, position?, attribution?
 *   verse        — psalm verse that precedes a hymn
 *   glory_marker — "Glory to the Father…" doxology line
 *   now_marker   — "now and ever…" doxology line
 *   rubric       — italic parenthetical instruction
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const RAW_DIR    = path.join(__dirname, 'storage', 'raw');
const PARSED_DIR = path.join(__dirname, 'storage', 'parsed');

// ─── XML helpers ──────────────────────────────────────────────────────────────

/**
 * Extract all top-level <w:p> paragraph blobs from document XML.
 * Word XML is flat for prose documents (no nested paragraphs).
 */
function extractParagraphs(xml) {
  const paras = [];
  const re = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
  let m;
  while ((m = re.exec(xml)) !== null) paras.push(m[0]);
  return paras;
}

/**
 * Concatenate all <w:t> text nodes in a paragraph.
 * Multiple runs are joined; internal whitespace is normalised.
 */
function paraText(xml) {
  const parts = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m;
  while ((m = re.exec(xml)) !== null) parts.push(m[1]);
  // Normalise internal runs of whitespace but preserve intentional spaces
  return parts.join('').replace(/[ \t]+/g, ' ').trim();
}

/**
 * Detect the dominant formatting properties in a paragraph.
 * We scan the entire paragraph blob — paragraph-level defaults and run-level
 * properties are treated equivalently for classification purposes.
 *
 * Word uses w:val="0" to turn off an inherited property; we respect that.
 */
function paraFmt(xml) {
  // Bold: <w:b/> present and not negated by w:val="0"
  const bold = /<w:b(?!\w)/.test(xml) && !/<w:b\s[^>]*w:val="0"/.test(xml);
  // Italic: same pattern for <w:i>
  const italic = /<w:i(?!\w)/.test(xml) && !/<w:i\s[^>]*w:val="0"/.test(xml);
  // Underline: <w:u ...> but not w:val="none"
  const underline = /<w:u\s/.test(xml) && !/<w:u\s[^>]*w:val="none"/.test(xml);
  // Red colour used for structural markers
  const red = /<w:color\s+w:val="FF0000"/i.test(xml);
  // Centre alignment in paragraph properties
  const centered = /<w:jc\s+w:val="center"/.test(xml);

  return { bold, italic, underline, red, centered };
}

// ─── Paragraph classification ─────────────────────────────────────────────────

/**
 * Classify a paragraph by its text content and formatting.
 *
 * Return values:
 *   EMPTY          — no visible text
 *   SERVICE_MARKER — "(at Great Vespers)", "(at the Divine Liturgy)", etc.
 *   SECTION_HEAD   — bold heading naming a liturgical section
 *   TONE_MARKER    — bold+italic line starting "Tone N"
 *   VERSE          — starts with "V." (psalm verse preceding a sticheron)
 *   ATTRIBUTION    — italic parenthetical naming the composer: "(by Anatolius)"
 *   RUBRIC         — other italic parenthetical instruction
 *   GLORY          — italic "Glory to the Father…" doxology marker
 *   NOW            — italic "now and ever…" doxology marker
 *   HYMN           — underlined liturgical text (the sticheron/prayer body)
 *   BOLD_LABEL     — bold non-italic line (document header, commemoration title)
 *   OTHER          — everything else (ignored)
 */
function classify(text, fmt) {
  if (!text) return 'EMPTY';

  // Service context switches
  if (/^\(at\s+(the\s+)?([A-Z]|Vesperal|Great|Divine)/i.test(text) ||
      /^\(at\s+(Vigil|Matins|Liturgy)/i.test(text)) {
    return 'SERVICE_MARKER';
  }

  // Tone header: must start with "Tone N" and be bold+italic (or just italic+red)
  if (/^Tone\s+\d/.test(text) && (fmt.bold || fmt.red)) return 'TONE_MARKER';

  // Section headings: bold, contain recognisable section keywords
  if (fmt.bold && (
    /lord.{0,10}call/i.test(text) ||
    /^aposticha\b/i.test(text) ||
    /^tropar(ion|ia)\b/i.test(text) ||
    /^litya\b/i.test(text) ||
    /^kontakion\b/i.test(text) ||
    /^prokeimenon\b/i.test(text) ||
    /^alleluia\b.*v\./i.test(text) ||
    /^epistle\b/i.test(text) ||
    /^gospel\b/i.test(text) ||
    /^communion\b/i.test(text)
  )) return 'SECTION_HEAD';

  // Psalm verse preceding a sticheron
  if (/^V\./.test(text)) return 'VERSE';

  // Attribution: italic parenthetical with "by"
  if (fmt.italic && /^\(.*\bby\s+\w/i.test(text)) return 'ATTRIBUTION';

  // Other italic parenthetical = rubric
  if (fmt.italic && /^\(/.test(text)) return 'RUBRIC';

  // Doxology separators (italic, standalone)
  if (fmt.italic && /^Glory to the Father/i.test(text)) return 'GLORY';
  if (fmt.italic && /^now and ever/i.test(text)) return 'NOW';

  // Hymn text: underlined
  if (fmt.underline) return 'HYMN';

  // Document header lines: bold, not italic, not underline
  if (fmt.bold && !fmt.italic && !fmt.underline) return 'BOLD_LABEL';

  return 'OTHER';
}

// ─── Metadata helpers ─────────────────────────────────────────────────────────

/** Parse "Tone 4 (for the Resurrection)" → { tone: 4, label: "for the Resurrection" } */
function parseToneMarker(text) {
  const m = text.match(/^Tone\s+(\d+)([\s\S]*)?$/);
  if (!m) return {};
  const tone = parseInt(m[1], 10);
  // Extract first parenthetical group as the label
  const groups = (m[2] || '').match(/\(([^)]+)\)/g) || [];
  const label = groups.length > 0
    ? groups[0].replace(/^\(|\)$/g, '').trim()
    : (m[2] || '').trim() || null;
  return { tone, label: label || null };
}

/** Map section heading text to a canonical key and display name. */
function detectSection(text) {
  if (/lord.{0,10}call/i.test(text))  return { key: 'lordICall',   display: 'Lord, I Have Cried' };
  if (/^aposticha\b/i.test(text))      return { key: 'aposticha',   display: 'Aposticha' };
  if (/^litya\b/i.test(text))          return { key: 'litya',       display: 'Litya' };
  if (/^tropar/i.test(text))           return { key: 'troparia',    display: 'Troparia' };
  if (/^kontakion/i.test(text))        return { key: 'kontakion',   display: 'Kontakion' };
  if (/^prokeimenon/i.test(text))      return { key: 'prokeimenon', display: 'Prokeimenon' };
  if (/^alleluia/i.test(text))         return { key: 'alleluia',    display: 'Alleluia' };
  if (/^epistle/i.test(text))          return { key: 'epistle',     display: 'Epistle' };
  if (/^gospel/i.test(text))           return { key: 'gospel',      display: 'Gospel' };
  if (/^communion/i.test(text))        return { key: 'communion',   display: 'Communion Hymn' };
  return null;
}

/** Map service marker text to a service key. */
function detectServiceType(text) {
  if (/Great\s+Vespers/i.test(text))             return 'vespers';
  if (/Divine\s+Liturgy|^.*Liturgy\b/i.test(text)) return 'liturgy';
  if (/Vesperal\s+Liturgy/i.test(text))          return 'vesperalLiturgy';
  if (/Vigil/i.test(text))                        return 'vigil';
  if (/Matins/i.test(text))                       return 'matins';
  return 'other';
}

// ─── Core parser ──────────────────────────────────────────────────────────────

function parseServiceXml(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const paras = extractParagraphs(xml);

  const fileName = path.basename(xmlPath, '.xml');
  const metaMatch = fileName.match(/^(\d{4})-(\d{2})(\d{2})-texts(?:-([a-z]+))?-(tt|yy)-?$/);
  const fileMeta = metaMatch
    ? { date: `${metaMatch[1]}-${metaMatch[2]}-${metaMatch[3]}`, type: metaMatch[4] || 'main', pronoun: metaMatch[5] }
    : { date: null, type: 'unknown', pronoun: null };

  const result = {
    _meta: {
      sourceFile: path.basename(xmlPath),
      date:       fileMeta.date,
      type:       fileMeta.type,
      pronoun:    fileMeta.pronoun,
      parsedAt:   new Date().toISOString(),
    },
    header: {
      tone:           null,
      rawLines:       [],
      commemorations: [],
    },
    services: {},
  };

  // ── Parser state ────────────────────────────────────────────────────────────
  let inHeader        = true;
  let currentService  = 'vespers';   // default until a SERVICE_MARKER appears
  let currentSection  = null;        // { key, display }
  let currentTone     = null;
  let currentLabel    = null;
  let pendingVerse    = null;        // verse number or text from last VERSE block
  let pendingPosition = null;        // 'glory' | 'now' | null
  let pendingAttrib   = null;        // composer attribution for next hymn
  let hymnLines       = [];          // accumulating underlined lines → one hymn

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function getBlocks() {
    if (!currentSection) return null;
    if (!result.services[currentService]) {
      result.services[currentService] = { sections: {} };
    }
    const sections = result.services[currentService].sections;
    if (!sections[currentSection.key]) {
      sections[currentSection.key] = {
        display: currentSection.display,
        tone:    currentTone,
        blocks:  [],
      };
    }
    return sections[currentSection.key].blocks;
  }

  function flushHymn() {
    if (hymnLines.length === 0) return;
    const text = hymnLines.join('\n');
    hymnLines = [];
    const blocks = getBlocks();
    if (!blocks) return;

    const block = { type: 'hymn', text };
    if (currentTone)     block.tone = currentTone;
    if (currentLabel)    block.label = currentLabel;
    if (pendingVerse !== null)    { block.verse = pendingVerse;    pendingVerse = null; }
    if (pendingPosition !== null) { block.position = pendingPosition; pendingPosition = null; }
    if (pendingAttrib !== null)   { block.attribution = pendingAttrib; pendingAttrib = null; }
    blocks.push(block);
  }

  // ── Main loop ────────────────────────────────────────────────────────────────

  for (const para of paras) {
    const text = paraText(para);
    const fmt  = paraFmt(para);
    const type = classify(text, fmt);

    if (type === 'EMPTY') continue;

    // ── Header mode ─────────────────────────────────────────────────────────
    if (inHeader) {
      if (type === 'SECTION_HEAD' || type === 'TONE_MARKER' || type === 'SERVICE_MARKER') {
        inHeader = false;
        // Fall through to normal processing below
      } else if (type === 'BOLD_LABEL') {
        result.header.rawLines.push(text);
        const toneM = text.match(/\bTONE\s+(\d+)\b/i);
        if (toneM) {
          result.header.tone = parseInt(toneM[1], 10);
          currentTone = result.header.tone;
        } else {
          result.header.commemorations.push(text);
        }
        continue;
      } else {
        result.header.rawLines.push(text);
        result.header.commemorations.push(text);
        continue;
      }
    }

    // ── Service context switch ───────────────────────────────────────────────
    if (type === 'SERVICE_MARKER') {
      flushHymn();
      const svc = detectServiceType(text);
      // "(at Great Vespers)" keeps the service as vespers but starts a new section
      // block (troparia, theotokion, etc.). Always reset the section so the next
      // tone marker can infer it. Only true service switches change currentService.
      if (svc === 'vespers') {
        currentService = 'vespers';
      } else {
        currentService = svc;
      }
      currentSection = null;
      // Add as a rubric so it's visible in the output
      const blocks = getBlocks();
      if (blocks) blocks.push({ type: 'service_marker', text });
      continue;
    }

    // ── Section heading ──────────────────────────────────────────────────────
    if (type === 'SECTION_HEAD') {
      flushHymn();
      const section = detectSection(text);
      if (section) {
        currentSection = section;
        // Tone may be embedded in the heading: "Lord I Call..."  Tone 4
        const m = text.match(/Tone\s+(\d+)/i);
        if (m) currentTone = parseInt(m[1], 10);
      }
      continue;
    }

    // ── Tone marker ──────────────────────────────────────────────────────────
    if (type === 'TONE_MARKER') {
      flushHymn();
      const { tone, label } = parseToneMarker(text);
      if (tone) currentTone = tone;
      currentLabel = label;
      // Infer section from tone marker text when no explicit section heading
      // e.g. "Tone 4    Troparion" or "Tone 2 Kontakion"
      if (!currentSection) {
        if (/tropar/i.test(text))   currentSection = { key: 'troparia',  display: 'Troparia' };
        if (/kontakion/i.test(text)) currentSection = { key: 'kontakion', display: 'Kontakion' };
      }
      continue;
    }

    // ── Psalm verse ──────────────────────────────────────────────────────────
    if (type === 'VERSE') {
      flushHymn();
      const numMatch = text.match(/^V\.\s*\(?(\d+)\)?/);
      pendingVerse = numMatch
        ? parseInt(numMatch[1], 10)
        : text.replace(/^V\.\s*/, '').trim(); // aposticha-style verse text
      const blocks = getBlocks();
      if (blocks) {
        blocks.push({
          type: 'verse',
          text: text.replace(/^V\.\s*/, '').trim(),
          ...(numMatch ? { number: parseInt(numMatch[1], 10) } : {}),
        });
      }
      continue;
    }

    // ── Doxology markers (Glory / Now) ────────────────────────────────────────
    if (type === 'GLORY') {
      flushHymn();
      pendingPosition = 'glory';
      const blocks = getBlocks();
      if (blocks) blocks.push({ type: 'glory_marker', text });
      continue;
    }

    if (type === 'NOW') {
      flushHymn();
      pendingPosition = 'now';
      const blocks = getBlocks();
      if (blocks) blocks.push({ type: 'now_marker', text });
      continue;
    }

    // ── Attribution (applies to the NEXT hymn, so don't flush) ───────────────
    if (type === 'ATTRIBUTION') {
      pendingAttrib = text.replace(/^\(|\)$/g, '').trim();
      continue;
    }

    // ── Rubric ───────────────────────────────────────────────────────────────
    if (type === 'RUBRIC') {
      flushHymn();
      const blocks = getBlocks();
      if (blocks) blocks.push({ type: 'rubric', text });
      continue;
    }

    // ── Hymn text (underlined) ────────────────────────────────────────────────
    if (type === 'HYMN') {
      hymnLines.push(text);
      continue;
    }

    // ── Everything else: flush any open hymn and ignore ───────────────────────
    flushHymn();
  }

  // Flush any trailing hymn lines
  flushHymn();

  return result;
}

// ─── Filename helpers ─────────────────────────────────────────────────────────

function outPath(xmlPath) {
  return path.join(PARSED_DIR, path.basename(xmlPath, '.xml') + '.json');
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function main() {
  fs.mkdirSync(PARSED_DIR, { recursive: true });

  const args = process.argv.slice(2);
  let files = [];

  if (args.includes('--all')) {
    files = fs.readdirSync(RAW_DIR)
      .filter(f => f.endsWith('.xml'))
      .map(f => path.join(RAW_DIR, f));
  } else if (args.includes('--file')) {
    const idx = args.indexOf('--file');
    const f = args[idx + 1];
    files = [path.isAbsolute(f) ? f : path.join(__dirname, f)];
  } else if (args.length > 0 && !args[0].startsWith('--')) {
    // Positional argument
    files = [path.isAbsolute(args[0]) ? args[0] : path.join(__dirname, args[0])];
  } else {
    console.error('Usage:\n  node parser.js <file.xml>\n  node parser.js --all\n  node parser.js --file <path>');
    process.exit(1);
  }

  let ok = 0, fail = 0;

  for (const f of files) {
    try {
      const result = parseServiceXml(f);
      const out    = outPath(f);
      fs.writeFileSync(out, JSON.stringify(result, null, 2));

      // Summary line
      const svcSummary = Object.entries(result.services)
        .map(([svc, data]) => {
          const sections = Object.keys(data.sections).join(', ');
          return `${svc}[${sections}]`;
        })
        .join('  ');

      console.log(`✓  ${path.basename(f).padEnd(42)} tone=${result.header.tone ?? '?'}  ${svcSummary}`);
      ok++;
    } catch (err) {
      console.error(`✗  ${path.basename(f)}: ${err.message}`);
      fail++;
    }
  }

  if (files.length > 1) console.log(`\nParsed: ${ok}  Failed: ${fail}  → ${PARSED_DIR}/`);
}

main();
