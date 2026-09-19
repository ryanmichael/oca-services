/**
 * Feature contract: Panikhida (Memorial Service)
 * Spec: features/panikhida.md
 *
 * One test per INV-* invariant. Every structural check asserts a POSITION
 * (index relationships between block ids), not a label — see
 * feedback_assert_structure_not_labels. INV-10 spins up the server; the rest
 * call the assembler in-process.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const assemblePanikhida = require('../../assemblers/panikhida');
const fixed = require('../../fixed-texts/panikhida-fixed.json');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 3096; // distinct from confess-first (3097), patron (3098), smoke (3099)

const idx = (blocks, id) => {
  const i = blocks.findIndex(b => b.id === id);
  assert.notEqual(i, -1, `block ${id} missing`);
  return i;
};
const ids = (blocks) => blocks.map(b => b.id);

const PLURAL = assemblePanikhida(fixed, { names: ['John', 'Mary'] });
const MASC   = assemblePanikhida(fixed, { names: ['Peter'], gender: 'm' });
const FEM    = assemblePanikhida(fixed, { names: ['Anna'],  gender: 'f' });
const NONAME = assemblePanikhida(fixed, {});
const BRIEF  = assemblePanikhida(fixed, { names: ['Peter'], canon: 'brief' });
const NOPS90 = assemblePanikhida(fixed, { names: ['Peter'], psalm90: false });

describe('Panikhida contract', () => {

  it('INV-1: no {token} survives assembly in any form', () => {
    for (const [name, blocks] of Object.entries({ PLURAL, MASC, FEM, NONAME })) {
      const left = blocks.filter(b => /\{\w+\}/.test(b.text) || /\{\w+\}/.test(b.label || ''));
      assert.deepEqual(left.map(b => b.id), [], `${name}: unresolved tokens`);
    }
  });

  it('INV-2: gendered pronouns match the form', () => {
    // Blocks whose pronouns refer to God/Christ, not the departed.
    const exempt = new Set(['pk-ps90', 'pk-dis']);
    const scan = (blocks, re) => blocks.filter(b => !exempt.has(b.id) && re.test(b.text)).map(b => b.id);
    assert.deepEqual(scan(FEM,  /\b(his|him)\b/), [], 'feminine form leaks his/him');
    assert.deepEqual(scan(MASC, /\bher\b/).filter(id => id !== 'pk-kath-theot'), [], 'masculine form leaks her');
    assert.deepEqual(scan(PLURAL, /\b(his|him|she)\b/), [], 'plural form leaks singular pronouns');
    // and the positive: the feminine dismissal-tail actually says Her
    assert.equal(FEM.find(b => b.id === 'pk-me-dwell').text, 'Her soul shall dwell with the blessed.');
    assert.equal(PLURAL.find(b => b.id === 'pk-me-dwell').text, 'Their souls shall dwell with the blessed.');
  });

  it('INV-3: evlogitaria refrain immediately precedes each troparion; Glory→triadikon, Now→theotokion', () => {
    for (let i = 0; i < 6; i++) {
      assert.equal(idx(PLURAL, `pk-ev-${i}`), idx(PLURAL, `pk-ev-ref-${i}`) + 1, `refrain ${i}`);
    }
    assert.equal(idx(PLURAL, 'pk-ev-triad'), idx(PLURAL, 'pk-ev-glory') + 1);
    assert.equal(idx(PLURAL, 'pk-ev-theot'), idx(PLURAL, 'pk-ev-now') + 1);
    assert.equal(idx(PLURAL, 'pk-ev-now'),   idx(PLURAL, 'pk-ev-triad') + 1);
  });

  it('INV-4: "O God of spirits" is said exactly four times, each followed by its exclamation, at the right anchors', () => {
    const prayers = PLURAL.filter(b => b.text.startsWith('O God of spirits'));
    assert.equal(prayers.length, 4);
    for (const p of prayers) {
      const i = idx(PLURAL, p.id);
      assert.match(PLURAL[i + 1].text, /^For Thou art the resurrection/, `${p.id} exclamation`);
      assert.equal(PLURAL[i + 2].text, 'Amen.');
    }
    // anchors: after evlogitaria, after Ode III, after Ode VI, after T4 troparia
    assert.ok(idx(PLURAL, 'pk-ev-all')    < idx(PLURAL, 'pk-lit1-prayer') && idx(PLURAL, 'pk-lit1-prayer') < idx(PLURAL, 'pk-kath'));
    assert.ok(idx(PLURAL, 'pk-ode3-now')  < idx(PLURAL, 'pk-lit2-prayer') && idx(PLURAL, 'pk-lit2-prayer') < idx(PLURAL, 'pk-ode4-irm'));
    assert.ok(idx(PLURAL, 'pk-ode6-now')  < idx(PLURAL, 'pk-lit3-prayer') && idx(PLURAL, 'pk-lit3-prayer') < idx(PLURAL, 'pk-ode7-irm'));
    assert.ok(idx(PLURAL, 'pk-tr-n')      < idx(PLURAL, 'pk-lit4-prayer') && idx(PLURAL, 'pk-lit4-prayer') < idx(PLURAL, 'pk-dis-wis'));
  });

  it('INV-5: kontakion + ikos sit between the Ode VI litany and the next heirmos', () => {
    assert.ok(idx(PLURAL, 'pk-lit3-amen') < idx(PLURAL, 'pk-kont'));
    assert.equal(idx(PLURAL, 'pk-ikos'), idx(PLURAL, 'pk-kont') + 1);
    assert.equal(idx(PLURAL, 'pk-ode7-irm'), idx(PLURAL, 'pk-ikos') + 1);
    assert.equal(idx(BRIEF,  'pk-ode9-irm'), idx(BRIEF,  'pk-ikos') + 1);
  });

  it('INV-6: canon=brief emits exactly Odes III, VI, IX and keeps the four prayers + kontakion', () => {
    const odes = ids(BRIEF).filter(id => /^pk-ode\d-irm$/.test(id));
    assert.deepEqual(odes, ['pk-ode3-irm', 'pk-ode6-irm', 'pk-ode9-irm']);
    assert.equal(BRIEF.filter(b => b.text.startsWith('O God of spirits')).length, 4);
    idx(BRIEF, 'pk-kont');
    const full = ids(PLURAL).filter(id => /^pk-ode\d-irm$/.test(id));
    assert.deepEqual(full, ['pk-ode1-irm','pk-ode3-irm','pk-ode4-irm','pk-ode5-irm','pk-ode6-irm','pk-ode7-irm','pk-ode8-irm','pk-ode9-irm']);
  });

  it('INV-7: psalm90=0 removes exactly the Psalm 90 blocks', () => {
    const removed = ids(MASC).filter(id => !ids(NOPS90).includes(id));
    assert.deepEqual(removed, ['pk-lhm12','pk-ps90-gn','pk-ocluw-0','pk-ocluw-1','pk-ocluw-2','pk-ps90','pk-ps90-gn2','pk-ps90-all']);
    assert.equal(NOPS90.length, MASC.length - 8);
    // and the Alleluia follows the Our Father directly
    assert.equal(idx(NOPS90, 'pk-al-v0'), idx(NOPS90, 'pk-of-amen') + 1);
  });

  it('INV-8: the service ends with "Memory eternal!" then "…shall dwell with the blessed"', () => {
    for (const blocks of [PLURAL, MASC, FEM, NONAME, BRIEF, NOPS90]) {
      assert.equal(blocks[blocks.length - 1].id, 'pk-me-dwell');
      assert.equal(blocks[blocks.length - 2].id, 'pk-me');
      assert.match(blocks[blocks.length - 2].text, /^Memory eternal!/);
    }
  });

  it('INV-9: names land in every petition/prayer/exclamation and never in a hymn', () => {
    const withNames = PLURAL.filter(b => b.text.includes('John, Mary'));
    const expected = [
      'pk-lit1-p0','pk-lit1-prayer','pk-lit1-excl',
      'pk-lit2-p0','pk-lit2-prayer','pk-lit2-excl',
      'pk-lit3-p0','pk-lit3-prayer','pk-lit3-excl',
      'pk-lit4-p0','pk-lit4-prayer','pk-lit4-excl',
      'pk-dis','pk-me-call',
    ];
    assert.deepEqual(withNames.map(b => b.id), expected);
    assert.ok(withNames.every(b => b.type !== 'hymn'), 'a hymn carried the names');
    // no-name form uses the placeholder in the same slots
    assert.deepEqual(NONAME.filter(b => b.text.includes('(NN.)')).map(b => b.id), expected);
    assert.deepEqual(MASC.filter(b => b.text.includes('Peter')).map(b => b.id), expected);
  });

  describe('INV-10: route', () => {
    let serverProcess;
    const get = (p) => new Promise((resolve, reject) => {
      http.get(`http://localhost:${PORT}${p}`, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => { let json = null; try { json = JSON.parse(data); } catch (_) {} resolve({ status: res.statusCode, json, body: data }); });
      }).on('error', reject);
    });
    before(async () => {
      serverProcess = spawn('node', ['server.js', '--port', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
      const start = Date.now();
      while (Date.now() - start < 20000) {
        try { await get('/healthz'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
      }
      throw new Error('server did not start');
    });
    after(() => { serverProcess?.kill(); });

    it('Bright Week date → 404; no date → 200 with date null', async () => {
      const bw = await get('/api/panikhida?date=2026-04-14&names=John');
      assert.equal(bw.status, 404);
      const ok = await get('/api/panikhida?names=Anna&gender=f&canon=brief');
      assert.equal(ok.status, 200);
      assert.equal(ok.json.date, null);
      assert.equal(ok.json.canon, 'brief');
      assert.equal(ok.json.gender, 'f');
      assert.equal(ok.json.blocks.at(-1).text, 'Her soul shall dwell with the blessed.');
      const html = await get('/api/panikhida?names=John&format=html');
      assert.equal(html.status, 200);
      assert.match(html.body, /Memory eternal!/);
    });
  });
});
