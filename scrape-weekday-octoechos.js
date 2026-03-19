#!/usr/bin/env node
/**
 * scrape-weekday-octoechos.js
 *
 * Downloads and parses the St-Sergius Octoechos PDFs for weekday Vespers
 * (Sunday Evening through Friday Evening, all 8 tones).
 *
 * Adds scraped data to variable-sources/octoechos.json under
 * toneN.{day}.vespers, tagged with _source:"stSergius" so they can be
 * replaced with OCA texts later.
 *
 * Saturday Great Vespers (file {t}-1.pdf) is skipped — we already have
 * OCA-sourced data for all 8 tones.
 *
 * Usage:
 *   node scrape-weekday-octoechos.js [--tone 1] [--day monday] [--dry-run]
 */

'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── CLI flags ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const ONLY_TONE  = (() => { const i = args.indexOf('--tone');  return i >= 0 ? parseInt(args[i+1]) : null; })();
const ONLY_DAY   = (() => { const i = args.indexOf('--day');   return i >= 0 ? args[i+1].toLowerCase() : null; })();

// ── File number → civil day mapping ─────────────────────────────────────────
// File {t}-1.pdf = Saturday Evening → skip (OCA data exists)
// File {t}-2.pdf = Sunday Evening Vespers
// File {t}-3.pdf = Monday Evening Vespers
// …
// File {t}-7.pdf = Friday Evening Vespers
const FILE_TO_DAY = {
  2: 'sunday',
  3: 'monday',
  4: 'tuesday',
  5: 'wednesday',
  6: 'thursday',
  7: 'friday',
};

const BASE_URL = 'https://st-sergius.org/services/oktiochos';
const OCTOECHOS_PATH = path.join(__dirname, 'variable-sources', 'octoechos.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function downloadPdf(tone, fileDay) {
  const url  = `${BASE_URL}/${tone}-${fileDay}.pdf`;
  const tmp  = path.join(os.tmpdir(), `octoechos-${tone}-${fileDay}.pdf`);
  execSync(`curl -s -o "${tmp}" "${url}"`, { stdio: 'pipe' });
  return tmp;
}

function pdfToText(pdfPath) {
  // Without -layout: text reflows naturally, making verse/hymn detection simpler
  return execSync(`pdftotext "${pdfPath}" -`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
}

function cleanText(raw) {
  return raw.split('\n').map(l => l.trim()).join('\n');
}

/** Extract only the AT VESPERS section (stop at AT COMPLINE / AT MATINS / AT MIDNIGHT) */
function extractVespersSection(text) {
  const start = text.search(/AT VESPERS/i);
  if (start < 0) return null;
  const rest  = text.slice(start + 'AT VESPERS'.length);
  // Stop at the next major service heading
  const stop  = rest.search(/^(AT COMPLINE|AT MATINS|AT MIDNIGHT|AT THE MIDNIGHT OFFICE|SATURDAY MORNING|SUNDAY MORNING|MONDAY MORNING|TUESDAY MORNING|WEDNESDAY MORNING|THURSDAY MORNING|FRIDAY MORNING)/im);
  return (stop >= 0 ? rest.slice(0, stop) : rest).trim();
}

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * From a Vespers section extract:
 *   lordICall  : { hymns: [{verse, text}], glory: {text}, theotokion: {text} }
 *   prokeimenon: { tone, refrain, verse }
 *   aposticha  : { hymns: [{verse, text}], glory: {text}, theotokion: {text} }
 */
function parseVespers(section, tone, day) {
  const lines = section.split('\n').filter(l => l.trim().length > 0).map(l => l.trim());

  // ── State machine ──
  let mode = null;        // 'lic' | 'apost' | 'prok'
  let verseMode = false;  // true while collecting a multi-line verse
  let rubricMode = false; // true while skipping a multi-line rubric

  const lic   = { hymns: [], glory: null, theotokion: null };
  const apost = { hymns: [], glory: null, theotokion: null };
  let prok = null;

  let hymnLines = [];
  let hymnVerse = null;
  let hymnTarget = null;     // 'lic' | 'apost'
  let hymnIsGlory = false;
  let hymnIsTheotokion = false;
  let hymnIsGloryNow = false;

  function flushHymn() {
    if (!hymnLines.length) return;
    const text = hymnLines.join(' ').replace(/\s+/g, ' ').trim();
    hymnLines = [];
    if (!text) return;

    const obj = { text, _source: 'stSergius' };
    if (hymnVerse) obj.verse = hymnVerse;

    if (hymnIsGloryNow) {
      if (hymnTarget === 'lic')   { lic.glory = obj;   lic.theotokion = obj; }
      if (hymnTarget === 'apost') { apost.glory = obj; apost.theotokion = obj; }
    } else if (hymnIsGlory) {
      if (hymnTarget === 'lic')   lic.glory   = obj;
      if (hymnTarget === 'apost') apost.glory = obj;
    } else if (hymnIsTheotokion) {
      if (hymnTarget === 'lic')   lic.theotokion   = obj;
      if (hymnTarget === 'apost') apost.theotokion = obj;
    } else {
      obj.order = (hymnTarget === 'lic' ? lic.hymns.length : apost.hymns.length) + 1;
      if (hymnTarget === 'lic')   lic.hymns.push(obj);
      if (hymnTarget === 'apost') apost.hymns.push(obj);
    }

    hymnVerse = null;
    hymnIsGlory = false;
    hymnIsTheotokion = false;
    hymnIsGloryNow = false;
  }

  /** A verse is complete when it contains the psalmic asterisk and ends a sentence
   *  or a liturgical invocatory phrase (e.g. "O Lord", "unto Him"). */
  function verseComplete(v) {
    if (!/ \* /.test(v)) return false;
    return /[.!?,;]"?\s*$/.test(v) ||
           /\b(Lord|God|Thee|Him|us|good things|things|peoples?|nations?)\s*$/i.test(v);
  }

  for (const line of lines) {

    // ── Section headers ──
    if (/On .{1,3}Lord,? I have,? cried/i.test(line)) {
      flushHymn(); verseMode = false;
      mode = 'lic'; hymnTarget = 'lic'; rubricMode = true;
      continue;
    }
    if (/On the Aposticha/i.test(line)) {
      flushHymn(); verseMode = false;
      mode = 'apost'; hymnTarget = 'apost'; rubricMode = true;
      continue;
    }
    if (/O Joyous Light|Prokeimenon.*Tone/i.test(line)) {
      flushHymn(); verseMode = false;
      mode = 'prok';
      const toneMatch = line.match(/Tone\s+(I{1,3}V?|VI{0,3}|VII|VIII|\d+)/i);
      prok = { tone: toneMatch ? romanToInt(toneMatch[1]) : null, refrain: null, verse: null, _source: 'stSergius' };
      continue;
    }
    if (/Vouchsafe, O Lord/i.test(line)) {
      flushHymn(); verseMode = false; mode = null;
      continue;
    }

    // ── Prokeimenon lines ──
    if (mode === 'prok') {
      const refrainMatch = line.match(/^Prokeimenon:\s*(.+)/i);
      if (refrainMatch && prok) { prok.refrain = refrainMatch[1].trim(); continue; }
      const verseMatch = line.match(/^Verse:\s*(.+)/i);
      if (verseMatch && prok && !prok.verse) { prok.verse = verseMatch[1].trim(); continue; }
      continue;
    }

    if (mode !== 'lic' && mode !== 'apost') continue;

    // ── Verse lines ──
    if (/^Verse:/i.test(line)) {
      flushHymn();
      verseMode = true; rubricMode = false;
      hymnVerse = line.replace(/^Verse:\s*/i, '').trim();
      if (verseComplete(hymnVerse)) verseMode = false;
      continue;
    }

    // While collecting a multi-line verse, accumulate until asterisk + sentence end
    if (verseMode) {
      hymnVerse += ' ' + line;
      if (verseComplete(hymnVerse)) verseMode = false;
      continue;
    }

    // ── Glory / Both now lines ──
    const gloryBothNow = /^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\./i.test(line);
    const gloryOnly    = /^Glory\s*\.\.\.,\s*(?!Both)/i.test(line);
    const bothNowOnly  = /^Both\s*now\s*\.\.\./i.test(line);

    /** Strip theotokion subtype labels: "Stavrotheotokion:", "Dogmatikon:", etc. */
    function stripTypeLabel(s) {
      return s.replace(/^([A-Za-z]+\s*)?theotokion:?\s*/i, '')
              .replace(/^(Dogmatikon|Kontakion|Resurrectional):?\s*/i, '')
              .trim();
    }

    if (gloryBothNow) {
      flushHymn(); rubricMode = false;
      const after = stripTypeLabel(
        line.replace(/^Glory\s*\.\.\.,\s*Both\s*now\s*\.\.\.,?\s*/i, '').trim()
      );
      hymnIsGloryNow = true;
      if (after) hymnLines.push(after);
      continue;
    }
    if (gloryOnly) {
      flushHymn(); rubricMode = false;
      const after = line.replace(/^Glory\s*\.\.\.,\s*/i, '').trim();
      hymnIsGlory = true;
      if (after && !/^\.\.\.$/.test(after)) hymnLines.push(after);
      continue;
    }
    if (bothNowOnly) {
      flushHymn(); rubricMode = false;
      const after = line.replace(/^Both\s*now\s*\.\.\.,?\s*/i, '').trim();
      hymnIsTheotokion = true;
      if (after) hymnLines.push(after);
      continue;
    }

    // ── Rubric lines ──
    // "Repeat: ..." means the preceding sticheron is sung again — skip as rubric.
    if (/^Repeat:/i.test(line)) {
      continue;
    }
    // "To the martyrs:" / "For the reposed:" may have inline sticheron text after the label.
    if (/^(To the Martyrs?:|For the reposed:)/i.test(line)) {
      flushHymn(); rubricMode = false;
      const after = line.replace(/^[^:]+:\s*/, '').trim();
      if (after) hymnLines.push(after);
      continue;
    }
    // "Then, ..." with comma: either Nunc Dimittis (end of Vespers) or a LIC/aposticha continuation.
    // Only end the mode for the Nunc Dimittis; all other Then-comma lines are sub-rubrics.
    if (/^Then,/i.test(line)) {
      if (/Now lettest|servant depart/i.test(line)) {
        flushHymn(); verseMode = false; rubricMode = false; mode = null;
      } else {
        flushHymn();
        rubricMode = true;
      }
      continue;
    }
    // "Then " (with space) introduces a sub-rubric like "Then the Stichera from the Menaion".
    // Inside a glory/theotokion block, "Spec. Mel." is a melodic marker — skip without flushing.
    if (/^Spec\. Mel\./i.test(line) && (hymnIsGlory || hymnIsTheotokion || hymnIsGloryNow)) {
      continue;
    }
    if (/^(Then |Spec\. Mel\.)/i.test(line)) {
      flushHymn();
      rubricMode = true;
      continue;
    }

    // While in rubricMode, skip continuation lines that end with ":" (still the rubric).
    // The first non-colon-ending line is hymn content.
    if (rubricMode) {
      if (line.endsWith(':')) continue;
      rubricMode = false;
      // Fall through to hymn text accumulation
    }

    // Strip theotokion/type label prefix from hymn text lines (e.g. "Stavrotheotokion: text...")
    const labelStripped = stripTypeLabel(line);
    if (labelStripped !== line) {
      if (labelStripped) hymnLines.push(labelStripped);
      continue;
    }

    // ── Hymn text ──
    hymnLines.push(line);
  }

  flushHymn();

  return { lordICall: lic, prokeimenon: prok, aposticha: apost };
}

function romanToInt(s) {
  const map = { I:1, V:5, X:10, L:50, C:100, D:500, M:1000 };
  const upper = s.toUpperCase();
  // Try numeric first
  const num = parseInt(upper);
  if (!isNaN(num)) return num;
  let result = 0, prev = 0;
  for (let i = upper.length - 1; i >= 0; i--) {
    const cur = map[upper[i]] || 0;
    result += cur < prev ? -cur : cur;
    prev = cur;
  }
  return result || null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading octoechos.json…');
  const octoechos = JSON.parse(fs.readFileSync(OCTOECHOS_PATH, 'utf8'));

  const tones = ONLY_TONE ? [ONLY_TONE] : [1,2,3,4,5,6,7,8];
  const fileDays = Object.keys(FILE_TO_DAY).map(Number);

  let added = 0, skipped = 0;

  for (const tone of tones) {
    const tk = `tone${tone}`;
    if (!octoechos[tk]) octoechos[tk] = {};

    for (const fileDay of fileDays) {
      const day = FILE_TO_DAY[fileDay];

      if (ONLY_DAY && day !== ONLY_DAY) continue;

      // Skip if we already have OCA data for this day
      if (octoechos[tk][day]?._source === 'oca') {
        console.log(`  Tone ${tone} ${day}: skipping (OCA data exists)`);
        skipped++;
        continue;
      }

      console.log(`  Tone ${tone} ${day} (file ${tone}-${fileDay}.pdf)…`);
      let pdfPath;
      try {
        pdfPath = downloadPdf(tone, fileDay);
      } catch (err) {
        console.warn(`    ✗ Download failed: ${err.message}`);
        continue;
      }

      let rawText;
      try {
        rawText = pdfToText(pdfPath);
      } catch (err) {
        console.warn(`    ✗ pdftotext failed: ${err.message}`);
        continue;
      }

      const cleaned = cleanText(rawText);
      const vespersSection = extractVespersSection(cleaned);
      if (!vespersSection) {
        console.warn(`    ✗ Could not find AT VESPERS section`);
        continue;
      }

      const parsed = parseVespers(vespersSection, tone, day);

      const licCount   = parsed.lordICall.hymns.length;
      const apostCount = parsed.aposticha.hymns.length;
      const hasProk    = !!parsed.prokeimenon?.refrain;

      console.log(`    ✓ Lord I Call: ${licCount} hymns | Aposticha: ${apostCount} hymns | Prokeimenon: ${hasProk ? 'yes' : 'no'}`);

      if (!DRY_RUN) {
        if (!octoechos[tk][day]) octoechos[tk][day] = {};
        octoechos[tk][day].vespers = {
          _source: 'stSergius',
          _sourceUrl: `${BASE_URL}/${tone}-${fileDay}.pdf`,
          lordICall: parsed.lordICall,
          prokeimenon: parsed.prokeimenon,
          aposticha: parsed.aposticha,
        };
      }

      added++;

      // Clean up temp file
      try { fs.unlinkSync(pdfPath); } catch {}
    }
  }

  if (!DRY_RUN && added > 0) {
    fs.writeFileSync(OCTOECHOS_PATH, JSON.stringify(octoechos, null, 2));
    console.log(`\nWrote ${OCTOECHOS_PATH}`);
  }

  console.log(`\nDone. Added: ${added}, Skipped: ${skipped}${DRY_RUN ? ' (DRY RUN — no files written)' : ''}`);
}

main().catch(err => { console.error(err); process.exit(1); });
