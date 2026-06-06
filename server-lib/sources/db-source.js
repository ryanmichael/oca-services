'use strict';

// DB source resolver. Loads variable-source data (lordICall, aposticha,
// troparia, litya, epistle, gospel) for a given date out of oca.db and
// builds a nested object the assembler's deepGet() can navigate.

const { openDb }              = require('../cache/sqlite');
const { getLiturgicalKey }    = require('../../calendar-rules');
const { deduplicateBySource } = require('../../oca-psalter');

const SECTION_LABELS = {
  lordICall : 'Lord, I Have Cried',
  aposticha : 'Aposticha',
  troparia  : 'Troparia',
  litya     : 'Litya',
  epistle   : 'Epistle',
  gospel    : 'Gospel',
};
const SECTION_ORDER = ['lordICall', 'aposticha', 'troparia', 'litya', 'epistle', 'gospel'];


/**
 * Builds a nested object from a dot-notation path so that deepGet() in the
 * assembler can navigate it.  e.g.:
 *   buildNestedPath('lent.week.2.thursday', { vespers: {...} })
 *   → { lent: { week: { '2': { thursday: { vespers: {...} } } } } }
 */
function buildNestedPath(dotPath, value) {
  const parts = dotPath.split('.');
  const root  = {};
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return root;
}

/**
 * Transforms a flat array of DB block rows for one section into the nested
 * object shape the assembler expects via deepGet():
 *
 *   { text, tone, label, hymns: [{text,tone,label}, …], glory: {…}, now: {…} }
 *
 * Rules:
 *   - Hymns with position='glory' or position='now' go into glory/now slots.
 *   - For lordICall only: the very first hymn (before any verse block) is the
 *     sung refrain already provided by fixed texts — skip it.
 *   - All other hymns are collected into hymns[] in document order.
 *   - text/tone/label are convenience aliases for hymns[0] (idiomelon pattern).
 */
function categorizeHymn(label) {
  if (!label) return null;
  // Order matters: Midfeast pattern is checked before the broader
  // "from the Pentecostarion" pattern that would otherwise match.
  if (/for the Resurrection/i.test(label))                 return 'resurrectional';
  if (/for Midfeast/i.test(label))                         return 'midfeastIdiomela';
  if (/for the Forerunner/i.test(label))                   return 'menaionFeast';
  if (/Theotokion/i.test(label))                           return 'theotokion';
  if (/Dogmatikon/i.test(label))                           return 'dogmatikon';
  // Holy Fathers Sunday: distinguish Ascension idiomela from Fathers idiomela
  // so the calendar can fill separate LIC slots.
  if (/for the Ascension/i.test(label))                    return 'ascensionIdiomela';
  if (/for the Fathers/i.test(label))                      return 'fatherIdiomela';
  // Day-specific Pentecostarion Sunday idiomela:
  //   "for the <Sunday-name>" — Paralytic, Samaritan Woman, Blind Man, Myrrhbearers, Thomas, Antipascha
  //   "from the Pentecostarion[, …]" — generic Pentecostarion idiomelon when the Sunday-name suffix is absent
  //   "by <hymnographer>" — Romanos, John the Monk, Anatolius (compose Pentecostarion idiomela)
  if (/for the (Samaritan Woman|Paralytic|Blind Man|Myrrhbearers)/i.test(label)) return 'feastIdiomela';
  if (/for Thomas/i.test(label) || /for Antipascha/i.test(label)) return 'feastIdiomela';
  if (/from the Pentecostarion/i.test(label))              return 'feastIdiomela';
  if (/by (Romanos|John the Monk|Anatolius)/i.test(label)) return 'feastIdiomela';
  return null;
}

function transformSectionBlocks(section, blocks) {
  const hymns = [];
  let glory      = null;
  let now        = null;
  let seenVerse  = false;

  // When the data has no verse-type blocks (sparse scraped data), don't apply
  // the seenVerse guard — all hymns are real stichera, not a refrain.
  const hasVerseBlocks = blocks.some(b => b.type === 'verse');

  for (const b of blocks) {
    if (b.type === 'verse')        { seenVerse = true; continue; }
    if (b.type === 'glory_marker') { continue; }
    if (b.type === 'now_marker')   { continue; }
    if (b.type !== 'hymn')         { continue; }

    if (b.position === 'glory') { glory = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }
    if (b.position === 'now')   { now   = { text: b.text, tone: b.tone, label: b.label, ...(b.source_filename && { provenance: 'OCA' }) }; continue; }

    // lordICall only: skip the opening refrain (appears before any psalm verse)
    // Only applies when verse blocks exist — sparse data has no refrain block.
    if (section === 'lordICall' && !seenVerse && hasVerseBlocks) continue;

    hymns.push({
      text: b.text, tone: b.tone, label: b.label,
      category: categorizeHymn(b.label),
      ...(b.source_filename && { provenance: 'OCA' }),
    });
  }

  return {
    text:  hymns[0]?.text  ?? null,
    tone:  hymns[0]?.tone  ?? null,
    label: hymns[0]?.label ?? null,
    ...(hymns[0]?.provenance && { provenance: hymns[0].provenance }),
    hymns,
    ...(glory ? { glory } : {}),
    ...(now   ? { now }   : {}),
  };
}

/**
 * Queries vespers blocks from the DB for a given date/pronoun and returns a
 * source object compatible with the assembler's resolveSource/deepGet system.
 *
 * When the date has a liturgical key (Lenten dates), queries by liturgical_key
 * so texts collected in any year can be used for the same liturgical position
 * in future years. Otherwise falls back to querying by calendar date.
 *
 * The returned object is nested to match the key path used in calendar entries:
 *   liturgical key  → { lent: { week: { '2': { thursday: { vespers: {…} } } } } }
 *   calendar date   → { '2026-10-03': { vespers: {…} } }
 */
function buildDbSource(date, pronoun) {
  let db;
  try {
    db = openDb();
    if (!db) return {};

    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);

    const rows = litKey
      ? db.prepare(`
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.liturgical_key = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(litKey, pronoun)
      : db.prepare(`
          SELECT b.section, b.block_order, b.type, b.tone, b.label, b.verse_number, b.position, b.text,
                 sf.filename AS source_filename
          FROM blocks b LEFT JOIN source_files sf ON b.source_file_id = sf.id
          WHERE b.date = ? AND b.pronoun = ? AND b.service IN ('vespers', 'other', 'liturgy')
          ORDER BY b.section, b.block_order
        `).all(date, pronoun);

    if (rows.length === 0) return {};

    // Normalize source_filename to a source key for priority ranking
    for (const row of rows) {
      row.dbSource = (row.source_filename || '').startsWith('stSergius')
        ? 'stSergius' : 'oca-menaion';
    }
    // Prefer OCA blocks when multiple sources cover the same section+order
    const deduped = deduplicateBySource(
      rows,
      r => `${r.section}:${r.block_order}`,
      'dbSource'
    );

    const bySection = {};
    for (const row of deduped) {
      (bySection[row.section] ??= []).push(row);
    }

    const vespers = {};
    for (const [section, blocks] of Object.entries(bySection)) {
      vespers[section] = transformSectionBlocks(section, blocks);
    }

    const topKey = litKey || date;
    return buildNestedPath(topKey, { vespers });
  } catch (err) {
    console.error('buildDbSource error:', err.message);
    return {};
  } finally {
    db?.close();
  }
}

function getDbBlocks(date, pronoun, service = 'vespers') {
  let db;
  try {
    db = openDb();
    if (!db) return [];
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day));
    const litKey  = getLiturgicalKey(dateObj);
    if (litKey) {
      return db.prepare(`
        SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
        FROM blocks WHERE liturgical_key = ? AND pronoun = ? AND service = ?
        ORDER BY section, block_order
      `).all(litKey, pronoun, service);
    }
    return db.prepare(`
      SELECT section, block_order, type, tone, label, verse_number, position, attribution, text
      FROM blocks WHERE date = ? AND pronoun = ? AND service = ?
      ORDER BY section, block_order
    `).all(date, pronoun, service);
  } catch { return []; }
  finally { db?.close(); }
}

function mapDbBlocks(dbBlocks) {
  const sectionRank = k => { const i = SECTION_ORDER.indexOf(k); return i === -1 ? 99 : i; };
  const sorted = [...dbBlocks].sort((a, b) =>
    sectionRank(a.section) - sectionRank(b.section) || a.block_order - b.block_order
  );
  return sorted.map((b, i) => {
    const section = SECTION_LABELS[b.section] || b.section;
    let type = b.type, text = b.text || '', speaker = null;
    if (b.type === 'glory_marker') { type = 'doxology'; text = 'Glory to the Father, and to the Son, and to the Holy Spirit:'; }
    else if (b.type === 'now_marker') { type = 'doxology'; text = 'Now and ever, and unto ages of ages. Amen.'; }
    else if (b.type === 'hymn') speaker = 'choir';
    return { id: `db-${i}`, section, type, speaker, text, tone: b.tone || null, label: b.label || null };
  });
}

module.exports = {
  SECTION_LABELS,
  SECTION_ORDER,
  buildNestedPath,
  categorizeHymn,
  transformSectionBlocks,
  buildDbSource,
  getDbBlocks,
  mapDbBlocks,
};
