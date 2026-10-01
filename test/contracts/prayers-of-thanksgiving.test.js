'use strict';

/**
 * Feature contract: Prayers of Thanksgiving after the dismissal.
 *
 * Described by the choir director of St John of Damascus, Tyler (2026-10-01):
 * the reader says these at the very end, while the faithful venerate the cross;
 * the parish sings three "Lord, have mercy" and the troparion of the church,
 * "but if it were a feast day or the week following a feast we would not sing to
 * St John but do the troparion of the feast."
 *
 * See features/prayers-of-thanksgiving.md.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3102;
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

const tyler = (date) => get(`/api/liturgy?date=${date}&translation=st-john-damascus-tyler`);
const section = (r) => (r.json.blocks || []).filter((b) => b.section === 'Prayers of Thanksgiving');
const closing = (r) => (r.json.blocks || []).find((b) => b.id === 'pot-close-rubric');

before(async () => {
  serverProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..', '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'pipe',
  });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try { await get('/'); return; } catch (_) { await new Promise((r) => setTimeout(r, 300)); }
  }
  throw new Error('server did not start');
});
after(() => { if (serverProcess) serverProcess.kill(); });

describe('Feature contract: Prayers of Thanksgiving', () => {
  it('INV-1 a parish that has not opted in still ends at the dismissal', async () => {
    const r = await get('/api/liturgy?date=2026-10-04');
    assert.equal(section(r).length, 0, 'no opt-in, no new section');
    const secs = r.json.blocks.map((b) => b.section);
    assert.equal(secs[secs.length - 1], 'Dismissal');
  });

  it('INV-2 Tyler gets all six prayers, in the order the book prints them', async () => {
    const r = await tyler('2026-10-04');
    const ids = section(r).map((b) => b.id);
    assert.deepEqual(
      ids.filter((i) => /^pot-(thanksgiving|basil|metaphrastes|third|theotokos|symeon)$/.test(i)),
      ['pot-thanksgiving', 'pot-basil', 'pot-metaphrastes', 'pot-third', 'pot-theotokos', 'pot-symeon']);
  });

  it('INV-3 the prayers come AFTER the dismissal, not inside the service', async () => {
    // The whole point of asking the director: "following the Thanksgiving
    // prayers" meant the post-communion prayers read during the veneration,
    // not the Litany of Thanksgiving inside the Liturgy.
    const r = await tyler('2026-10-04');
    const secs = r.json.blocks.map((b) => b.section);
    assert.ok(secs.lastIndexOf('Prayers of Thanksgiving') > secs.lastIndexOf('Dismissal'),
      'the section must follow the dismissal');
    assert.ok(secs.indexOf('Litany of Thanksgiving') < secs.indexOf('Prayers of Thanksgiving'),
      'it is a different thing from the Litany of Thanksgiving');
  });

  it('INV-4 the choir sings three Lord-have-mercy, not the reader saying twelve', async () => {
    const r = await tyler('2026-10-04');
    const sung = section(r).find((b) => b.id === 'pot-lhm-sung');
    assert.ok(sung, 'the sung close must be present');
    assert.equal(sung.speaker, 'choir');
    assert.equal(sung.repetitions, 3);
    assert.ok(!section(r).some((b) => b.id === 'pot-lhm-close'),
      "the book's reader-said twelve must not also render");
  });

  it('INV-5 an ordinary day closes with the troparion of the temple', async () => {
    const r = await tyler('2026-10-04');
    assert.match(closing(r).text, /Patron of the Temple/);
  });

  it('INV-6 a feast and the week after it displace the patron', async () => {
    for (const date of ['2026-08-15',   // the Dormition itself
                        '2026-08-16',   // its afterfeast
                        '2026-09-21',   // leavetaking of the Elevation
                        '2026-05-22',   // Ascension afterfeast — moveable
                        '2026-06-03']) { // Pentecost afterfeast — moveable
      const r = await tyler(date);
      const c = closing(r);
      assert.ok(c, `${date}: a closing troparion must be sung`);
      assert.ok(!/Patron of the Temple/.test(c.text),
        `${date}: the feast should displace St John, got "${c.text}"`);
    }
  });

  it('INV-7 a FOREfeast does not displace the patron', async () => {
    // "the week FOLLOWING a feast" — she did not speak to forefeasts, so they
    // are left alone rather than swept in by a wider reading.
    const r = await tyler('2026-09-13');
    assert.match(closing(r).text, /Patron of the Temple/);
  });

  it('INV-8 a LESSER feast window does not displace the patron', async () => {
    // 2026-08-30, inside the Afterfeast of the Beheading — not one of the
    // Twelve. Same line menaion-principal.js draws for "Now and ever…".
    const r = await tyler('2026-08-30');
    assert.match(closing(r).text, /Patron of the Temple/);
  });

  it('INV-9 the Trisagion and Our Father reuse the keys this service already renders', async () => {
    // One Liturgy must never carry two renderings of the Lord's Prayer.
    const r = await tyler('2026-10-04');
    const pot = section(r).find((b) => b.id === 'pot-lords-prayer');
    const main = r.json.blocks.find((b) => b.id !== 'pot-lords-prayer'
      && /Our Father, who art in heaven/i.test(b.text || ''));
    assert.ok(pot && main, 'both renderings must exist to be compared');
    assert.equal(pot.text, main.text, 'they must be the same text');
  });
});
