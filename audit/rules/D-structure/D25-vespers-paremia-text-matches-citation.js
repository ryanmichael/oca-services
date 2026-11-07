'use strict';

// A paremia's printed TEXT must be the text of its own CITATION.
//
// Great Vespers prints each Old Testament lesson as a citation line ("The
// reading from Joshua." / "Joshua 5:13-15") followed by the scripture itself,
// which /api/service fills in from the orthocal mirror. Until 2026-11-07 both
// enrichment call sites paired the two POSITIONALLY — `vesperReadings[i]` —
// which is correct only when orthocal's Vespers list for the day is exactly
// our appointed list, in our order.
//
// On 2026-11-08 (Synaxis of the Archangels) it is not. The mirror carries SIX
// Vespers readings, because upstream also keys the Unmercenaries'
// common-of-a-martyr set to that date (project_orthocal_upstream_defects). The
// three the OCA order appoints sit at indices 1, 3 and 5, so authoring the
// correct citations produced:
//
//     "Joshua 5:13-15"   → the text of Isaiah 43:9-14
//     "Judges 6:2, 7…"   → the text of Joshua 5:13-15
//     "Isaiah 14:7-20"   → the text of Wisdom of Solomon 3:1-9
//
// Three wrong lessons, every one under a correct heading, at 0 high.
//
// THE OBVIOUS RULE WOULD HAVE PASSED IT. "A date whose menaion declares N
// readings must render N lessons" was the invariant this gap suggested, and
// all three lessons rendered, with text, in the right slots: 3 of 3. Only the
// pairing was wrong. So this rule asserts the pairing instead, and it does so
// WITHOUT reusing the matcher it guards: it works backwards from the text that
// was actually printed to the orthocal reading that text belongs to, then
// checks that reading's book against the citation printed above it. A
// positional regression in server-lib/_shared/match-ot-readings.js shows up
// here as a book disagreement, whatever the matcher believes it did.
//
// Fixed in match-ot-readings.js; the citation is the thing we are confident
// about (it comes from the OCA order or the Menaion), so it drives the pairing,
// and an unresolvable lesson prints a bracketed placeholder rather than a
// guess. The placeholder is reported at `low` — the reader opens the book,
// which is recoverable; the wrong lesson read aloud is not.

const fs   = require('fs');
const path = require('path');

const ORTHOCAL_DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'orthocal');

// Keep this deliberately independent of the matcher's alias table: only the
// spellings orthocal itself uses, reduced far enough to compare.
function bookKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/^\s*​?\s*composite\s+\d+\s*[-–—]\s*/, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\d+[:.][\d:.,\s-]*$/, '')   // drop the chapter:verse tail
    .replace(/[^a-z]/g, '')
    .replace(/^(first|1)/, '1')
    .replace(/^(second|2)/, '2');
}

// "Wisdom of Solomon" vs "Wisdom", "I Kings" vs "3 Kings" — our files and the
// OCA orders differ from orthocal's spellings in a handful of fixed ways.
const SAME = [
  ['wisdom', 'wisdomofsolomon'],
  ['1kings', '3kings'], ['ikings', '3kings'], ['3kingdoms', '3kings'],
  ['2kings', '4kings'], ['iikings', '4kings'], ['4kingdoms', '4kings'],
  ['sirach', 'wisdomofsirach'], ['ecclesiasticus', 'wisdomofsirach'],
  ['songofsolomon', 'songofsongs'], ['canticles', 'songofsongs'],
];

// When both sides name the same conflated reading, that number IS the
// agreement — and the books will not line up, because the two sources list
// the conflated books in different orders and at different granularity
// (february-02: "Composite 6 (Exodus 12:51-13:3; Leviticus 12:2-7; Numbers
// 8:16-17)" against "Composite 6 - Exodus 12, 13; Numbers 8; Leviticus 12").
function compositeNo(s) {
  const m = String(s || '').match(/composite\s+(\d+)/i);
  return m ? m[1] : null;
}

function booksAgree(a, b) {
  const ka = bookKey(a), kb = bookKey(b);
  if (!ka || !kb) return true;                 // can't tell — don't cry wolf
  if (ka === kb || ka.includes(kb) || kb.includes(ka)) return true;
  return SAME.some(([x, y]) =>
    (ka.includes(x) && kb.includes(y)) || (ka.includes(y) && kb.includes(x)));
}

// The book alone is not enough. On 2026-07-20 (the Prophet Elias) all three
// lessons come from 3 Kings, and a weak pairing gave Composite 13's citation
// Composite 14's text — same book, different chapter, so a book-only check
// passed it. Compare the opening chapter as well.
function firstChapter(s) {
  const t = String(s || '')
    .replace(/​/g, '')
    .replace(/^\s*composite\s+\d+\s*[-–—(]?\s*/i, '')
    .replace(/(\d)\s*\[\s*\d+\s*\]/g, '$1')   // "3 [1] Kings" -> "3 Kings"
    .replace(/^\s*\d+\s+(?=[A-Za-z])/, '')    // a VOLUME number, not a chapter
    .replace(/^[A-Za-z.\s]+/, '');            // then the book words themselves
  const m = t.match(/^\(?\s*(\d{1,3})/);
  return m ? m[1] : null;
}

function chaptersAgree(a, b) {
  const ca = firstChapter(a), cb = firstChapter(b);
  if (!ca || !cb) return true;   // one side gives no chapter — don't guess
  return ca === cb;
}

function loadOrthocalVespers(dateStr) {
  const p = path.join(ORTHOCAL_DIR, `${dateStr}.json`);
  if (!fs.existsSync(p)) return null;
  try {
    return (JSON.parse(fs.readFileSync(p, 'utf8')).readings || [])
      .filter(r => r.source === 'Vespers');
  } catch { return null; }
}

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

module.exports = {
  id:             'D25-vespers-paremia-text-matches-citation',
  family:         'structure',
  severity:       'high',
  description:    'Each Old Testament lesson at Great Vespers must print the scripture of its own citation. Positional enrichment printed three wrong lessons under three correct headings on 2026-11-08 at 0 high; found 2026-11-07.',
  needsAssembled: true,
  appliesTo: (ctx) =>
    ctx.service === 'vespers'
    && (ctx.calendarEntry?.vespers?.otReadings?.length > 0),
  check: (ctx) => {
    const blocks   = ctx.assembled?.blocks || [];
    const declared = ctx.calendarEntry.vespers.otReadings;
    const findings = [];

    // The lessons the entry declares must all reach the page. A dropped one is
    // the count regression; a mis-paired one is caught below.
    const refs = blocks.filter(b => /^ot-\d+-ref$/.test(String(b.id || '')));
    if (refs.length !== declared.length) {
      findings.push({
        severity: 'high',
        message: `Calendar entry declares ${declared.length} Old Testament lesson(s) at Great Vespers, but ${refs.length} rendered.`,
        hint: 'calendar/entry.js attachPolyeleosParemias attaches them and assemblers/vespers-parts/ot-readings.js renders them; `order` must be present and distinct or the blocks collide on id.',
      });
    }

    // The content day is what the entry (and so the orthocal mirror) holds.
    const vesp = loadOrthocalVespers(ctx.dateForEntry || ctx.date);
    if (!vesp || !vesp.length) return findings;   // no mirror file — nothing to check against

    for (const ref of refs) {
      const n    = String(ref.id).match(/^ot-(\d+)-ref$/)[1];
      const text = blocks.find(b => b.id === `ot-${n}-text`);
      const cite = norm(ref.text);
      if (!text) continue;

      // Unresolved: the renderer prints the citation in brackets.
      if (/^\[.*\]$/.test(norm(text.text))) {
        findings.push({
          severity: 'low',
          message: `Lesson ${n} (${cite}) renders a bracketed placeholder — no scripture text resolved.`,
          hint: 'The orthocal mirror carries no Vespers reading whose citation matches this one. Check the pericope spelling in the menaion file against data/orthocal/<date>.json, or accept the placeholder if upstream simply lacks it.',
        });
        continue;
      }

      // Work backwards: which orthocal reading is this text?
      const printed = norm(text.text);
      const origin  = vesp.find((r) => {
        const body = norm((r.passage || []).map(p => p.content).join(' '));
        return body && (body.startsWith(printed.slice(0, 60)) || printed.startsWith(body.slice(0, 60)));
      });
      if (!origin) continue;   // text from somewhere else entirely (overlay, parish pick) — not ours to judge

      const ca = compositeNo(cite), co = compositeNo(origin.display);
      const sameComposite = ca && co && ca === co;
      if (!sameComposite
          && (!booksAgree(cite, origin.display) || !chaptersAgree(cite, origin.display))) {
        findings.push({
          severity: 'high',
          message: `Lesson ${n} is cited as "${cite}" but the text printed under it is ${origin.display}.`,
          hint: 'server-lib/_shared/match-ot-readings.js pairs declared lessons to orthocal by citation. A positional fallback anywhere in that path reintroduces the 2026-11-08 defect — the citation is the trustworthy end, so an unmatched lesson must print the placeholder, never another reading.',
        });
      }
    }

    return findings;
  },
};
