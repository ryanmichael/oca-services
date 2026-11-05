/**
 * Feature contract: the Hierarchical Divine Liturgy is a SERVICE TYPE
 *
 * A bishop presiding is a circumstance, not a calendar fact and not a parish
 * policy. Three variant axes meet on this service and are easy to confuse:
 *
 *   spec.variant    chrysostom / basil   CALENDAR — which Liturgy the day appoints
 *   opts.rubrics.*  confessFirst, …      POLICY   — what this parish does
 *   ?as=            hierarchical, typika CIRCUMSTANCE — who is available to serve
 *
 * This is the third. It is the same axis Reader's Typika sits on, approached
 * from the other side: Typika exists because the Liturgy cannot be served at
 * all, hierarchical because it is served by more than usual.
 *
 * Nothing here comes from the OCA order. reference/orders/2026-1108 is the
 * ordinary Sunday order and says outright that the ruling bishop should be
 * consulted. The texts are transcribed from the music the parish choir sings,
 * published on its own site under Special Services → Hierarchical Liturgy.
 * Only texts are modelled; the settings are third-party arrangements.
 *
 * The invariant that matters most is INV-5. A service type must ADD its own
 * matter and leave everything else alone — the propers, the readings, the
 * anaphora and the communion of a hierarchical Liturgy are the day's, not a
 * separate set. If this variant ever starts changing sections it has no
 * business in, that test fails before anyone sings it.
 *
 * Run: npm run test:contracts
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..');
const PORT = 3122; // distinct: 3121 was the last taken
let serverProcess;

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: data, json });
      });
    }).on('error', reject);
  });
}

async function waitForServer(maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try { await get('/'); return; } catch (_) { await new Promise(r => setTimeout(r, 300)); }
  }
  throw new Error(`Server did not start within ${maxMs}ms`);
}

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe',
  });
  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('Error') && !msg.includes('EADDRINUSE')) console.error('[server stderr]', msg);
  });
  await waitForServer();
});
after(() => { if (serverProcess) serverProcess.kill(); });

const SUNDAY   = '2026-11-08';   // Synaxis of the Archangel Michael
const ELEVATION = '2026-09-14';  // Trisagion substitution: "Before Thy Cross…"

const std  = async (d) => (await get(`/api/liturgy?date=${d}`)).json;
const hier = async (d) => (await get(`/api/liturgy?date=${d}&as=hierarchical`)).json;
const sec  = (b, name) => b.filter(x => x.section === name);
const txt  = (b) => b.map(x => x.text || '').join('\n');

const VESTING = 'Meeting and Vesting of the Bishop';

describe('Feature contract: the Hierarchical Divine Liturgy is a service type', () => {
  it('INV-1: the standard Liturgy carries none of it', async () => {
    const b = (await std(SUNDAY)).blocks;
    assert.equal(sec(b, VESTING).length, 0,
      'a standard Liturgy must not vest a bishop');
    assert.doesNotMatch(txt(b), /Eis polla|Ton dhespotin|rising of the sun/i,
      'the hierarchical hymns must not leak into the ordinary service');
  });

  it('INV-2: the hierarchical form vests the bishop before the Liturgy', async () => {
    const b = (await hier(SUNDAY)).blocks;
    const vest = sec(b, VESTING);
    // Assert the ORDER of the pieces, not a count. `vest.length >= 5` was the
    // old assertion and it could not see a missing hymn: the 11-08 packet's
    // annotated Theotokos sheet was absent for months under a green test.
    const sungIds = vest.filter(x => x.type === 'hymn').map(x => x.id);
    assert.deepEqual(sungIds, [
      'hier-rising',      // Ps 112:3, as the bishop is met at the doors
      'hier-soul',        // the vesting verse
      'hier-theotokos',   // "It is truly meet", softly, until the mitre
      'hier-ton-despotin',
      'hier-eis-polla',
    ], 'the vesting sings these five, in this order');

    const t = txt(vest);
    assert.match(t, /From the rising of the sun to its setting/, 'Ps 112:3 at the meeting');
    assert.match(t, /Thy soul shall rejoice in the Lord/,        'the vesting verse');
    assert.match(t, /It is truly meet to bless thee/,            'the Theotokos hymn');
    assert.match(t, /Ton dhespotin kai arkhierea imon/,          'Ton Despotin');
    assert.match(t, /Eis polla eti, dhespota/,                   'Eis Polla Eti, Despota');

    // It must come BEFORE the Liturgy proper, not somewhere in the middle.
    const firstVest = b.findIndex(x => x.section === VESTING);
    const doxology  = b.findIndex(x => x.section === 'Opening Doxology');
    assert.ok(firstVest >= 0 && firstVest < doxology,
      'the vesting precedes the Opening Doxology');
  });

  it('INV-2b: the vesting Theotokos hymn is a reference, not a second copy', async () => {
    // It is the same hymn as the anaphora megalynarion on an ordinary Sunday.
    // Holding it as "@@it-is-truly-meet" means a parish override of that key,
    // and the parish's register, reach both — a literal copy would drift.
    const b = (await hier(SUNDAY)).blocks;
    const vesting  = b.find(x => x.id === 'hier-theotokos');
    const anaphora = b.find(x => x.id === 'megalynarion');
    assert.ok(vesting && anaphora, 'both the vesting hymn and the megalynarion must render');
    assert.equal(vesting.text, anaphora.text,
      'the vesting hymn must resolve to the same text as the megalynarion');
    assert.doesNotMatch(vesting.text, /^@@/,
      'an unresolved @@ sentinel must never reach a block');
  });

  it('INV-2c: the vesting texts follow the parish register', async () => {
    // The corpus is tt-canonical and the pipeline only converts tt -> yy.
    // A text authored in yy is therefore IDENTICAL under both registers and
    // can never render thee/thy for a thee/thy parish. That byte-identity is
    // the detector: `hier-soul` shipped in yy and read "Your soul … clothed
    // you" for Tyler, a thee/thy parish, beside "bless thee" three blocks on.
    const tt = (await get(`/api/liturgy?date=${SUNDAY}&as=hierarchical&pronoun=tt`)).json.blocks;
    const yy = (await get(`/api/liturgy?date=${SUNDAY}&as=hierarchical&pronoun=yy`)).json.blocks;
    const byId = (bs, id) => bs.find(x => x.id === id)?.text || '';

    // Both of these address ONE person — the bishop, the Theotokos — so the
    // singular pronoun must change between registers. (Ton Despotin and Eis
    // Polla are transliterated Greek, and Ps 112:3 has no second person:
    // those three are register-neutral and are deliberately not asserted.)
    for (const id of ['hier-soul', 'hier-theotokos']) {
      assert.notEqual(byId(tt, id), byId(yy, id),
        `${id} renders identically in both registers — it is authored in yy and ` +
        `can never render thee/thy`);
    }
    const ttVest = txt(sec(tt, VESTING).filter(x => x.type === 'hymn'));
    assert.match(ttVest, /\bthee\b|\bthy\b/i, 'a tt render must actually use thee/thy here');
    assert.doesNotMatch(ttVest, /\byour?\b/i,
      'a tt render must not address the bishop or the Theotokos as "you"');
  });

  it('INV-3: the Trisagion alternates, and still ends with the priestly blessing', async () => {
    const t = sec((await hier(SUNDAY)).blocks, 'Trisagion');
    const sung = t.filter(x => x.type === 'hymn' && /^Holy God/.test(x.text || ''));
    assert.equal(sung.length, 4,
      `the hierarchical form is choir / clergy / choir / trio, got ${sung.length} repetitions`);
    assert.deepEqual(sung.map(x => x.speaker), ['choir', 'priest', 'choir', 'choir'],
      'the second repetition is the clergy in the altar');
    assert.match(sung[1].label || '', /clergy/i, 'who sings is carried by the label');
    assert.match(sung[3].label || '', /trio/i,   'the fourth repetition is the trio');
    assert.match(txt(t), /dikirion and trikirion/,
      'the bishop blesses the people between the third and fourth');

    // Regression guard: this tail follows EVERY form of the Trisagion and was
    // dropped by the hierarchical branch until it was extracted and shared.
    assert.match(txt(t), /Peace be unto all/, 'the priestly blessing must still close the Trisagion');
    assert.match(txt(t), /And to thy spirit/, 'and its response');
  });

  it('INV-4: a festal Trisagion substitution still wins', async () => {
    // `substitution: 'typical'` is the ORDINARY Trisagion, which the
    // hierarchical form replaces. 'cross' and 'baptismal' replace the hymn
    // itself, and the hierarchical alternation has no text to override them
    // with — getting this backwards silenced "Before Thy Cross…" on the
    // Elevation.
    const t = txt(sec((await hier(ELEVATION)).blocks, 'Trisagion'));
    assert.match(t, /Before Thy Cross/,
      'the Elevation keeps its substitution even when a bishop serves');
    assert.doesNotMatch(t, /dikirion and trikirion/,
      'the hierarchical alternation must not displace a festal substitution');
  });

  it('INV-5: it ADDS to the day and changes nothing else', async () => {
    const a = (await std(SUNDAY)).blocks;
    const b = (await hier(SUNDAY)).blocks;
    const count = (blocks) => blocks.reduce((m, x) => {
      m[x.section] = (m[x.section] || 0) + 1; return m;
    }, {});
    const ca = count(a), cb = count(b);
    const changed = [...new Set([...Object.keys(ca), ...Object.keys(cb)])]
      .filter(k => (ca[k] || 0) !== (cb[k] || 0))
      .sort();
    // A service type adds its own matter. The propers, readings, anaphora and
    // communion of a hierarchical Liturgy are the DAY'S — if this list ever
    // grows, the variant is reaching somewhere it should not.
    assert.deepEqual(changed, [
      'Hymn to the Theotokos',
      VESTING,
      'Trisagion',
    ].sort(), `the hierarchical form changed unexpected sections: ${changed.join(', ')}`);

    // And the day's own propers are untouched — same Gospel, same koinonikon.
    assert.equal(txt(sec(a, 'Gospel Reading')), txt(sec(b, 'Gospel Reading')));
    assert.equal(txt(sec(a, 'Communion Hymn')), txt(sec(b, 'Communion Hymn')));
  });

  it('INV-6: the response names the type, and the megalynarion is cued', async () => {
    const r = await hier(SUNDAY);
    assert.equal(r.serviceVariant, 'hierarchical');
    assert.match(r.serviceName, /^Hierarchical Divine Liturgy/);
    assert.equal((await std(SUNDAY)).serviceVariant, 'standard');

    // The hymn is unchanged; what differs is the bishop commemorating over it.
    const m = sec(r.blocks, 'Hymn to the Theotokos');
    const cue = m.find(x => x.type === 'rubric');
    assert.ok(cue && /commemorates the hierarchs aloud/i.test(cue.text || ''),
      'the megalynarion carries the bishop-commemoration cue');
    assert.ok(m.some(x => x.type === 'hymn'), 'and the hymn itself is still there');

    // The cue must describe only what the blocks beside it actually show.
    // It once carried the VESTING sheet's choreography — "the deacon chants
    // the proper commemoration over it", "the choir stops at the bishop's
    // signal" — read off the annotated Theotokos page and attached to the
    // wrong moment. Those cues belong to hier-theotokos-rubric. Keep them out.
    assert.doesNotMatch(cue.text, /mitre|vest|bishop's signal|stops? when/i,
      'vesting choreography must not reappear at the anaphora');
    const r2 = r.blocks.find(x => x.id === 'hier-theotokos-rubric');
    assert.match(r2?.text || '', /mitre/i,
      'and the mitre cue must still be where the packet puts it — the vesting');
  });
});
