'use strict';

const { openDb } = require('../cache/sqlite');

// A rank or office. Never a person's name, so it may always be stripped from
// the front of a title.
const RANK = 'Saints?|Venerable|Hieromartyrs?|Martyrs?|Great[- ]?[Mm]artyrs?|New Martyrs?|' +
  'New Hieromartyrs?|Virgin Martyrs?|Maiden Martyrs?|Monastic Martyrs?|Monastic Confessors?|' +
  'Nun[- ]?Martyrs?|Nuns?|Prophets?|Prophetess|Apostles?|Evangelist|Blessed|Righteous|' +
  'Confessors?|Unmercenar(?:y|ies)|Wonderworkers?|Equals?|Archbishop|Bishop|Metropolitan|' +
  'Patriarch|Abbot|Abbess|Deacon|Archdeacon|Priest|Presbyter|Monk|Fool|Forerunner|Hierarchs?|' +
  'Protomartyr|Passion[- ]?bearers?|Stylite|Baptist|Physician|Teachers?|' +
  'Victory[- ]?bearers?|God[- ]bearing Father|Father|Mother|Princess|Prince|Tsarevich|' +
  'Right[- ]believing|Enlightener';

// An EVENT, not a person: the commemoration is of a thing that happened to a
// saint, so the saint's name comes later in the title.
const EVENT = 'Repose|Translation|Recovery|Uncovering|Finding|Placing|Synaxis|Appearance|' +
  'Dedication|Consecration|Commemoration|Founding|Meeting|Beheading|Conception|Nativity|' +
  'Dormition|Protection|Icon|Feast|Forefeast|Afterfeast|Leavetaking|Council';

// If extraction lands on one of these, the result is wrong by construction —
// it is a rank or an event word standing where a name should be.
const NOT_A_NAME = new RegExp(`^(?:${RANK}|${EVENT}|Holy|Glorious|Great|New|The|All|and|of|the)$`, 'i');

/**
 * A result we are willing to substitute into a hymn. A fragment opening with
 * "of"/"and" is never acceptable — "Leaving earthly cares O Apostle of Valaam
 * Monastery" is worse than the blunt-but-stable legacy answer.
 */
function isUsable(s) {
  return !!s && !/^(?:of|and|or)\b/i.test(s) && !NOT_A_NAME.test(s);
}

/**
 * The pre-2026-10-06 behaviour, kept as the last resort. For a title that
 * contains no personal name at all ("Monastic Martyrs of Valaam Monastery",
 * "Icon of the Mother of God 'Tinos'") there IS no short name, and this returns
 * something short and stable rather than a fragment.
 */
function legacyShortName(title) {
  let name = String(title || '')
    .replace(/^(Holy,?\s*Glorious\s+)?/i, '')
    .replace(/^(Saint|Venerable|Hieromartyr|Hieromartyrs?|Martyr|Martyrs|Great[- ]Martyr|New Martyr|Virgin Martyr|Maiden Martyr|Monastic Martyr|Nun Martyr|Prophet|Apostle|Apostles|Blessed|Righteous)\s+/i, '')
    .replace(/^(Holy|Glorious|Great|New)\s+/i, '');
  name = name.replace(/\s+(?:of|at|in|near)\s+.*$/i, '');
  name = name.replace(/\s*\(.*$/, '');
  name = name.replace(/,\s+.*$/, '');
  return name.trim();
}

/** Strip trailing place, parenthetical and apposition clauses. */
function trimSuffixes(s) {
  return s
    .replace(/\s+(?:of|at|in|near)\s+.*$/i, '')
    .replace(/\s*\(.*$/, '')
    .replace(/,\s+.*$/, '')
    .trim();
}

/**
 * Strip leading rank/honorific words, repeatedly.
 * Returns `{ name, stripped }` — `stripped` says whether anything was removed,
 * which is what distinguishes a rank that ran on ("Equals of the Apostles…")
 * from a title that simply opens with an article ("The Circumcision of…").
 */
function stripRanks(s) {
  const before = s;
  let prev;
  do {
    prev = s;
    s = s
      .replace(/^(?:Holy,?\s*Glorious\s+)/i, '')
      .replace(new RegExp(`^(?:${RANK})\\s+`, 'i'), '')
      .replace(/^(?:Holy|Glorious|Great|New|Most Holy)\s+/i, '')
      .replace(/^and\s+/i, '')
      // "…Equal of the Apostles Thekla" — the rank phrase continues past its
      // first word, so "of the Apostles" is still rank, not a place.
      .replace(new RegExp(`^of\\s+(?:the\\s+)?(?:${RANK})\\s+`, 'i'), '');
  } while (s !== prev);
  return { name: s, stripped: s !== before };
}

/**
 * Extracts a short name from a commemoration title for (name) substitution.
 * "Hieromartyr Silvanus of Gaza" → "Silvanus"
 * "Venerable Seraphim, Wonderworker of Sarov" → "Seraphim"
 *
 * ── WHY THIS IS NOT A ONE-LINE REGEX (2026-10-06) ──────────────────────────
 *
 * Three of the ten dates that actually render a General Menaion hymn were
 * substituting a rank or an event word in place of a name, and the result was
 * live: 2026-05-10 sang "Leaving earthly cares O Apostle Equals". The three
 * failure SHAPES, each fixed structurally rather than by its literal:
 *
 *   1. The rank is a PHRASE, so stripping its first word leaves a fragment.
 *      "Equals of the Apostles and Teachers of the Slavs, Cyril and Methodius"
 *      -> stripping "Equals" left "of the Apostles…". When what remains opens
 *      with of/the, the rank ran on and the name sits after the last comma.
 *   2. The title names an EVENT, not a person.
 *      "Recovery of the relics of Saint Job of Pochaev" -> "Recovery". Start
 *      from the first rank word inside the title instead.
 *   3. The rank is COMPOUND. "Apostle and Evangelist Mark" -> stripping
 *      "Apostle " left "and Evangelist Mark", so the strip must iterate.
 *
 * `NOT_A_NAME` is the backstop: whenever extraction lands on a rank or event
 * word anyway, fall back to the last comma-separated segment. That is what
 * makes this a closed class rather than three repaired strings — and the
 * substituted output is asserted by test/contracts/general-menaion-name.test.js,
 * because this substitution happens at RENDER time and no sweep of the stored
 * corpus can see it.
 */
function extractShortName(title) {
  const raw = String(title || '').trim();
  if (!raw) return title;

  // Shape 2 — an event title: restart from the first rank word inside it.
  let working = raw;
  if (new RegExp(`^(?:${EVENT})\\b`, 'i').test(raw)) {
    const m = raw.match(new RegExp(`\\b(?:${RANK})\\s+(.+)$`, 'i'));
    if (m) working = m[1];
  }

  // Shape 3 — iterate, so compound ranks strip fully.
  const first = stripRanks(working);
  let name = first.name;

  // Shape 1 — the rank was a PHRASE: we removed a rank word and what remains
  // opens with of/the, so the phrase ran on and the name is elsewhere.
  // Guarded on `stripped`, because a title that merely opens with an article
  // ("The Circumcision of our Lord") had no rank to run on and must be left be.
  if (first.stripped && /^(?:of|the)\b/i.test(name)) name = '';

  name = trimSuffixes(name);

  if (isUsable(name)) return name;

  // Backstop — a rank or event word is not a name. Try the last comma-separated
  // segment that yields one. ("…Teachers of the Slavs, Cyril and Methodius")
  //
  // Skipped for a GROUP commemoration — a colon introducing three or more names
  // ("Holy Apostles of the Seventy: Sosthenes, Apollos, … Onesiphorus"). Picking
  // the last of seventy names singles out one saint the day does not single out;
  // the rank ("Apostles") is the honest answer there.
  const isGroupList = /:\s/.test(raw) && (raw.match(/,/g) || []).length >= 2;
  if (!isGroupList) {
    const segments = raw.split(/,\s*/);
    for (let i = segments.length - 1; i >= 0; i--) {
      const cand = trimSuffixes(stripRanks(segments[i].trim()).name);
      if (isUsable(cand)) return cand;
    }
  }

  // No personal name in this title at all ("Martyrs of Lazeti", "Icon of the
  // Mother of God 'Tinos'", "Forefeast of the Nativity"). There is nothing
  // better to find, so return the SHORT blunt form — the rank or the event.
  //
  // `isUsable` only ever PREFERS a candidate here; it must not reject the last
  // one. Letting it reject turned 104 of these into the whole title, which is
  // the single worst outcome available: a 70-character title substituted into a
  // sung line. Short and imprecise beats long and unsingable.
  // A leading "of"/"and" fragment is never a candidate, not even as a last
  // resort: "Martyrs of Lazeti" must fall to "Martyrs", not to "of Lazeti".
  const fallbacks = [legacyShortName(raw), trimSuffixes(raw)]
    .filter(s => s && !/^(?:of|and|or)\b/i.test(s));
  return fallbacks.find(isUsable) || fallbacks[0] || title;
}

/**
 * Fallback mapping for saint types that don't have their own General Menaion PDF
 * to a type that does.
 */
const GENERAL_MENAION_FALLBACK = {
  'hieromartyrs': 'hieromartyr',   // plural → singular as fallback
  'hierarchs':    'hierarch',
  'monastics':    'monastic',
  'monasticMartyrs': 'monasticMartyr',
  'maidenMartyrs':   'maidenMartyr',
  'nuns':            'nun',
  'apostles':        'apostle',
};

/**
 * Fetches General Menaion texts for a given saint type, substituting
 * the (name) placeholder with the actual saint's name.
 *
 * Returns stichera-compatible rows or null if none found.
 */
function getGeneralMenaionTexts(saintType, title) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    // Try exact type, then fallback
    const types = [saintType];
    if (GENERAL_MENAION_FALLBACK[saintType]) types.push(GENERAL_MENAION_FALLBACK[saintType]);

    for (const type of types) {
      const rows = db.prepare(`
        SELECT saint_type, section, "order", tone, label, verse, text
        FROM general_menaion WHERE saint_type = ?
        ORDER BY section, "order"
      `).all(type);

      if (rows.length > 0) {
        const shortName = extractShortName(title);
        const sub = t => t.replace(/\(name(?:\s+of\s+the\s+event\/Icon)?\)/gi, shortName);
        // Order-convention reconcile: general_menaion uses order 0–2 = numbered
        // stichera, 90 = Glory doxastikon, 91 = Now/Theotokion. But the assembler
        // (for-date.js) expects the proper-stichera convention — order 0 = Glory,
        // order ≥1 = numbered stichera. Without remapping, the Glory/Theotokion
        // (90/91) render as extra numbered stichera and, since 90==91 for most
        // saint types, surface as a duplicate theotokion (July 12 audit). So:
        // stichera 0/1/2 → 1/2/3; Glory 90 → 0; drop the redundant Now (91) — the
        // Now is supplied by the Octoechos week-Theotokion, and combinesGloryNow
        // renders "Glory…, Now…: Theotokion" when no distinct week Theotokion.
        return rows
          .filter(r => r.order !== 91)
          .map(r => ({
            order:    r.order === 90 ? 0 : r.order + 1,
            section:  r.section,
            tone:     r.tone,
            label:    r.label,
            text:     sub(r.text),
            verse:    r.verse ? sub(r.verse) : null,
            dbSource: 'stSergius-general',
          }));
      }
    }
    return null;
  } catch (err) {
    console.error('getGeneralMenaionTexts error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

module.exports = { extractShortName, GENERAL_MENAION_FALLBACK, getGeneralMenaionTexts };
