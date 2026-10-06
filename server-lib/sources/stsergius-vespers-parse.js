'use strict';

// Parse the Vespers stichera out of a St Sergius "Emenaion" day-file
// (https://st-sergius.org/services/Emenaion/MM-DD.pdf, extracted with
// `pdftotext -layout`).
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The original ingest of this source flattened whole sections into single rows.
// On 05-27 (Hieromartyr Therapont) our four stored rows held:
//
//   order 0  the HEAD of the Theotokion
//   order 1  all three stichera of the hieromartyr, PLUS the rubric "But if
//            Alleluia is to be chanted at Matins…", PLUS the three alternative
//            Theotokos stichera that rubric introduces
//   order 2  the TAIL of the Theotokion (order 0's hymn, continued)
//   order 3  the Stavrotheotokion
//
// 30 rows across 28 dates carry rubric text that a choir is handed as if it were
// a verse, and 4 rows are fragments whose head was swallowed by a neighbour.
// Those are one bug from two ends, and neither is repairable without re-reading
// the source — hence this parser. See test/contracts/text-well-formedness.test.js
// (INV-5 .. INV-8) for the gates that measure it.
//
// ── THE STRUCTURE IT KEYS ON ─────────────────────────────────────────────────
//
// `-layout` output is reliably indented, and that, not the prose, is the signal:
//
//   ind 3        a hymn BEGINS (continuation lines sit at ind 0)
//   ind 5        "Stavrotheotokion:" — also begins a hymn, inline label
//   ind 6-9      a section heading: On "Lord, I have cried ...," N Stichera of …
//   ind 20-41    a centred heading: THE 27th DAY …, AT VESPERS, AT MATINS
//   ind ~22      a slot marker: Glory …, Both now …, Theotokion in Tone VIII:
//   ind ~27      Spec. Mel.: "…" — the podoben
//   ind 1        a CONDITIONAL rubric: "But if Alleluia is to be chanted…"
//
// The conditional rubric matters most. What follows it is an ALTERNATIVE set,
// sung only when Alleluia is appointed at Matins — not three extra stichera for
// the ordinary day. Flattening it is what put a rubric in a verse, so the parser
// marks those hymns `conditional: true` and the caller decides.

const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

const RE_LIC      = /^On\s+[“"]Lord,?\s*I\s+have\s+cried/i;
const RE_APOS     = /^(?:On|At)\s+the\s+Aposticha/i;
const RE_MATINS   = /^AT\s+MATINS\b/i;
const RE_VESPERS  = /^AT\s+VESPERS\b/i;
const RE_SLOT     = /^(Glory\s*\.{2,}|Now\s+and\s+ever|Both\s+now)/i;
const RE_PODOBEN  = /^Spec\.\s*Mel\.\s*:\s*[“"]?(.+?)[”"]?:?\s*$/i;
// A conditional rubric. The narrow first version only matched "But if", "If
// Alleluia" and "If it be", which missed `If “God is the Lord ...” is to be
// chanted at Matins, then we chant:` — that line sits at indent 0, so it was
// absorbed as a CONTINUATION of the preceding hymn and the rubric was written
// into row 9509 as part of a Stavrotheotokion. Key on the rubric's verbs, not on
// how the sentence happens to open.
const RE_COND     = /^(?:But\s+if\b|If\b.*\b(?:is\s+to\s+be\s+(?:chanted|sung)|we\s+(?:chant|sing))|Then\s+we\s+chant\b|we\s+chant\s*:)/i;
const RE_STAVRO   = /^Stavrotheotokion\s*:\s*[“"]?/i;
const RE_TONE     = /\bin\s+Tone\s+([IVX]+)/i;
const RE_COUNT    = /[“"],?\s*(\d+)\s+Sticher/i;

/** Roman tone in a heading, or null. */
function toneOf(line) {
  const m = line.match(RE_TONE);
  return m ? (ROMAN[m[1].toUpperCase()] ?? null) : null;
}

/**
 * @param {string} txt  pdftotext -layout output for one MM-DD file
 * @returns {{lordICall: object[], aposticha: object[], headings: string[]}}
 */
function parseVespers(txt) {
  const lines = String(txt).replace(/ /g, ' ').split('\n');
  const out = { lordICall: [], aposticha: [], headings: [] };

  let section = null;          // 'lordICall' | 'aposticha' | null
  let inVespers = false;
  let cur = null;              // the hymn being accumulated
  let meta = { tone: null, podoben: null, slot: null, conditional: false, label: null };

  const flush = () => {
    if (cur && cur.text.trim()) {
      const text = cur.text.replace(/\s+/g, ' ').trim();
      // A one-line scrap is a stray heading the indent rules misread, not a hymn.
      if (text.split(' ').length >= 8) out[cur.section].push({ ...cur, text });
    }
    cur = null;
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const s = line.trim();
    if (!s) continue;
    const ind = line.length - line.trimStart().length;

    if (RE_MATINS.test(s)) { flush(); break; }        // Vespers only
    if (RE_VESPERS.test(s)) { inVespers = true; continue; }

    // ── section headings ────────────────────────────────────────────────────
    if (RE_LIC.test(s)) {
      flush(); section = 'lordICall'; inVespers = true;
      out.headings.push(s);
      const c = s.match(RE_COUNT);
      meta = { tone: toneOf(s), podoben: null, slot: null, conditional: false,
               label: null, appointed: c ? +c[1] : null };
      continue;
    }
    if (RE_APOS.test(s)) {
      flush(); section = 'aposticha';
      out.headings.push(s);
      const c = s.match(RE_COUNT);
      meta = { tone: toneOf(s), podoben: null, slot: null, conditional: false,
               label: null, appointed: c ? +c[1] : null };
      continue;
    }
    if (!inVespers || !section) continue;

    // ── markers ─────────────────────────────────────────────────────────────
    const pod = s.match(RE_PODOBEN);
    if (pod) { flush(); meta.podoben = pod[1].replace(/\s*\.{2,}\s*$/, '').trim(); continue; }

    if (RE_COND.test(s)) {
      // Everything after this rubric is an ALTERNATIVE set, until the next slot
      // marker or section. This is the line that was being sung as a verse.
      flush(); meta.conditional = true; meta.slot = null;
      const t = toneOf(s); if (t) meta.tone = t;
      continue;
    }

    if (RE_SLOT.test(s)) {
      flush();
      meta.conditional = false;                 // a slot marker ends the alternative set
      meta.slot = /Glory/i.test(s) && !/Both\s+now|Now\s+and\s+ever/i.test(s) ? 'glory'
                : /Glory/i.test(s) ? 'gloryNow' : 'now';
      const t = toneOf(s); if (t) meta.tone = t;
      if (/Theotokion/i.test(s)) meta.label = 'theotokion';
      continue;
    }

    // A centred heading (the date, the commemoration, "Canon of …"). Indent alone
    // is not enough — a hymn's first line sits at 3 and these sit far right — so
    // require both the indent and the absence of sentence punctuation.
    if (ind >= 14 && !/[.!?]$/.test(s) && s.length < 90) {
      flush(); out.headings.push(s);
      const t = toneOf(s); if (t) meta.tone = t;
      continue;
    }

    // ── hymn text ───────────────────────────────────────────────────────────
    const stavro = RE_STAVRO.test(s);
    if (stavro) {
      flush();
      cur = { section, text: s.replace(RE_STAVRO, ''), ...meta, label: 'stavrotheotokion' };
      continue;
    }
    if (ind >= 2 && ind <= 9) {               // a hymn begins
      flush();
      cur = { section, text: s, ...meta };
      continue;
    }
    if (cur) cur.text += ' ' + s;             // continuation
  }
  flush();
  return out;
}

module.exports = { parseVespers, toneOf, ROMAN };
