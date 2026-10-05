'use strict';

// Parse the Lord-I-Call section out of an OCA published service-text DOCX.
//
// Chunk 3 of the OCA-standardisation plan needs to know not merely that OCA
// published a given day, but whether that file actually prints a given saint's
// stichera — and then to lift them verbatim. Reading the day's text by eye
// settles one commemoration; 87 of them needs a parser.
//
// The documents are strikingly regular:
//
//     V. (3) For with the Lord there is mercy...        <- psalm verse delimiter
//     Tone 4(for St. Hierotheus)(Thou hast given a sign) <- whose, and the podoben
//     Having received the grace of the Holy Spirit,      <- the sticheron,
//     ...                                                   one line per phrase
//     and with Him the Son...,//                         <- // marks the last phrase
//     Who was born of a Virgin as a man endowed with flesh.
//     V. (2) Praise the Lord, all nations!...           <- next sticheron
//     ...
//     Glory to the Father, and to the Son, and to the Holy Spirit;
//     Tone 2(for St. Hierotheus)                         <- the doxastikon
//     ...
//     now and ever, and unto ages of ages. Amen.         <- section ends
//
// This parser is deliberately strict: it returns what it can prove and leaves
// the rest alone. A sticheron it cannot attribute with confidence is NOT
// returned, because the cost of a wrong attribution here is a parish singing the
// wrong saint's hymn — the exact failure this whole plan exists to stop.

const { execFileSync } = require('child_process');

/** DOCX → plain lines, one per <w:p>. */
function docxLines(docxPath) {
  let xml;
  try {
    xml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml'],
                       { maxBuffer: 64 * 1024 * 1024, timeout: 30000 }).toString('utf8');
  } catch (e) {
    throw new Error(`cannot read ${docxPath}: ${e.message}`);
  }
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]*>/g, '')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

const RE_VERSE   = /^V\.\s*\(\s*(\d+)\s*\)/;
const RE_TONE    = /^Tone\s+(\d+)\s*\(([^)]*)\)\s*(?:\(([^)]*)\))?\s*$/;
const RE_GLORY   = /^Glory to the Father/i;
const RE_NOWEVER = /^now and ever/i;
const RE_LIC     = /^Lord,? I call upon Thee/i;

/**
 * The house convention for a stored sticheron: phrases joined with spaces, and
 * the `//` final-phrase mark becomes a newline. 1,144 of 1,147 oca-menaion rows
 * already look like this and none uses `//`.
 */
function joinPhrases(lines) {
  const text = lines.join(' ').replace(/\s+/g, ' ').trim();
  return text.replace(/\s*\/\/\s*/g, '\n').trim();
}

/** "for St. Hierotheus" → "St. Hierotheus"; "for the Resurrection" stays. */
function subjectOf(raw) {
  return String(raw || '').replace(/^for\s+/i, '').trim();
}

/**
 * Parse the Lord-I-Call section.
 *
 * Returns { found, stichera: [{tone, subject, podoben, verse, text}], glory, theotokion }
 * where `glory` is the doxastikon after "Glory to the Father…" and `theotokion`
 * the hymn after "now and ever…".
 */
function parseLordICall(docxPath) {
  const lines = docxLines(docxPath);
  const start = lines.findIndex(l => RE_LIC.test(l));
  if (start === -1) return { found: false, stichera: [], glory: null, theotokion: null };

  const out = { found: true, stichera: [], glory: null, theotokion: null };
  let tone = null, subject = null, podoben = null;
  let verse = null, buf = [], phase = 'stichera';

  const flush = () => {
    if (!buf.length) { buf = []; return; }
    const text = joinPhrases(buf);
    buf = [];
    if (!text) return;
    const rec = { tone, subject, podoben, verse, text };
    if (phase === 'glory')          out.glory = rec;
    else if (phase === 'theotokion') out.theotokion = rec;
    else if (verse != null)          out.stichera.push(rec);
    // A body with no preceding verse delimiter inside the stichera phase is
    // unattributable — dropped rather than guessed at.
  };

  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];

    const mTone = RE_TONE.exec(l);
    if (mTone) {
      flush();
      tone    = Number(mTone[1]);
      subject = subjectOf(mTone[2]);
      podoben = mTone[3] ? mTone[3].trim() : null;
      // "Tone 1(Theotokion – Dogmatikon)" after "now and ever" closes the section.
      if (phase === 'theotokion' && /theotokion|dogmatik/i.test(subject)) continue;
      continue;
    }

    if (RE_VERSE.test(l)) {
      flush();
      verse = Number(RE_VERSE.exec(l)[1]);
      continue;
    }
    if (RE_GLORY.test(l))   { flush(); phase = 'glory';      verse = null; continue; }
    if (RE_NOWEVER.test(l)) { flush(); phase = 'theotokion'; verse = null; continue; }

    // The Aposticha open with their own "Tone N(for …)" and no "Lord, I call",
    // so the section is closed by the Theotokion having been captured.
    if (phase === 'theotokion' && out.theotokion) break;

    buf.push(l);
  }
  flush();
  return out;
}

/**
 * The stichera in this file belonging to `subjectPattern`, or [] when the file
 * does not print that saint's own stichera — which is the common case for a
 * minor commemoration on a day OCA published for someone else.
 */
function sticheraFor(docxPath, subjectPattern) {
  const parsed = parseLordICall(docxPath);
  if (!parsed.found) return { found: false, stichera: [], glory: null };
  const re = subjectPattern instanceof RegExp ? subjectPattern : new RegExp(subjectPattern, 'i');
  return {
    found: true,
    stichera: parsed.stichera.filter(s => re.test(s.subject || '')),
    glory: parsed.glory && re.test(parsed.glory.subject || '') ? parsed.glory : null,
    all: parsed,
  };
}

module.exports = { docxLines, parseLordICall, sticheraFor, joinPhrases, subjectOf };
