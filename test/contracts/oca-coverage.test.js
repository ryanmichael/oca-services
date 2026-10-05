'use strict';

/**
 * Feature contract: OCA service-text fetching and the coverage probe.
 *
 * Chunk 2 of the OCA-standardisation plan. Pins the two things that actually
 * went wrong while building it, and the URL shape that caused a false
 * "the source is dead" conclusion.
 *
 * No network. Live fetching is exercised by running the script; a contract test
 * that depends on files.oca.org being up would fail for reasons unrelated to
 * this repo.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..', '..');
const oca  = require(path.join(ROOT, 'server-lib', 'sources', 'oca-service-texts'));

describe('Feature contract: OCA service-text fetch + coverage', () => {
  it('INV-1: the URL uses the publisher shape YYYY-MMDD, not a full ISO date', () => {
    // Probing `20241004-texts-tt.docx` — an invented shape — returned 404 and
    // led to reporting the host dead. The real shape has a single hyphen after
    // the year, and `2026-1004-texts-tt.docx` serves 200.
    assert.equal(oca.fileDate('2026-10-04'), '2026-1004');
    assert.equal(oca.ocaUrl('2026-10-04'),
      'https://files.oca.org/service-texts/2026-1004-texts-tt.docx');
    assert.equal(oca.ocaUrl('2026-10-04', 'yy'),
      'https://files.oca.org/service-texts/2026-1004-texts-yy.docx');
    assert.ok(!/\d{8}/.test(oca.ocaUrl('2026-10-04')), 'must not emit YYYYMMDD');
  });

  it('INV-2: the Wayback URL asks for raw bytes', () => {
    // Without the `id_` suffix the archive returns its toolbar-wrapped HTML
    // page, which the PK guard then rejects as "not a DOCX".
    const wb = oca.waybackUrl(oca.ocaUrl('2026-10-04'));
    assert.match(wb, /^https:\/\/web\.archive\.org\/web\/2id_\//);
    assert.match(wb, /files\.oca\.org/);
  });

  it('INV-3: requiring the rescrape fetcher does NOT run a fetch pass', () => {
    // It used to call main() at module scope. Requiring it to reuse a helper
    // therefore kicked off a full 197-date fetch as a side effect — which is
    // exactly what happened while extracting the shared module.
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'rescrape-fetch.js'), 'utf8');
    assert.match(src, /require\.main === module/,
      'rescrape-fetch.js must guard main() behind require.main');
    const tail = src.slice(src.lastIndexOf('require.main === module'));
    assert.match(tail, /main\(\)/, 'and main() must be inside that guard');
  });

  it('INV-4: both scripts share ONE fetcher', () => {
    // Two copies drift, and the copy the audit does not use is the one that
    // breaks silently.
    for (const f of ['rescrape-fetch.js', 'oca-coverage.js']) {
      const src = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
      assert.match(src, /sources\/oca-service-texts/, `${f} must use the shared fetcher`);
      assert.ok(!/function fetchOnce\s*\(/.test(src), `${f} must not re-implement fetchOnce`);
    }
  });

  it('INV-5: the coverage probe targets only non-OCA commemorations', () => {
    const { targets } = require(path.join(ROOT, 'scripts', 'oca-coverage.js'));
    const t = targets();
    assert.ok(t.length > 100, `expected the full target list, got ${t.length}`);
    for (const e of t) {
      assert.match(e.md, /^\d{2}-\d{2}$/, `month-day shape: ${e.md}`);
      for (const c of e.comms.values()) {
        assert.ok(c.sources.length > 0);
        for (const s of c.sources) {
          assert.match(s, /^(lambertsen|stSergius|raphaela)×\d+$/,
            `an OCA source leaked into the target list: ${s}`);
        }
      }
    }
  });

  it('INV-6: requiring the coverage script does not probe the network either', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'oca-coverage.js'), 'utf8');
    assert.match(src, /require\.main === module/);
  });

  it('INV-7: it is fetch-only — it never opens the DB for writing', () => {
    // The harness must not be able to mutate liturgical data. It lists targets
    // through the read-only helper and writes only to reference/scrape/.
    const src = fs.readFileSync(path.join(ROOT, 'scripts', 'oca-coverage.js'), 'utf8');
    assert.ok(!/openDbWrite/.test(src), 'coverage must never open the DB for writing');
    assert.ok(!/\b(INSERT|UPDATE|DELETE)\b/.test(src), 'coverage must not issue writes');
  });
});
