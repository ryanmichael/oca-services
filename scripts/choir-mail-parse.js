'use strict';

/**
 * Filename → (service, date) resolution for the choir-director email intake.
 *
 * Pure: no I/O, no clock, no network. Every function is total — an input that
 * cannot be understood produces an `unclassified` result with a stated reason,
 * never a guess and never a throw. The caller files those under
 * `pdf/_unclassified/` and lists them in `manifest.unresolved`.
 *
 * See docs/choir-email-pipeline-design.md §4.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Services filed under the CIVIL EVENING they are sung, whose content comes
 * from the NEXT day's calendar entry.
 *
 * Derived from server-lib/search/service-catalog.js, not from memory: exactly
 * those entries whose isServed() reads `d.vespersEntry` instead of `d.cur`.
 * `presanctified` is evening-served but reads `d.cur`, so it is NOT shifted.
 */
const DATE_SHIFTED = new Set(['greatVespers', 'dailyVespers', 'allNightVigil']);

/** Service key → the endpoint that renders it. */
const API_PATH = {
  greatVespers:     '/api/service',
  dailyVespers:     '/api/service',
  allNightVigil:    '/api/vigil',
  matins:           '/api/matins',
  liturgy:          '/api/liturgy',
  presanctified:    '/api/presanctified',
  vesperalLiturgy:  '/api/vesperal-liturgy',
  bridegroomMatins: '/api/bridegroom-matins',
  royalHours:       '/api/royal-hours',
  lamentations:     '/api/lamentations',
  kneelingVespers:  '/api/kneeling-vespers',
};

/**
 * Longest / most specific first. `\bvespers\b` deliberately does not match
 * "Vesperal" (the word boundary falls after "vesper"), but the vesperal entry
 * leads anyway so the intent is visible rather than incidental.
 *
 * Bare "Vespers" with no great/daily qualifier is `ambiguous`: /api/service
 * resolves the flavour from the calendar, so we route it there and drop
 * confidence rather than inventing a flavour.
 */
const SERVICE_PATTERNS = [
  { re: /\bvesperal\s+liturgy\b/i,                key: 'vesperalLiturgy',  label: 'Vesperal Liturgy' },
  { re: /\bpresanctified\b/i,                     key: 'presanctified',    label: 'Presanctified Liturgy' },
  { re: /\bbridegroom\s+matins\b/i,               key: 'bridegroomMatins', label: 'Bridegroom Matins' },
  { re: /\broyal\s+hours\b/i,                     key: 'royalHours',       label: 'Royal Hours' },
  { re: /\blamentations\b/i,                       key: 'lamentations',     label: 'The Lamentations' },
  { re: /\bkneeling\s+vespers\b/i,                key: 'kneelingVespers',  label: 'Kneeling Vespers' },
  { re: /\b(?:all[-\s]?night\s+)?vigil\b/i,       key: 'allNightVigil',    label: 'All-Night Vigil' },
  { re: /\bgreat\s+vespers\b/i,                   key: 'greatVespers',     label: 'Great Vespers' },
  { re: /\bdaily\s+vespers\b/i,                   key: 'dailyVespers',     label: 'Daily Vespers' },
  { re: /\bvespers\b/i,                           key: 'greatVespers',     label: 'Vespers', ambiguous: true },
  { re: /\bmatins\b/i,                            key: 'matins',           label: 'Matins' },
  // "Feastal" is the director's habitual spelling of "Festal"; both accepted.
  { re: /\b(?:divine|feastal|festal)\s+liturgy\b/i, key: 'liturgy',        label: 'Divine Liturgy' },
  { re: /\bliturgy\b/i,                           key: 'liturgy',          label: 'Liturgy' },
];

const pad2 = (n) => String(n).padStart(2, '0');

/** Reject Feb 30 and friends: JS Date silently rolls them over. */
function isRealDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const isoOf = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

function addDays(iso, n) {
  const t = Date.parse(`${iso}T12:00:00Z`) + n * DAY_MS;
  const dt = new Date(t);
  return isoOf(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function expandTwoDigitYear(yy) {
  return yy < 70 ? 2000 + yy : 1900 + yy;
}

/**
 * A bare MM.DD carries no year. Choose the candidate year nearest the email's
 * own date, so 10.01 on a 2026-09-24 email is 2026-10-01 and 01.07 on a
 * 2026-12-28 email is 2027-01-07.
 *
 * @returns {{iso: string, inferredYear: boolean, deltaDays: number}|null}
 */
function inferYear(month, day, emailDate) {
  const base = Date.parse(`${emailDate}T12:00:00Z`);
  if (Number.isNaN(base)) return null;
  const y0 = Number(emailDate.slice(0, 4));

  let best = null;
  for (const y of [y0 - 1, y0, y0 + 1]) {
    if (!isRealDate(y, month, day)) continue;
    const iso = isoOf(y, month, day);
    const delta = Math.round((Date.parse(`${iso}T12:00:00Z`) - base) / DAY_MS);
    if (!best || Math.abs(delta) < Math.abs(best.deltaDays)) {
      best = { iso, inferredYear: true, deltaDays: delta };
    }
  }
  return best;
}

/**
 * Pull a date out of a filename. Tries MM.DD.YY(YY) before MM.DD so the year
 * is never mistaken for a day. Separators: . - _ or /.
 *
 * @returns {{iso, inferredYear, deltaDays, matched}|null}
 */
function findDate(stem, emailDate) {
  const SEP = '[._\\-/]';

  const withYear = stem.match(new RegExp(`(?<![0-9])(\\d{1,2})${SEP}(\\d{1,2})${SEP}(\\d{4}|\\d{2})(?![0-9])`));
  if (withYear) {
    const [, mo, da, yr] = withYear;
    const month = Number(mo), day = Number(da);
    const year = yr.length === 4 ? Number(yr) : expandTwoDigitYear(Number(yr));
    if (isRealDate(year, month, day)) {
      const iso = isoOf(year, month, day);
      const delta = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${emailDate}T12:00:00Z`)) / DAY_MS);
      return { iso, inferredYear: false, deltaDays: delta, matched: withYear[0] };
    }
  }

  const noYear = stem.match(new RegExp(`(?<![0-9])(\\d{1,2})${SEP}(\\d{1,2})(?![0-9])`));
  if (noYear) {
    const month = Number(noYear[1]), day = Number(noYear[2]);
    const got = inferYear(month, day, emailDate);
    if (got) return { ...got, matched: noYear[0] };
  }

  return null;
}

/** "greatVespers" → "great-vespers" */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/**
 * Classify one attachment.
 *
 * @param {string} filename  as it arrived, e.g. "Great Vespers 09.26.26.pdf"
 * @param {string} emailDate ISO date the email was sent — the year oracle
 * @returns {object} always; `kind` is 'service' | 'tone' | 'unclassified'
 */
function parseAttachment(filename, emailDate) {
  const reasons = [];
  const ext = (filename.match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0].toLowerCase();

  // Browsers and mail clients add " (1)" to a re-download. Strip before parsing;
  // byte-identity is settled by sha256, not by the name.
  let stem = filename.slice(0, filename.length - ext.length);
  const dupe = stem.match(/\s*\((\d+)\)\s*$/);
  if (dupe) {
    stem = stem.slice(0, dupe.index);
    reasons.push(`stripped duplicate-download suffix "(${dupe[1]})"`);
  }

  const out = {
    original: filename,
    kind: 'unclassified',
    service: null,
    serviceLabel: null,
    apiDate: null,
    contentDate: null,
    apiPath: null,
    tone: null,
    confidence: 'low',
    reasons,
  };

  // Tone is recorded wherever it appears; it only *classifies* the file when
  // no service does, so "Great Vespers Tone 5 …" stays a service packet.
  const tone = stem.match(/\btone\s*(\d+)\b/i);
  if (tone) {
    const n = Number(tone[1]);
    if (n >= 1 && n <= 8) out.tone = n;
    else reasons.push(`ignored out-of-range tone "${tone[1]}" (expected 1-8)`);
  }

  const svc = SERVICE_PATTERNS.find((p) => p.re.test(stem));
  const date = findDate(stem, emailDate);

  if (svc && date) {
    out.kind = 'service';
    out.service = svc.key;
    out.serviceLabel = svc.label;
    out.apiDate = date.iso;
    out.contentDate = DATE_SHIFTED.has(svc.key) ? addDays(date.iso, 1) : date.iso;
    out.apiPath = API_PATH[svc.key] || null;

    out.confidence = 'high';
    if (date.inferredYear) {
      out.confidence = 'medium';
      reasons.push(`year not in filename; inferred ${date.iso} from email date ${emailDate}`);
    }
    if (svc.ambiguous) {
      out.confidence = 'medium';
      reasons.push('bare "Vespers" — great vs daily left to the calendar');
    }
    // A packet for a service months away is more likely a parse error than a
    // real plan. Flag rather than discard; the human decides.
    if (Math.abs(date.deltaDays) > 45) {
      out.confidence = 'low';
      reasons.push(`resolved date is ${date.deltaDays} days from the email — verify`);
    }
    out.stored = `pdf/${kebab(svc.key)}-${date.iso}${ext}`;
    return out;
  }

  if (out.tone && !svc && !date) {
    out.kind = 'tone';
    out.confidence = 'high';
    out.stored = `pdf/tone-${pad2(out.tone)}-intro${ext}`;
    return out;
  }

  // Everything else is explicitly unresolved, with the half we did find stated.
  if (svc && !date) reasons.push(`service "${svc.label}" recognised but no date in filename`);
  else if (date && !svc) reasons.push(`date ${date.iso} recognised but no service keyword`);
  else if (!out.tone) reasons.push('no service keyword and no date');
  else reasons.push(`tone ${out.tone} alongside an unrecognised service/date`);

  out.stored = `pdf/_unclassified/${filename}`;
  return out;
}

module.exports = {
  parseAttachment,
  findDate,
  inferYear,
  addDays,
  isRealDate,
  kebab,
  DATE_SHIFTED,
  API_PATH,
  SERVICE_PATTERNS,
};
