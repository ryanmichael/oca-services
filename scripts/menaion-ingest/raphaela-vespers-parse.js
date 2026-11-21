'use strict';
// Parse the Vespers propers of one Mother Raphaela day-file (textutil txt) —
// Lord I Call, the Litya and the Aposticha — into hymns.
//
//   parseVespers(txt) -> { lordICall: [H], litya: [H], aposticha: [H], issues: [] }
//   H = { tone, slot: null|'glory'|'now'|'gloryNow', text, repeat, verse }
//
// Why a second parser beside raphaela-parse.js: that one reads the ordinary
// day layout ("“Lord I Call...”", "Tone 1", "Apostikha") and returns nothing
// for the great-feast layout ("LORD, I HAVE CRIED", "TONE ONE", inline "(8)"
// psalm verses, "LITYA", "APOSTICHA") — November 21 among them — and it never
// reads the Litya in either layout. The St John of Damascus choir sings this
// corpus (memory: feedback_tyler_match_connie), so the feasts and the Litya
// are exactly the hymns it cannot afford to miss.
//
// One rule carries both layouts: the corpus marks the final phrase of every
// hymn with "//" and puts that phrase on the next line, so a hymn ends on the
// line AFTER its "//" line. Headings, tone lines, Glory/Now markers, psalm
// verses and repeat cues ("Today let us…") are boundaries, never text.

const TONE_WORDS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8 };
const MONTH_HDR  = /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/;

function sectionOf(t) {
  if (/^[“"]?Lord,?\s+I\s+(Call|Have\s+Cried)\b/i.test(t)) return 'lordICall';
  if (/^Litya\b/i.test(t)) return 'litya';
  if (/^(Apostikha|Aposticha)\b/i.test(t)) return /Matins/i.test(t) ? 'stop' : 'aposticha';
  if (/^(Matins|Troparion|Dis+missal|Kontakion|Sessional|Canon\b|Ode\b|Prokeimenon|Readings?\b|Old Testament|Hymn of Light|The Praises|Praises\b|Exapostilarion|Magnification|Great Doxology|Blessing of the Loaves|Canticle|Katavasia|Ikos|Polyeleos|Gospel|Divine Liturgy|Beatitudes|Communion)/i.test(t)) return 'stop';
  if (/^\(After the (first|second|third) reading/i.test(t)) return 'stop';
  return null;
}

function toneOf(t) {
  const d = t.match(/\bTone\s+(\d)\b/i);
  if (d) return +d[1];
  const w = t.match(/\bTONE\s+(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT)\b/i);
  return w ? TONE_WORDS[w[1].toUpperCase()] : null;
}

function slotOf(t) {
  if (/^Glory\.\.\./i.test(t)) return /Now and ever|Both now/i.test(t) ? 'gloryNow' : 'glory';
  if (/^(Now and ever|Both now)/i.test(t)) return 'now';
  return null;
}

function clean(line) {
  return line.replace(/\/\/\s*/g, '').replace(/\s*\((Twice|Thrice|2x|3x)\)\s*$/i, '').replace(/\s+$/, '');
}

function parseVespers(txt) {
  const lines = String(txt).replace(/…/g, '...').replace(/ /g, ' ').split('\n');
  const out = { lordICall: [], litya: [], aposticha: [], issues: [] };
  // The title block (every line before the first section heading) recurs as a
  // page header through the file — "Virgin Martyr Cecelia of Rome…" came back
  // as a sticheron. Same rule as raphaela-parse.js.
  const titleLines = new Set();
  for (const l of lines) {
    const t = l.trim();
    if (!t) continue;
    if (sectionOf(t) && sectionOf(t) !== 'stop') break;
    titleLines.add(t);
  }
  let sec = null, tone = null, slot = null, cur = [], afterSlash = false, repeat = 1, verse = null, expectPodoben = false;

  const flush = (why) => {
    const text = cur.map(clean).filter(Boolean).join('\n').trim();
    if (sec && sec !== 'stop' && text) {
      if (text.split(/\s+/).length < 8) out.issues.push(`${sec}: short hymn dropped at ${why}: "${text.slice(0, 40)}"`);
      else out[sec].push({ tone, slot, text, repeat, verse });
    }
    cur = []; afterSlash = false; repeat = 1; verse = null; slot = null;
  };

  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    // Page headers and the recurring title block are never text and never a
    // boundary — a hymn can run across a page break.
    // 112 files also carry running headers like
    // "Theotokos Nativity: “Lord I Call...”        Page Two".
    if (MONTH_HDR.test(t) || titleLines.has(t)) continue;
    if (/\s{3,}page\s+\w+\s*$/i.test(raw) || /\(continued\)/i.test(t)) continue;

    const ns = sectionOf(t);
    if (ns) {
      flush('section');
      sec = ns; tone = toneOf(t); slot = null;
      if (/To the special melody/i.test(t)) expectPodoben = true;
      continue;
    }
    if (!sec || sec === 'stop') continue;

    // Glory / Now markers (may carry a tone and an attribution on the same line)
    const sl = slotOf(t);
    if (sl) { flush('glory'); slot = sl; const tt = toneOf(t); if (tt) tone = tt; continue; }

    // Tone headings: "Tone 1", "TONE ONE", "Tone 4 (As one valiant…)", "(Same tone)"
    if (/^(Tone\s+\d|TONE\s+[A-Z]+)\b/i.test(t) && toneOf(t)) {
      if (cur.length) flush('tone');
      tone = toneOf(t);
      if (/To the special melody/i.test(t)) expectPodoben = true;
      continue;
    }
    if (/^\(?(Same tone|In the same tone)\)?/i.test(t)) { if (cur.length) flush('same tone'); continue; }
    if (/^To the special melody/i.test(t)) { expectPodoben = true; continue; }

    // Psalm verse lines of Lord I Call, "(8) Out of the depths…"
    if (/^\(\d{1,2}\)\s/.test(t)) { if (cur.length) flush('verse'); continue; }
    // Attributions / labels on their own line: "(By George of Nicomedia)"
    if (/^\(.*\)\s*$/.test(t)) { if (cur.length && !afterSlash) flush('label'); continue; }
    // Repeat cue: "Today let us…" (an ellipsis-ended incipit of a hymn already given)
    if (/\.\.\.\s*$/.test(t) && t.split(/\s+/).length <= 9 && !cur.length) continue;

    if (expectPodoben) {
      expectPodoben = false;
      if (!cur.length && t.split(/\s+/).length <= 7 && !/[,.;:!?]$/.test(t)) continue;  // the podoben's name
    }

    // Aposticha psalm verse: one complete line sitting between two hymns.
    // Real verses are long ("She is led to the King, with her virgin
    // companions, her escort, in her train!"); a short exclamation is the
    // first line of the next hymn ("Come, all earth-born mortals!", April 7).
    if (sec === 'aposticha' && !cur.length && /[!.]$/.test(t) && !t.includes('//') && slot === null
        && out.aposticha.length > 0 && t.split(/\s+/).length >= 9) {
      verse = t; continue;
    }

    if (/\((Twice|Thrice|2x)\)\s*$/i.test(t)) repeat = /Thrice/i.test(t) ? 3 : 2;
    cur.push(t);
    if (afterSlash) { flush('final phrase'); continue; }
    if (t.includes('//')) {
      afterSlash = true;
      // "…in song:// Rejoice!" — the final phrase can share the line.
      const tail = t.split('//')[1];
      if (tail && tail.trim().length > 2) flush('inline final phrase');
    }
  }
  flush('end');
  return out;
}

module.exports = { parseVespers };

if (require.main === module) {
  const fs = require('fs');
  const r = parseVespers(fs.readFileSync(process.argv[2], 'utf8'));
  for (const s of ['lordICall', 'litya', 'aposticha']) {
    console.log(`== ${s}`);
    for (const h of r[s]) console.log(`  ${h.slot || '#'} T${h.tone} x${h.repeat}${h.verse ? ' [v]' : ''}  ${h.text.split('\n')[0].slice(0, 60)}`);
  }
  if (r.issues.length) console.log('issues:', r.issues);
}
