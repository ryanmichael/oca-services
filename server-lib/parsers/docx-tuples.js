'use strict';

// Rescrape harness — DOCX → sticheron tuples.
//
// Two layers:
//   docxToLines(path)  — low-level: word/document.xml → [{text, bold, centered}]
//                        with syllable-split runs rejoined and entities decoded.
//   parseDocx(path)    — grammar: line stream → StichereonTuple[] segmented by
//                        commemoration + section.
//
// Zero npm deps: shells out to `unzip -p` (the project keeps a minimal dep set).
// See docs/rescrape-harness-design.md § Parser design.

const { execFileSync } = require('child_process');

// ─── Layer 1: DOCX → lines ───────────────────────────────────────────────────

function readDocumentXml(docxPath) {
  // -p streams the entry to stdout; large maxBuffer for the biggest DOCXs.
  return execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');  // last, so "&amp;lt;" -> "&lt;" not "<"
}

// Detect run-property bold that isn't <w:bCs/> (complex-script) and isn't an
// explicit <w:b w:val="0"/> disable.
const BOLD_RE = /<w:b(?:\s+w:val="(?:true|1|on)")?\s*\/>/;
const CENTER_RE = /<w:jc\s+w:val="center"\s*\/>/;

// One <w:p>…</w:p> paragraph → its visible text (runs joined with NO separator
// so chant syllable-splits like "cal"+"l" rejoin to "call"; tabs/breaks → space).
function paragraphText(paraXml) {
  const tokenRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>|<w:cr\s*\/>/g;
  let out = '';
  let m;
  while ((m = tokenRe.exec(paraXml)) !== null) {
    if (m[1] !== undefined) out += decodeEntities(m[1]);
    else out += ' ';
  }
  return out;
}

function docxToLines(docxPath) {
  const xml = readDocumentXml(docxPath);
  const bodyStart = xml.indexOf('<w:body>');
  const scope = bodyStart >= 0 ? xml.slice(bodyStart) : xml;

  const lines = [];
  const paraRe = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
  let m;
  let lastBlank = false;
  while ((m = paraRe.exec(scope)) !== null) {
    const inner = m[1];
    const raw = paragraphText(inner);
    const text = raw.replace(/\s+/g, ' ').trim();
    if (!text) {
      // Emit one blank marker per run of spacing paragraphs. Blank lines
      // reliably separate stichera and never appear mid-hymn, so the grammar
      // uses them as a sticheron boundary.
      if (!lastBlank && lines.length) { lines.push({ text: '', blank: true }); lastBlank = true; }
      continue;
    }
    lastBlank = false;
    lines.push({
      text,
      bold: BOLD_RE.test(inner),
      centered: CENTER_RE.test(inner),
    });
  }
  return lines;
}

// ─── Layer 2: lines → tuples ─────────────────────────────────────────────────

// Section anchors (case-insensitive, matched at line start).
const SECTION_ANCHORS = [
  { re: /^["“]?\s*Lord,?\s*I\s*(?:Call|Have Cried)/i, section: 'lordICall' },
  { re: /^Aposticha\b/i,                              section: 'aposticha' },
  { re: /^Litya\b/i,                                  section: 'litya' },
  { re: /^Troparia?\b/i,                              section: 'troparia' },
  { re: /^Kontakion\b/i,                              section: 'kontakia' },
];

// Lines that terminate the sticheron-bearing region (Liturgy/readings/psalter).
const TERMINATORS = [
  /^\(?\s*at the Divine Liturgy/i,
  /^Old Testament Readings\b/i,
  /^Prokeimenon\b/i,
  /^The Reading is from\b/i,
];

// Scripture-reading citation ("Genesis 14:14-20", "Wisdom of Solomon 3:1-9").
// These appear bold under an "Old Testament Readings" heading and must never be
// mistaken for a commemoration title.
const READING_CITATION_RE =
  /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Songs|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Wisdom(?: of Solomon)?|Sirach|Baruch|Maccabees|Tobit|Judith|Isaias|Jeremias|Ezekias)\b.*\d+\s*:\s*\d+/i;

// Day-header noise to skip before the first section (weekday, month-day, tone,
// "Nth Sunday of…", "Afterfeast of…" is a *commemoration* so NOT skipped here).
const DAYHEADER_RE = [
  /^(SUNDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY)\b/i,
  /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d/i,
  /^TONE\s+\d/i,
  /^\d+(?:st|nd|rd|th)\s+(Sunday|Week)\b/i,
];

// Verse markers ("V. (10)"), standalone tone markers, Glory / Now doxastika.
const VERSE_RE   = /^V\.\s/i;                                // psalm-verse stichon slot ("V. (10) …" or "V. Create in me…")
const TONE_RE    = /^Tone\s+([1-8])\b\s*(.*)$/i;            // "Tone 6 (for the Resurrection)"
// Only the FIXED lesser-doxology intro is a section marker. A bare "Glory to
// Thee!" / "Glory to Thee, O Lord!" is a sticheron's final REFRAIN, not a
// doxastikon boundary — matching it here split ~60 stichera off their last line.
const GLORY_RE   = /^Glory to the Father\b/i;
const NOW_RE     = /^(Now and ever|Both now)\b/i;

// A standalone label line like "(for the Resurrection)" or "(for the Fathers)".
const PAREN_LABEL_RE = /^\(([^)]{2,60})\)\s*$/;

function isSectionAnchor(text) {
  for (const a of SECTION_ANCHORS) if (a.re.test(text)) return a.section;
  return null;
}

function isTerminator(text) {
  return TERMINATORS.some(re => re.test(text));
}

function isDayHeader(text) {
  return DAYHEADER_RE.some(re => re.test(text));
}

// A commemoration title: a bold, Title-Case-ish standalone line before/between
// sticheron groups that is not a section anchor, verse, tone, or day header.
function looksLikeCommemorationTitle(line) {
  const t = line.text;
  if (!line.bold) return false;
  if (isSectionAnchor(t) || isTerminator(t) || isDayHeader(t)) return false;
  if (READING_CITATION_RE.test(t)) return false;
  if (VERSE_RE.test(t) || TONE_RE.test(t) || GLORY_RE.test(t) || NOW_RE.test(t)) return false;
  if (PAREN_LABEL_RE.test(t)) return false;
  // Titles are short-ish headings, not full hymn sentences. Hymns run long and
  // end in sentence punctuation; a title rarely exceeds ~80 chars.
  if (t.length > 90) return false;
  return true;
}

// Extract a section-anchor's inline tone if present ("…Tone 6").
function inlineTone(text) {
  const m = text.match(/Tone\s+([1-8])\b/i);
  return m ? parseInt(m[1], 10) : null;
}

// A sticheron spans several lines; they accumulate in a buffer that flushes to
// one tuple on the next structural boundary (verse marker, tone marker,
// Glory/Now, section anchor, commemoration title, or terminator).
function parseDocx(docxPath, { sourceDate = null } = {}) {
  const lines = docxToLines(docxPath);
  const tuples = [];

  let commemoration = null;   // current commemoration title (null until first)
  let section = null;         // current section key
  let sectionTone = null;     // tone carried by the section anchor
  let pendingTone = null;     // tone from a "Tone N" marker (persists to flush)
  let pendingLabel = null;    // label from "(for the …)" or tone-line trailer
  let nextOrder = null;       // 0 = Glory, -1 = Now; else sequential
  let orderCounter = 0;
  let inHeader = true;
  let buffer = [];            // lines of the sticheron currently being built

  const flush = () => {
    if (!section || buffer.length === 0) { buffer = []; return; }
    const order = nextOrder != null ? nextOrder : ++orderCounter;
    tuples.push({
      sourceDate,
      commemorationTitle: commemoration,
      section,
      order,
      tone: pendingTone != null ? pendingTone : sectionTone,
      label: pendingLabel,
      text: buffer.join(' '),
    });
    buffer = [];
    nextOrder = null;
    pendingTone = null;
    pendingLabel = null;
  };

  for (const line of lines) {
    if (line.blank) { flush(); continue; }   // sticheron boundary
    const t = line.text;

    if (isTerminator(t)) { flush(); section = null; continue; }
    if (READING_CITATION_RE.test(t)) { flush(); continue; }

    const anchorSection = isSectionAnchor(t);
    if (anchorSection) {
      flush();
      section = anchorSection;
      sectionTone = inlineTone(t);
      pendingTone = null;
      pendingLabel = null;
      nextOrder = null;
      orderCounter = 0;
      inHeader = false;
      continue;
    }

    if (inHeader && isDayHeader(t)) continue;

    // Verse marker — flush the previous sticheron; discard the psalm-verse line.
    if (VERSE_RE.test(t)) { flush(); continue; }

    const toneMatch = t.match(TONE_RE);
    if (toneMatch) {
      flush();
      pendingTone = parseInt(toneMatch[1], 10);
      const trailer = toneMatch[2] && toneMatch[2].trim();
      if (trailer) {
        const pl = trailer.match(PAREN_LABEL_RE);
        pendingLabel = pl ? pl[1] : trailer.replace(/^[()]|[()]$/g, '') || null;
      }
      continue;
    }

    if (GLORY_RE.test(t)) {   // fixed doxology intro; hymn follows on next lines
      flush();
      nextOrder = 0;
      continue;
    }
    if (NOW_RE.test(t)) {     // fixed "Now and ever" intro; Theotokion follows
      flush();
      nextOrder = -1;
      continue;
    }

    const plMatch = t.match(PAREN_LABEL_RE);
    if (plMatch) { pendingLabel = plMatch[1]; continue; }

    if (looksLikeCommemorationTitle(line)) {
      flush();
      commemoration = t;
      continue;
    }

    // Ordinary sticheron body line — accumulate.
    if (section) buffer.push(t);
  }
  flush();

  return tuples;
}

module.exports = { parseDocx, docxToLines };
