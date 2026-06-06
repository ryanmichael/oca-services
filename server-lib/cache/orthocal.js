'use strict';

const { openDb, openDbWrite } = require('./sqlite');

function ensureOrthocalCacheTable() {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.exec(`CREATE TABLE IF NOT EXISTS orthocal_cache (
      date       TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
  } catch (err) {
    console.error('Failed to create orthocal_cache table:', err.message);
  }
}

function getOrthocalCache(dateStr) {
  try {
    const db = openDb();
    if (!db) return null;
    const row = db.prepare('SELECT data FROM orthocal_cache WHERE date = ?').get(dateStr);
    return row ? JSON.parse(row.data) : null;
  } catch { return null; }
}

function setOrthocalCache(dateStr, data) {
  try {
    const db = openDbWrite();
    if (!db) return;
    db.prepare(
      'INSERT OR REPLACE INTO orthocal_cache (date, data, fetched_at) VALUES (?, ?, ?)'
    ).run(dateStr, JSON.stringify(data), new Date().toISOString());
  } catch (err) {
    console.error('Orthocal cache write error:', err.message);
  }
}

async function fetchOrthocalDay(dateStr) {
  const cached = getOrthocalCache(dateStr);
  if (cached) return cached;

  const [year, month, day] = dateStr.split('-').map(Number);
  const url = `https://orthocal.info/api/gregorian/${year}/${month}/${day}/`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Orthocal API ${res.status} for ${dateStr}`);
  const data = await res.json();

  setOrthocalCache(dateStr, data);
  return data;
}

module.exports = { ensureOrthocalCacheTable, fetchOrthocalDay };
