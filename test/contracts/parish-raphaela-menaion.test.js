'use strict';

/**
 * Feature contract: a parish whose choir sings Mother Raphaela's Menaion hears
 * it (rubric menaion.textSource = "raphaela"; St John of Damascus, Tyler).
 *
 * Found 2026-11-20: Ryan attended the Entry Litya and the Lord I Call, Litya
 * and Aposticha did not match what the choir sang. Same hymns, same tones —
 * a different English translation: ours the OCA service text, Connie's the
 * Raphaela corpus from the choir site. Standing rule: match Connie for this
 * parish (memory feedback_tyler_match_connie); the base stays OCA.
 *
 *   INV-1  Tyler 11-20 eve: every Menaion hymn at Lord I Call, the Litya and
 *          the Aposticha is Raphaela's wording (Connie's 11.20.26 packet),
 *          provenance says so, and the OCA base is unchanged.
 *   INV-2  Tyler 11-21 eve (11-22): the Octoechos half is untouched; the three
 *          feast stichera are Raphaela's Tone 1 set — a CURATED pair, the
 *          corpus appoints different hymns from our base (11.21.26 packet).
 *   INV-3  An excluded day keeps the base: 9-06, whose packet sings the OCA
 *          Colossae stichera in thee/thou.
 *   INV-4  The layer is guarded by content: a base row whose text changed is
 *          left alone rather than overwritten.
 *   INV-5  The generated layer is current with oca.db and the corpus
 *          (raphaela-parish-build.js --check).
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3146;  // unique across the suite — enforced by test/contracts/port-ledger.test.js
const TYLER = 'translation=st-john-damascus-tyler';
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, json });
      });
    }).on('error', reject);
  });
}
async function blocks(urlPath) {
  const r = await get(urlPath);
  assert.equal(r.status, 200, `${urlPath} -> ${r.status}`);
  return r.json.blocks;
}
const hymnsIn = (b, section) => b.filter((x) => x.section === section && x.type === 'hymn');
const RAPHAELA = 'Myrrh-bearers (Raphaela)';

before(async () => {
  serverProcess = spawn('node', ['server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Entry of the Theotokos, Great Vespers 2026-11-20', () => {
  it('INV-1 Lord I Call: Raphaela, in the packet\'s order, for Tyler; OCA for the base', async () => {
    const t = hymnsIn(await blocks(`/api/service?date=2026-11-20&${TYLER}`), 'Lord, I Have Cried');
    const heads = t.map((x) => x.text.split('\n')[0]);
    assert.deepEqual(heads, [
      'Today let us, the faithful, dance for joy,',
      'Today let us, the faithful, dance for joy,',
      'Today the living Temple of the holy glory of Christ our God',
      'Today the living Temple of the holy glory of Christ our God',
      'The prophets proclaimed you, O Virgin Mother of God:',
      'Led by the Holy Spirit,',
      'The young girls rejoice today,',
      'Anna, the all-blessed cried out rejoicing:',
      'After your birth, Lady and Bride of God,',
    ]);
    assert.ok(t.every((x) => x.provenance === RAPHAELA), 'every Menaion hymn is labelled Raphaela');
    const base = hymnsIn(await blocks('/api/service?date=2026-11-20'), 'Lord, I Have Cried');
    assert.match(base[0].text, /^Today, let us dance, O faithful/);
    assert.match(base.at(-1).text, /^After thy birth, O Lady and Bride of God/);
  });

  it('INV-1 Litya and Aposticha: Raphaela for Tyler, OCA for the base', async () => {
    const t = await blocks(`/api/service?date=2026-11-20&${TYLER}`);
    const lit = hymnsIn(t, 'The Litya');
    assert.match(lit[0].text, /^Today let heaven greatly rejoice/);
    assert.match(lit.at(-1).text, /^A day of joy has dawned;/);
    assert.ok(lit.every((x) => x.provenance === RAPHAELA));
    const ap = hymnsIn(t, 'Aposticha');
    assert.match(ap[1].text, /^Anna, truly blessed by God's grace/);
    assert.match(ap.at(-1).text, /^Today let us the assembled faithful triumph in spirit!/);
    const base = await blocks('/api/service?date=2026-11-20');
    assert.match(hymnsIn(base, 'The Litya')[0].text, /^Today, let heaven above rejoice/);
    assert.match(hymnsIn(base, 'Aposticha')[1].text, /^Anna, the namesake of grace/);
  });
});

describe('Afterfeast Sunday, Great Vespers 2026-11-21 (content 11-22)', () => {
  it('INV-2 Octoechos untouched; the feast stichera are Raphaela\'s Tone 1 set (curated)', async () => {
    const t = await blocks(`/api/service?date=2026-11-21&${TYLER}`);
    const byId = (id) => t.find((x) => x.id === id);
    assert.match(byId('lic-hymn-v10').text, /^We offer to Thee, O Christ/);
    assert.equal(byId('lic-hymn-v10').provenance, 'OCA');
    for (const [id, head] of [['lic-hymn-v6', 'The virgins bearing lamps'],
      ['lic-hymn-v5', 'The Theotokos, glorious fruit of a sacred promise'],
      ['lic-hymn-v4', 'O Virgin, fed in faith']]) {
      assert.ok(byId(id).text.startsWith(head), `${id}: ${byId(id).text.slice(0, 40)}`);
      assert.equal(byId(id).tone, 1);
    }
    assert.match(byId('lic-glory-hymn').text, /^Today let heaven greatly rejoice/);
    const base = await blocks('/api/service?date=2026-11-21');
    assert.match(base.find((x) => x.id === 'lic-hymn-v6').text, /^O most glorious wonder/);
  });
});

describe('Guards', () => {
  it('INV-3 9-06 is excluded: Tyler keeps the OCA Colossae stichera the packet sings', async () => {
    const t = await blocks(`/api/service?date=2026-09-05&${TYLER}`);
    assert.match(t.find((x) => x.id === 'lic-hymn-v3').text, /^O Michael, the Chief Captain, thou hast been revealed/);
  });

  it('INV-4 a changed base row detaches its Raphaela entry', () => {
    const { applyToStichera, overridesFrom } = require(path.join(ROOT, 'server-lib/sources/menaion-overrides.js'));
    const ovr = overridesFrom({ rubrics: { menaion: { textSource: 'raphaela' } } }, 11, 21);
    const e = ovr.find((o) => o.target.hymn.section === 'lordICall' && o.target.hymn.order === 1);
    assert.ok(e, 'an entry for 11-21 Lord I Call #1');
    const comm = { title: e.target.commemoration.title };
    const row = { section: 'lordICall', order: 1, tone: 1, text: 'a base text that was re-authored' };
    assert.deepEqual(applyToStichera(ovr, 11, 21, comm, [row]), [row], 'guard miss leaves the base');
    assert.equal(overridesFrom({ rubrics: {} }, 11, 21), null, 'no rubric, no layer');
  });

  it('INV-5 the generated layer is current', () => {
    const r = spawnSync(process.execPath, ['scripts/menaion-ingest/raphaela-parish-build.js', '--check'], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr || r.stdout);
  });
});
