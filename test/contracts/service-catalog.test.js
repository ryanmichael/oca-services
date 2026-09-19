/**
 * Contract: the searchable service catalog (server-lib/search/service-catalog.js)
 *
 * The catalog is the single source of truth for "which services exist and
 * when are they served" — /api/days reads it for the week list and
 * /api/search reads it to answer "is there a Presanctified / a Panikhida?".
 * These tests pin that the two views cannot drift apart and that search
 * answers land on real dates.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const { SERVICE_CATALOG, matches } = require('../../server-lib/search/service-catalog');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3095;

const get = (p) => new Promise((resolve, reject) => {
  http.get(`http://localhost:${PORT}${p}`, (res) => {
    let data = '';
    res.on('data', c => { data += c; });
    res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json }); });
  }).on('error', reject);
});

describe('service catalog', () => {
  it('INV-1: every entry is well-formed and keys are unique', () => {
    const keys = new Set();
    for (const s of SERVICE_CATALOG) {
      assert.ok(!keys.has(s.key), `duplicate key ${s.key}`); keys.add(s.key);
      assert.ok(s.name && s.description && Array.isArray(s.keywords) && s.keywords.length, s.key);
      assert.ok(['date', 'form'].includes(s.kind), s.key);
      if (s.kind === 'date') assert.equal(typeof s.isServed, 'function', `${s.key} needs isServed`);
      if (s.kind === 'form') assert.ok(s.form, `${s.key} needs a form id`);
    }
  });

  it('INV-2: matching — name, keyword, multi-word prefix; not a saint name', () => {
    const pk = SERVICE_CATALOG.find(s => s.key === 'panikhida');
    for (const q of ['memorial', 'Panikhida', 'pannik', 'requiem', 'memory eternal', 'departed', 'forty days']) {
      assert.ok(matches(pk, q), `panikhida should match "${q}"`);
    }
    const pre = SERVICE_CATALOG.find(s => s.key === 'presanctified');
    assert.ok(matches(pre, 'presanct'));
    assert.ok(matches(pre, 'pres lit'), 'multi-word prefix');
    for (const s of SERVICE_CATALOG) {
      assert.ok(!matches(s, 'nicholas'), `${s.key} must not match a saint name`);
      assert.ok(!matches(s, 'x'), 'single char never matches');
    }
  });

  describe('over HTTP', () => {
    let proc;
    before(async () => {
      proc = spawn('node', ['server.js', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
      const t0 = Date.now();
      while (Date.now() - t0 < 20000) {
        try { await get('/healthz'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
      }
      throw new Error('server did not start');
    });
    after(() => proc?.kill());

    it('INV-3: /api/days emits exactly the catalog\'s date-kind services (minus inDays:false)', async () => {
      const expected = SERVICE_CATALOG.filter(s => s.kind === 'date' && s.inDays !== false).map(s => s.key).sort();
      const { json } = await get('/api/days?from=2026-09-19&to=2026-09-19');
      assert.deepEqual(Object.keys(json[0].services).sort(), expected);
      assert.equal(json[0].services.greatVespers, true, '2026-09-19 is a Saturday');
    });

    it('INV-4: search answers with the next real date — Presanctified lands on a Lenten Wed/Fri', async () => {
      const { json } = await get('/api/search?q=presanctified');
      const hit = json.services.find(s => s.key === 'presanctified');
      assert.ok(hit && hit.nextDate, 'presanctified hit with a nextDate');
      assert.match(hit.nextDate, /^\d{4}-\d{2}-\d{2}$/);
      const dow = new Date(hit.nextDate + 'T12:00:00Z').getUTCDay();
      assert.ok(dow === 3 || dow === 5, `Presanctified on Wed/Fri, got dow=${dow}`);
      // and that date's own /api/days row agrees — the two views share one predicate
      const days = await get(`/api/days?from=${hit.nextDate}&to=${hit.nextDate}`);
      assert.equal(days.json[0].services.presanctified, true);
      // and no earlier date in the scan window is served (it really is the NEXT one)
      const today = new Date().toISOString().slice(0, 10);
      const span  = await get(`/api/days?from=${today}&to=${hit.nextDate}`);
      const earlier = span.json.filter(d => d.date < hit.nextDate && d.services.presanctified);
      assert.deepEqual(earlier.map(d => d.date), []);
    });

    it('INV-5: a form service comes back as kind=form with no date; a saint query yields no services', async () => {
      const m = await get('/api/search?q=memorial');
      const pk = m.json.services.find(s => s.key === 'panikhida');
      assert.deepEqual({ kind: pk.kind, form: pk.form, nextDate: pk.nextDate }, { kind: 'form', form: 'panikhida', nextDate: undefined });
      const n = await get('/api/search?q=nicholas');
      assert.equal(n.json.services.length, 0);
      assert.ok(n.json.saints.length > 0);
    });
  });
});
