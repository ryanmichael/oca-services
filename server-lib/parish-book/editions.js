'use strict';

/**
 * Parish Book — editions.
 *
 * An EDITION is one bound book: one parish, one service, one recension
 * (Chrysostom / Basil / Paschal…). It lives in
 * `parish-books/<parish>/<edition>.json` and says three things:
 *
 *   - which dates it serves (`membership`), judged from the assembled
 *     service itself, so the calendar logic is never duplicated here;
 *   - which years to derive the book from (`sampleYears`);
 *   - which stretches the weekly insert carries whole (`stretches`).
 *
 * The derived book is FROZEN beside it as `<edition>.book.json` by
 * `npm run parish-book:build`. A bound book is printed once and used for
 * years, so the site serves the frozen layout — never a re-derivation that
 * could quietly disagree with the copies in the pews. `--check` reports drift.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'parish-books');
const SAFE = /^[a-z0-9][a-z0-9-]*$/;

function editionPath(parish, id, suffix = '.json') {
  if (!SAFE.test(parish) || !SAFE.test(id)) throw new Error('bad parish/edition id');
  return path.join(DIR, parish, id + suffix);
}

function listEditions(parish) {
  if (!SAFE.test(parish)) return [];
  const d = path.join(DIR, parish);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter(f => f.endsWith('.json') && !f.endsWith('.book.json'))
    .map(f => loadEdition(parish, f.slice(0, -5)))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

function listParishes() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => SAFE.test(f) && fs.statSync(path.join(DIR, f)).isDirectory());
}

function loadEdition(parish, id) {
  const e = JSON.parse(fs.readFileSync(editionPath(parish, id), 'utf8'));
  if (e.parish !== parish || e.id !== id) throw new Error(`edition ${parish}/${id}: parish/id fields disagree with its path`);
  return e;
}

function loadBook(parish, id) {
  const p = editionPath(parish, id, '.book.json');
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function writeBook(parish, id, book) {
  fs.writeFileSync(editionPath(parish, id, '.book.json'), JSON.stringify(book, null, 1) + '\n');
}

const WEEKDAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };

/** Date-only part of membership — cheap, no assembly. */
function onWeekday(edition, date) {
  const wd = edition.membership?.weekday;
  if (wd === undefined) return true;
  return new Date(date + 'T12:00:00Z').getUTCDay() === WEEKDAYS[wd];
}

/** Full membership, judged from the assembled service. */
function claims(edition, date, service) {
  const m = edition.membership || {};
  if (!onWeekday(edition, date)) return false;
  if (m.seasons && !m.seasons.includes(service.season)) return false;
  if (m.serviceName && !(service.serviceName || '').includes(m.serviceName)) return false;
  // A Feast of the Lord on a Sunday sings festal antiphons in place of the
  // Beatitudes the book prints — that week is a full-booklet week, not a
  // misfit (decided 2026-11-23, features/parish-book.md).
  if (m.antiphons && service.antiphons !== m.antiphons) return false;
  // A dated seasonal layer swaps the parish's texts for a window of dates (St
  // John of Damascus's "Liturgy #2", 2026-11-29 to Great Lent). The book is
  // printed in its standing texts, so a Sunday under a layer it was not printed
  // for is a full-booklet week too — decided 2026-11-26: the book keeps the
  // Liturgy #1 wording. An edition printed FOR a layer names it in
  // `membership.seasonalLayer` and claims only the Sundays under it.
  const layers = (service.seasonalLayers || []).map(l => l.id).sort().join(',');
  if (layers !== (m.seasonalLayer || '')) return false;
  return true;
}

/** Every date in the given years that falls on the edition's weekday. */
function candidateDates(edition, years) {
  const out = [];
  for (const y of years) {
    for (let d = new Date(Date.UTC(y, 0, 1)); d.getUTCFullYear() === y; d.setUTCDate(d.getUTCDate() + 1)) {
      const s = d.toISOString().slice(0, 10);
      if (onWeekday(edition, s)) out.push(s);
    }
  }
  return out;
}

module.exports = {
  DIR, listParishes, listEditions, loadEdition, loadBook, writeBook,
  claims, candidateDates, onWeekday,
};
