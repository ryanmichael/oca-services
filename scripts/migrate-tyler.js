#!/usr/bin/env node
'use strict';

// Seeds the parish_settings + parish_variant_picks rows for St. John of
// Damascus, Tyler, TX. Idempotent (UPSERT).
//
// Architecture (design doc §6):
//   - Tyler's existing file-based overlay at
//     fixed-texts/translations/st-john-damascus-tyler/ is COPIED to
//     ./st-john-damascus-tyler-legacy/ as a stable cascade layer that
//     provides every override the new in-memory overlay doesn't yet derive
//     (litany hierarch commemorations, antiphons, Trisagion, pre-Communion,
//     Cherubic Hymn, etc.).
//   - The in-memory overlay registered as 'st-john-damascus-tyler' (same id
//     as the URL ?translation=… uses today) shadows the original dir via
//     manifest.js short-circuit and derives the Anaphora hierarch keys.
//   - extends_chain: ['oca', 'st-john-damascus-tyler-legacy'] — cascade
//     resolves base → oca → legacy → in-memory.

const fs   = require('fs');
const path = require('path');
const { openDbWrite } = require('../server-lib/cache/sqlite');

const ROOT          = path.resolve(__dirname, '..');
const TYLER_ID      = 'st-john-damascus-tyler';
const LEGACY_ID     = 'st-john-damascus-tyler-legacy';
const TYLER_DIR     = path.join(ROOT, 'fixed-texts', 'translations', TYLER_ID);
const LEGACY_DIR    = path.join(ROOT, 'fixed-texts', 'translations', LEGACY_ID);

function copyLegacyDir() {
  if (fs.existsSync(LEGACY_DIR)) {
    console.log(`[migrate-tyler] legacy dir already exists at ${LEGACY_DIR}`);
    return;
  }
  if (!fs.existsSync(TYLER_DIR)) {
    throw new Error(`Tyler overlay dir not found at ${TYLER_DIR}`);
  }
  fs.cpSync(TYLER_DIR, LEGACY_DIR, { recursive: true });
  // Patch the copied manifest so its id makes sense + extends chain remains the same.
  const manifestPath = path.join(LEGACY_DIR, 'manifest.json');
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  m.name = (m.name || 'St. John of Damascus, Tyler, TX') + ' (legacy cascade layer)';
  m._note = 'Bucket-D carryover layer. Provides Tyler\'s overrides that are not yet derived from parish_settings (litany hierarchs, antiphons, Trisagion variants, pre-Communion, Cherubic Hymn). Phase 1+ adds derivation/library coverage; this dir shrinks over time.';
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
  console.log(`[migrate-tyler] copied ${TYLER_ID}/ → ${LEGACY_ID}/`);
}

function upsertTyler(db) {
  const now = Date.now();
  const row = {
    parish_id:            TYLER_ID,
    name:                 'St. John of Damascus, Tyler, TX',
    city:                 'Tyler, TX',
    jurisdiction:         'oca',
    extends_chain:        JSON.stringify(['oca', LEGACY_ID]),
    primate_name:         'Tikhon, Archbishop of Washington, Metropolitan of All America and Canada',
    ruling_hierarch_name: 'Alexander, Archbishop of Dallas and the South',
    patron_natural_key:   '12-04/john-of-damascus',
    patron_title:         'Venerable John of Damascus',
    rubric_confess_first: 1,
    rubric_omit_pre_trisagion_litany:    0,
    rubric_include_lesser_saints:        0,
    rubric_include_second_gospel:        0,
    rubric_include_second_koinonikon:    0,
    rubric_omit_catechumens_seasons:     '',
    rubric_paschal_communion_year_round: 1,    // Tyler year-round "Receive ye the Body"
    rubrics_extra_json:   null,
    legacy_overlay_path:  LEGACY_ID,
    created_at:           now,
    updated_at:           now,
  };

  const existing = db.prepare('SELECT parish_id, created_at FROM parish_settings WHERE parish_id = ?').get(TYLER_ID);
  if (existing) row.created_at = existing.created_at;  // preserve original timestamp

  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  const updates = cols.filter(c => c !== 'parish_id').map(c => `${c}=excluded.${c}`).join(', ');
  const sql = `INSERT INTO parish_settings (${cols.join(', ')}) VALUES (${placeholders})
               ON CONFLICT(parish_id) DO UPDATE SET ${updates}`;
  db.prepare(sql).run(...cols.map(c => row[c]));
  console.log(`[migrate-tyler] upserted parish_settings row for ${TYLER_ID}`);
}

function upsertVariantPicks(db) {
  // Phase 3 picks. The Cherubic Hymn is the first variant family populated
  // in the library; tyler-1 is byte-identical to Tyler's current legacy
  // overlay value (verified by parish-roundtrip-diff). Other picks
  // (pre-communion-prayer, blessed-is-the-man) follow as those library
  // catalogs get populated.
  const picks = [
    { variant_key: 'cherubic-hymn',        variant_id: 'tyler-1' },
    { variant_key: 'pre-communion-prayer', variant_id: 'htm' },
    { variant_key: 'blessed-is-the-man',   variant_id: 'htm-boston' },
  ];
  const stmt = db.prepare(`
    INSERT INTO parish_variant_picks (parish_id, variant_key, variant_id)
    VALUES (?, ?, ?)
    ON CONFLICT(parish_id, variant_key) DO UPDATE SET variant_id = excluded.variant_id
  `);
  for (const p of picks) stmt.run(TYLER_ID, p.variant_key, p.variant_id);
  console.log(`[migrate-tyler] upserted ${picks.length} variant pick(s) for ${TYLER_ID}`);
}

function appendHistory(db) {
  db.prepare(`
    INSERT INTO parish_settings_history (parish_id, changed_at, actor, field, old_value, new_value)
    VALUES (?, ?, 'migration', 'parish_settings.upsert', NULL, 'P1.5 Tyler seed')
  `).run(TYLER_ID, Date.now());
}

function main() {
  copyLegacyDir();

  const db = openDbWrite();
  if (!db) throw new Error('storage/oca.db not found');
  try {
    upsertTyler(db);
    upsertVariantPicks(db);
    appendHistory(db);
  } finally {
    db.close();
  }
  console.log('[migrate-tyler] done');
}

try { main(); } catch (err) { console.error('[migrate-tyler] FAILED:', err.message); process.exit(1); }
