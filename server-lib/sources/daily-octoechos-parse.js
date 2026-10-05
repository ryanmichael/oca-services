'use strict';

// Parse the Daily Octoechos — the parish's weekday book — into
// (tone, civil evening) -> { lordICall, aposticha }.
//
// Chunk 4 of the OCA-standardisation plan. 225 of 365 Vespers mix translations
// and st-sergius.org appears in 210 of them, because every weekday day-node of
// variable-sources/octoechos.json carries `_source: 'stSergius'`. This is the
// book the parish actually sings from — established from their OWN sheets, not
// asked: the choir director's weekday Lord-I-Call and Aposticha match it
// verbatim bar one systematic edit (`thou` -> `ye` where the address is plural,
// which the book gets grammatically wrong).
//
// ── WHY THIS PARSES THE BODY AND IGNORES THE PAGE HEADERS ───────────────────
//
// The obvious approach fails. The PDF's section headers ("Octoechos / Tone 1 /
// Wednesday / Vespers") survive text extraction on only ~48 of 190 pages, and
// the same ~48 under -raw, -layout and default mode alike. A missed header makes
// a section inherit the PREVIOUS day's context — silent mis-attribution to the
// wrong day, which nothing in this repo can detect. A first attempt built that
// way captured 12 of 48 nodes and was discarded.
//
// The BODY is regular where the headers are not. "Lord I Call" appears exactly
// 48 times — 8 tones x 6 weekday evenings — in a strict L-A-A rhythm with the
// Apostikha markers, and the nearest preceding "Tone N" line gives a clean run
// of six sections per tone, in order, for all eight tones. So the day is taken
// from POSITION (0..5 -> sunday..friday) and then PROVEN by theme.
//
// ── TWO DAY CONVENTIONS IN ONE BOOK ────────────────────────────────────────
//
//   * The MAIN BODY (this parser) labels by CIVIL EVENING. "Wednesday Vespers"
//     holds the apostles, who belong to liturgical Thursday. That matches
//     octoechos.json's own convention, so days map across directly.
//   * The APPENDIX of daily theotokia labels by LITURGICAL DAY, printing both
//     ("Thursday (Wednesday Evening)"), and is offset by one — see
//     corrections_log #10.
//
// Getting either backwards puts every hymn one day off with every tone still
// correct. Hence THEMES, below, which make that failure loud.

const { execFileSync } = require('child_process');

const EVENINGS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

// The Octoechos day-themes are fixed, and they are what proves the day mapping.
// Keyed by CIVIL EVENING; the comment gives the liturgical day it opens.
const THEMES = {
  // DERIVED FROM THE BOOK'S OWN "(Stikhera of/to the X)" MARKERS inside the
  // weekday Vespers spans, not from the Octoechos day-themes in general. The
  // difference matters: liturgical Tuesday IS the Forerunner's day, but his
  // stichera sit in MATINS. Monday-evening VESPERS is repentance and the
  // martyrs, and an earlier table that expected the Forerunner here wrongly
  // discarded six good nodes.
  //
  // Counts across the eight tones: tuesday cross x16, thursday cross x16,
  // wednesday apostles x15, friday martyrs x13; sunday and monday carry only
  // repentance and martyrs.
  sunday:    { re: /repent|peniten|prodigal|sin|martyr/i,  day: 'Monday — repentance & the martyrs' },
  monday:    { re: /repent|peniten|wretch|compunction|sin|martyr/i, day: 'Tuesday — repentance & the martyrs' },
  tuesday:   { re: /cross|crucif/i,                        day: 'Wednesday — the Cross' },
  wednesday: { re: /apostle|peter|paul|disciple/i,         day: 'Thursday — the apostles' },
  thursday:  { re: /cross|crucif/i,                        day: 'Friday — the Cross' },
  friday:    { re: /martyr|departed|dead|fallen asleep/i,  day: 'Saturday — the martyrs & departed' },
};

// ⚠️ THE THEME CHECK IS COARSE AND CANNOT STAND ALONE. Sunday and Monday
// evenings share a theme, as do Tuesday and Thursday (both the Cross), so it
// cannot catch a swap within either pair. The real proof of the day mapping is
// the DISCRIMINATIVE cross-check against the stSergius data already in
// octoechos.json: the same hymns in a different translation, on the same keys.
// Each of our day-nodes must match the book's SAME day better than any other —
// 42 of 42 available nodes did, which is what established the alignment.

const WORD_TONE = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
const RE_TONE   = /\bTone\s+(\d|One|Two|Three|Four|Five|Six|Seven|Eight)\b/i;
const RE_LIC    = /Lord\s*I\s*Call/i;
const RE_APOST  = /^\s*Apostikha\s*$/i;
const RE_MARKER = /^\s*\([^)]*\)\s*$/;               // "(Stikhera to the apostles)"
const RE_GLORY  = /^\s*Glory\.{3}|^\s*Glory…/i;
const RE_VERSE  = /^\s*Verse:/i;
const RE_PAGE   = /^\s*\d{1,3}\s*$/;
const RE_NOISE  = /^\s*(The\s+)?Octoechos\s*$|^\s*(Vespers|Matins|Compline)\s*$/i;
// Where a Vespers section gives way to the following Matins.
const RE_MATINS = /^\s*Matins\s*$|Sessional Hymn|After the (1st|first|final) reading/i;

function bookLines(pdfPath) {
  const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'],
                           { maxBuffer: 256 * 1024 * 1024, timeout: 120000 }).toString('utf8');
  return txt.replace(/\f/g, '\n').split('\n').map(l => l.trim());
}

function toneValue(s) {
  const m = RE_TONE.exec(s);
  if (!m) return null;
  const v = m[1].toLowerCase();
  return /^\d$/.test(v) ? Number(v) : (WORD_TONE[v] || null);
}

/** Join wrapped lines into hymns, splitting on the book's blank-line breaks. */
function hymnsFrom(lines) {
  const out = [];
  let buf = [];
  const flush = () => {
    const t = buf.join(' ').replace(/\s+/g, ' ').trim();
    buf = [];
    // `//` is the book's final-phrase mark; the house convention is a newline.
    if (t.length >= 40) out.push(t.replace(/\s*\/\/\s*/g, '\n').trim());
  };
  for (const l of lines) {
    if (!l) { flush(); continue; }
    if (RE_PAGE.test(l) || RE_NOISE.test(l) || RE_VERSE.test(l)) { flush(); continue; }
    if (RE_MARKER.test(l) || RE_GLORY.test(l) || RE_TONE.test(l)) { flush(); continue; }
    buf.push(l);
  }
  flush();

  // A hymn broken across a page boundary arrives as two entries, because the
  // page number between them forces a flush. The tail begins mid-sentence —
  // "flesh in the fear of Thee…", "healing the sick, O physicians…" — so a
  // leading lower-case letter marks a continuation, not a new hymn.
  //
  // This is why 19 sections parsed 5 entries instead of 4 and were withheld
  // from the conversion. They must be REJOINED, not dropped: dropping would
  // silently lose half a hymn, which is worse than leaving the node alone.
  const joined = [];
  for (const t of out) {
    if (joined.length && /^[a-z]/.test(t)) {
      joined[joined.length - 1] = `${joined[joined.length - 1]} ${t}`.replace(/\s+/g, ' ');
    } else {
      joined.push(t);
    }
  }
  return joined;
}

/**
 * Parse the whole book.
 *
 * Returns { tones: { tone1: { wednesday: { lordICall: [...], aposticha: [...] } } },
 *           sections: 48, themeOk: n, themeFail: [...] }
 *
 * A node whose content does not match its assigned day's theme is reported in
 * `themeFail` and MUST NOT be used — it means the sequence assumption broke.
 */
function parseDailyOctoechos(pdfPath) {
  const lines = bookLines(pdfPath);

  const licAt = [];
  const apoAt = [];
  lines.forEach((l, i) => {
    if (RE_LIC.test(l) && l.length < 40) licAt.push(i);
    if (RE_APOST.test(l)) apoAt.push(i);
  });

  const toneAt = (i) => {
    for (let j = i; j >= 0; j--) {
      if (lines[j].length < 70) { const t = toneValue(lines[j]); if (t) return t; }
    }
    return null;
  };

  // Group the Lord-I-Call markers by tone; each tone must yield exactly six,
  // in evening order.
  const byTone = new Map();
  for (const i of licAt) {
    const t = toneAt(i);
    if (!t) continue;
    if (!byTone.has(t)) byTone.set(t, []);
    byTone.get(t).push(i);
  }

  const tones = {};
  const themeFail = [];
  let themeOk = 0;

  for (const [tone, marks] of [...byTone.entries()].sort((a, b) => a[0] - b[0])) {
    if (marks.length !== EVENINGS.length) {
      themeFail.push({ tone, reason: `${marks.length} Lord-I-Call sections, expected ${EVENINGS.length}` });
      continue;
    }
    marks.forEach((start, idx) => {
      const evening = EVENINGS[idx];
      const nextLic = licAt.find(x => x > start) ?? lines.length;
      // The FIRST Apostikha after a Lord I Call is this Vespers' own; the
      // second belongs to the following Matins (the L-A-A rhythm).
      const apo1 = apoAt.find(x => x > start && x < nextLic);
      const licLines = lines.slice(start + 1, apo1 ?? nextLic);
      // The Vespers Aposticha ends where Matins begins. Without this bound the
      // span runs to the next Lord I Call and swallows the whole of Matins —
      // 785 hymns instead of ~190.
      let apoEnd = nextLic;
      if (apo1 != null) {
        for (let j = apo1 + 1; j < nextLic; j++) {
          if (RE_MATINS.test(lines[j])) { apoEnd = j; break; }
        }
        const apo2 = apoAt.find(x => x > apo1 && x < nextLic);
        if (apo2 != null && apo2 < apoEnd) apoEnd = apo2;
      }
      const apoLines = apo1 ? lines.slice(apo1 + 1, apoEnd) : [];

      const node = {
        lordICall: hymnsFrom(licLines).map(text => ({ text })),
        aposticha: hymnsFrom(apoLines).map(text => ({ text })),
      };

      // A weekday Vespers prints 3 stichera plus a Theotokion. A node that
      // parses far more has overrun into the following Matins — tone4/sunday
      // did exactly that at 15 hymns, its Apostikha marker missing, swallowing
      // "(After the 1st reading of the Psalter): Sessional Hymn". Report it
      // rather than let the extra hymns through silently.
      if (node.lordICall.length > 8 || node.aposticha.length > 8) {
        themeFail.push({ tone, evening,
          reason: `overrun — ${node.lordICall.length} lordICall / ${node.aposticha.length} aposticha ` +
                  'hymns parsed; the section boundary was not found' });
        return;
      }

      const blob = [...node.lordICall, ...node.aposticha].map(h => h.text).join(' ');
      const theme = THEMES[evening];
      if (!blob) { themeFail.push({ tone, evening, reason: 'no hymns parsed' }); return; }
      if (!theme.re.test(blob)) {
        themeFail.push({ tone, evening, reason: `theme mismatch — expected ${theme.day}`,
                         sample: blob.slice(0, 70) });
        return;
      }
      themeOk++;
      (tones[`tone${tone}`] ??= {})[evening] = node;
    });
  }

  return { tones, sections: licAt.length, themeOk, themeFail };
}

module.exports = { parseDailyOctoechos, EVENINGS, THEMES };
