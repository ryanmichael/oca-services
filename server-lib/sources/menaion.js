'use strict';

const { openDb }              = require('../cache/sqlite');
const { deduplicateBySource } = require('../../oca-psalter');

/**
 * Returns the primary commemoration for a day — the first one that has a
 * troparion, which corresponds to the highest-ranking saint on the OCA page
 * (they are listed in descending rank order).
 */
function getMenaionPrimary(month, day) {
  const comms = getMenaionDay(month, day);
  if (!comms) return null;
  return comms.find(c => c.troparia.some(t => t.type === 'troparion')) ?? null;
}

/**
 * Returns all Lord I Call stichera for a given month/day from oca.db.
 * Shape: [{ commemoration, stichera: [{ order, tone, label, text }] }]
 */
function getSticheraDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.id, c.title, c.rank,
             s."order", s.section, s.tone, s.label, s.text
      FROM stichera s
      JOIN commemorations c ON c.id = s.commemoration_id
      WHERE c.month = ? AND c.day = ?
      ORDER BY c.id, s.section, s."order"
    `).all(month, day);
    if (rows.length === 0) return null;
    const byComm = {};
    for (const row of rows) {
      if (!byComm[row.id]) {
        byComm[row.id] = { id: row.id, title: row.title, rank: row.rank, stichera: [] };
      }
      byComm[row.id].stichera.push({
        section: row.section,
        order:   row.order,
        tone:    row.tone,
        label:   row.label,
        text:    row.text,
      });
    }
    return Object.values(byComm);
  } catch (err) {
    console.error('getSticheraDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Returns ranked Menaion data for service assembly.
 * Single DB call combining commemorations + troparia + stichera.
 *
 * Returns:
 *   {
 *     principal:    { id, title, tone, rank, troparia, stichera, hasTroparion, hasStichera }
 *     sticheraComm: same shape | null   — the commemoration that owns stichera
 *     notable:      [...same shape]     — all comms with troparia, sorted by id (= OCA priority)
 *     all:          [...same shape]     — all comms for the day
 *   }
 *
 * principal = stichera-saint (if any, and it has a troparion), else first notable by id.
 * This ensures the saint OCA published stichera for is treated as the primary, even
 * when a moveable feast (Triodion/Pentecostarion) sits at a lower id.
 */
function getMenaionRanked(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;

    const comms = db.prepare(`
      SELECT id, title, rank, tone, saint_type FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;

    const ids          = comms.map(c => c.id);
    const placeholders = ids.map(() => '?').join(',');

    const tropRows = db.prepare(
      `SELECT commemoration_id, type, tone, text, pronoun
       FROM troparia WHERE commemoration_id IN (${placeholders})
         AND pronoun = 'tt'`
    ).all(...ids);

    const stRows = db.prepare(
      `SELECT commemoration_id, "order", section, tone, label, text, source AS dbSource
       FROM stichera WHERE commemoration_id IN (${placeholders})
       ORDER BY commemoration_id, section, "order"`
    ).all(...ids);

    const tropariaMap  = {};
    const sticheraMap  = {};
    for (const t of tropRows) {
      (tropariaMap[t.commemoration_id] ??= []).push(t);
    }
    for (const s of stRows) {
      (sticheraMap[s.commemoration_id] ??= []).push({
        order: s.order, section: s.section, tone: s.tone, label: s.label, text: s.text,
        dbSource: s.dbSource,
      });
    }
    // Prefer OCA source when multiple translations exist for the same slot
    for (const [commId, stichera] of Object.entries(sticheraMap)) {
      sticheraMap[commId] = deduplicateBySource(
        stichera,
        s => `${s.section}:${s.order}`,
        'dbSource'
      );
    }

    const enriched = comms.map(c => ({
      id:           c.id,
      title:        c.title,
      rank:         c.rank,
      tone:         c.tone,
      saint_type:   c.saint_type,
      troparia:     tropariaMap[c.id] ?? [],
      stichera:     sticheraMap[c.id] ?? [],
      hasTroparion: (tropariaMap[c.id] ?? []).some(t => t.type === 'troparion'),
      hasStichera:  !!(sticheraMap[c.id]?.length),
    }));

    const sticheraSaint = enriched.find(c => c.hasStichera && c.hasTroparion)
                       ?? enriched.find(c => c.hasStichera);
    const firstNotable  = enriched.find(c => c.hasTroparion);
    const principal     = sticheraSaint ?? firstNotable ?? enriched[0] ?? null;
    const sticheraComm  = enriched.find(c => c.hasStichera) ?? null;
    const notable       = enriched.filter(c => c.hasTroparion);

    return { principal, sticheraComm, notable, all: enriched };
  } catch (err) {
    console.error('getMenaionRanked error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Lightweight version for the /api/days list — returns only titles.
 * Avoids loading full troparia/stichera text for every day in the view.
 *
 * Returns: { principal: string, commemorations: string[] } | null
 */
function getMenaionDayList(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT c.title
      FROM commemorations c
      JOIN troparia t ON t.commemoration_id = c.id
      WHERE c.month = ? AND c.day = ? AND t.type = 'troparion'
        AND t.pronoun = 'tt'
      GROUP BY c.id
      ORDER BY c.id
    `).all(month, day);
    if (rows.length === 0) return null;
    return { principal: rows[0].title, commemorations: rows.map(r => r.title) };
  } catch { return null; }
  finally { db?.close(); }
}

/**
 * Returns all commemorations + troparia for a given month/day from oca.db.
 * Shape: [{ id, title, rank, tone, troparia: [{ type, tone, text }] }, …]
 */
function getMenaionDay(month, day) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const comms = db.prepare(`
      SELECT id, title, rank, tone FROM commemorations
      WHERE month = ? AND day = ? ORDER BY id
    `).all(month, day);
    if (comms.length === 0) return null;
    const getTroparia = db.prepare(`
      SELECT type, tone, text, pronoun FROM troparia
      WHERE commemoration_id = ? AND pronoun = 'tt' ORDER BY type
    `);
    return comms.map(c => ({
      id:       c.id,
      title:    c.title,
      rank:     c.rank,
      tone:     c.tone,
      troparia: getTroparia.all(c.id),
    }));
  } catch (err) {
    console.error('getMenaionDay error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

/**
 * Returns the patron-of-temple troparion + kontakion by commemoration_id.
 * Used by api-liturgy.js to inject the parish patron's hymns at the end of
 * the troparia list (and before the principal-feast kontakion).
 *
 * Returns: { troparion: {tone, text} | null, kontakion: {tone, text} | null } | null
 */
function getMenaionPatron(commemorationId) {
  let db;
  try {
    db = openDb();
    if (!db) return null;
    const rows = db.prepare(`
      SELECT type, tone, text FROM troparia
      WHERE commemoration_id = ? AND type IN ('troparion', 'kontakion')
        AND pronoun = 'tt'
    `).all(commemorationId);
    if (rows.length === 0) return null;
    const out = { troparion: null, kontakion: null };
    for (const r of rows) {
      out[r.type] = { tone: r.tone, text: r.text };
    }
    return out;
  } catch (err) {
    console.error('getMenaionPatron error:', err.message);
    return null;
  } finally {
    db?.close();
  }
}

module.exports = {
  getMenaionPrimary,
  getSticheraDay,
  getMenaionRanked,
  getMenaionDayList,
  getMenaionDay,
  getMenaionPatron,
};
