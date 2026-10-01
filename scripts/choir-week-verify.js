#!/usr/bin/env node
'use strict';

/**
 * CLI: cross-check a choir packet's manifest against what we actually render.
 *
 *   node scripts/choir-week-verify.js --latest
 *   node scripts/choir-week-verify.js --packet 2026-09-24 --json
 *
 * The two checks in docs/choir-email-pipeline-design.md §4, plus reachability.
 * They live in code rather than skill prose for the same reason the date-shift
 * is precomputed in the manifest: a deterministic check should not depend on a
 * model remembering to run it.
 *
 * This reports. It does not edit texts, data, or the manifest — triage and
 * fixes belong to /choir-packet-review → /choir-correction or /audit-driven-fix.
 *
 * Requires a dev server. Runs as the PARISH by default: /api/days is
 * parish-aware, so checking the OCA base would answer "is this appointed?" for
 * the wrong rubrics.
 *
 * Exit codes:  0 = no findings   2 = at least one HIGH finding   1 = usage/IO error
 */

const fs   = require('fs');
const path = require('path');

const REPO        = path.resolve(__dirname, '..');
const PACKET_ROOT = path.join(REPO, 'docs', 'choir-packets');
const DEFAULT_PARISH = 'st-john-damascus-tyler';
const DEFAULT_BASE   = 'http://localhost:3000';

/** Packet service key → the /api/days flag that should be true for it. */
const DAYS_FLAG = {
  greatVespers: 'greatVespers',
  dailyVespers: 'dailyVespers',
  allNightVigil: 'allNightVigil',
  matins: 'matins',
  liturgy: 'liturgy',
  presanctified: 'presanctified',
  vesperalLiturgy: 'vesperalLiturgy',
  bridegroomMatins: 'bridegroomMatins',
  royalHours: 'royalHours',
  lamentations: 'lamentations',
  kneelingVespers: 'kneelingVespers',
};

const VESPERS_FAMILY = ['greatVespers', 'dailyVespers', 'allNightVigil'];

/**
 * The parish's standing evening pattern: Great Vespers on Saturday, Daily
 * Vespers on Wednesday. An all-night vigil is feast-driven and has no standing
 * day, so it is deliberately absent.
 */
const STANDING_DOW = { greatVespers: 6, dailyVespers: 3 };

const dowOf  = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();
const dowStr = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString().slice(0, 3);

/**
 * Decide how to read a vespers packet's filename date, given whether the
 * previous evening also serves that service.
 *
 *   'single'      only one reading is possible — nothing to report
 *   'standing-ok' the filename date IS the standing evening — current mapping right
 *   'misread'     the PREVIOUS evening is the standing one — we are rendering the
 *                 wrong day's texts (the 2026-10-01 Protection case)
 *   'ambiguous'   both or neither match the standing day — a human must choose
 *
 * Pure, so the discriminator can be tested without a server. Without it every
 * Saturday sheet looks ambiguous (the Friday before a feast genuinely has Great
 * Vespers too), and a check that fires every week gets ignored.
 */
function eveVerdict(service, apiDate, altServed) {
  if (!VESPERS_FAMILY.includes(service)) return 'single';
  if (!altServed) return 'single';
  const standing = STANDING_DOW[service];
  if (standing === undefined) return 'ambiguous';
  const aMatches = dowOf(apiDate) === standing;
  const bMatches = dowOf(addDays(apiDate, -1)) === standing;
  if (aMatches && !bMatches) return 'standing-ok';
  if (bMatches && !aMatches) return 'misread';
  return 'ambiguous';
}

function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, parish: DEFAULT_PARISH };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if      (a === '--packet')      out.packet = argv[++i];
    else if (a === '--latest')      out.latest = true;
    else if (a === '--translation') out.parish = argv[++i];
    else if (a === '--base')        out.base   = argv[++i].replace(/\/$/, '');
    else if (a === '--json')        out.json   = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else { console.error(`unknown argument: ${a}`); process.exit(1); }
  }
  return out;
}

const USAGE = `
Usage: node scripts/choir-week-verify.js (--latest | --packet YYYY-MM-DD)

  --latest              check the most recent packet
  --packet <iso>        check one packet by its email date
  --translation <id>    parish overlay (default ${DEFAULT_PARISH})
  --base <url>          dev server (default ${DEFAULT_BASE})
  --json                machine-readable findings
`.trimStart();

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function blockCount(payload) {
  if (Array.isArray(payload)) return payload.length;
  if (Array.isArray(payload?.blocks)) return payload.blocks.length;
  // A vigil returns its halves; count whatever arrays it carries.
  if (payload && typeof payload === 'object') {
    return Object.values(payload).filter(Array.isArray).reduce((n, a) => n + a.length, 0);
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }

  if (!fs.existsSync(PACKET_ROOT)) {
    console.error(`no packets yet: ${path.relative(REPO, PACKET_ROOT)}`);
    return 1;
  }
  const packets = fs.readdirSync(PACKET_ROOT)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .filter((d) => fs.existsSync(path.join(PACKET_ROOT, d, 'manifest.json')))
    .sort();
  if (packets.length === 0) { console.error('no packets with a manifest'); return 1; }

  const name = args.latest ? packets[packets.length - 1] : args.packet;
  if (!name) { console.error(USAGE); return 1; }
  if (!packets.includes(name)) {
    console.error(`no such packet: ${name}\navailable: ${packets.join(', ')}`);
    return 1;
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(PACKET_ROOT, name, 'manifest.json'), 'utf8'));
  const services = (manifest.attachments || []).filter((a) => a.kind === 'service');

  // A superseded sheet has been replaced by a corrected re-send; check the
  // revision, not the sheet nobody will sing from.
  const live = services.filter((a) => !a.supersededBy);
  const superseded = services.filter((a) => a.supersededBy);

  try { await getJSON(`${args.base}/api/days?from=${name}&to=${name}`); }
  catch { console.error(`cannot reach a dev server at ${args.base} — start it with: node server.js`); return 1; }

  const findings = [];
  const add = (severity, check, message, detail) =>
    findings.push({ severity, check, message, ...detail });

  // ── per-packet day data, fetched once per date ─────────────────────────
  const dayCache = new Map();
  const day = async (iso) => {
    if (!dayCache.has(iso)) {
      const rows = await getJSON(
        `${args.base}/api/days?from=${iso}&to=${iso}&translation=${args.parish}`);
      dayCache.set(iso, (Array.isArray(rows) ? rows : rows.days)?.[0] || null);
    }
    return dayCache.get(iso);
  };

  const rows = [];

  for (const a of live) {
    const row = { ...a, reachable: null, blocks: null, appointed: null, serviceTone: null };

    // 1. reachability — a manifest full of broken links is a false green
    try {
      const payload = await getJSON(
        `${args.base}${a.apiPath}?date=${a.apiDate}&translation=${args.parish}`);
      row.reachable = true;
      row.blocks = blockCount(payload);
      row.serviceTone = payload?.tone ?? null;
      if (row.blocks === 0) {
        add('high', 'reachability', `${a.serviceLabel} ${a.apiDate} renders 0 blocks`,
          { attachment: a.original, apiUrl: a.apiUrl });
      }
    } catch (err) {
      row.reachable = false;
      add('high', 'reachability', `${a.serviceLabel} ${a.apiDate} failed: ${err.message}`,
        { attachment: a.original, apiUrl: a.apiUrl });
    }

    // 2. is this service even appointed on that date, for THIS parish?
    const d = await day(a.apiDate);
    row.dayLabel = d?.liturgicalLabel || d?.feast || null;
    row.dayTone  = d?.tone ?? null;
    const flag = DAYS_FLAG[a.service];
    if (d && flag) {
      row.appointed = d.services?.[flag] === true;
      if (!row.appointed) {
        // The vigil trap: a packet headed "Great Vespers" on a day we serve an
        // all-night vigil must be reviewed as /api/vigil (Vespers AND Matins).
        // This is the 2026-09-08 defect, so it is HIGH.
        if (VESPERS_FAMILY.includes(a.service) && d.services?.allNightVigil) {
          add('high', 'vigil-trap',
            `${a.apiDate} is an ALL-NIGHT VIGIL — review /api/vigil (Vespers + Matins), not ${a.apiPath} alone`,
            { attachment: a.original, apiUrl: `/api/vigil?date=${a.apiDate}` });
        } else {
          const alt = VESPERS_FAMILY.includes(a.service)
            ? VESPERS_FAMILY.filter((k) => k !== a.service && d.services?.[k])
            : [];
          if (alt.length) {
            add('medium', 'flavour-mismatch',
              `packet says ${a.serviceLabel} on ${a.apiDate}; we serve ${alt.join('/')}`,
              { attachment: a.original });
          } else {
            add('high', 'not-appointed',
              `packet has ${a.serviceLabel} for ${a.apiDate}, but we serve no ${a.service} that day`,
              { attachment: a.original });
          }
        }
      }
    }

    // 3. the director's tone, against the tone we sing
    if (manifest.weekTone && typeof manifest.weekTone === 'number' && row.serviceTone != null) {
      if (row.serviceTone !== manifest.weekTone) {
        add('high', 'tone-mismatch',
          `director's packet says tone ${manifest.weekTone}; we render tone ${row.serviceTone} for ${a.serviceLabel} ${a.apiDate}`,
          { attachment: a.original, apiUrl: a.apiUrl });
      }
    }

    rows.push(row);
  }

  // ── 4. is the filename's date the civil evening, or the liturgical day? ──
  //
  // The director uses BOTH conventions. "Great Vespers 09.26.26" is the civil
  // evening (a Saturday, drawing on Sunday). But "Daily Vespers 10.01.26" was
  // sung on WEDNESDAY 09-30 — 10.01 names the Protection of the Theotokos, the
  // liturgical day, and the body said "DV (Wed 10.01)". Read as a civil evening
  // it renders 10-02 (Hieromartyr Cyprian): the wrong service entirely.
  //
  // We cannot settle this from the filename, so we never guess. When both
  // readings are services we actually serve, report both with the feast each
  // would sing, and let a human choose.
  for (const r of rows) {
    if (!VESPERS_FAMILY.includes(r.service)) continue;
    // A remap already recorded a human's decision; don't re-litigate it.
    if (r.remappedFrom) continue;
    const altApi = addDays(r.apiDate, -1);              // filename = liturgical day
    const altDay = await day(altApi);
    const verdict = eveVerdict(r.service, r.apiDate, altDay?.services?.[DAYS_FLAG[r.service]] === true);
    if (verdict === 'single' || verdict === 'standing-ok') continue;

    const readingA = `eve ${r.apiDate} (${dowStr(r.apiDate)}) → sings ${(await day(r.contentDate))?.feast || r.contentDate}`;
    const readingB = `eve ${altApi} (${dowStr(altApi)}) → sings ${(await day(r.apiDate))?.feast || r.apiDate}`;
    r.ambiguous = { altApiDate: altApi, altContentDate: r.apiDate };

    if (verdict === 'misread') {
      // We are rendering the wrong day's content — the texts sung at the
      // service would be the wrong feast. That is a defect, not a question.
      add('high', 'eve-misread',
        `${r.original}: "${r.apiDate}" is a ${dowStr(r.apiDate)}, but ${r.serviceLabel} is sung ${dowStr(altApi)} — the filename names the LITURGICAL DAY, not the eve`,
        { attachment: r.original, readingA, readingB,
          fix: `set apiDate ${altApi}, contentDate ${r.apiDate} in the manifest` });
    } else {
      add('medium', 'eve-ambiguity',
        `${r.original}: "${r.apiDate}" could be the civil evening OR the liturgical day`,
        { attachment: r.original, readingA, readingB });
    }
  }

  // ── 5. coverage ────────────────────────────────────────────────────────
  //
  // Deliberately NOT a sweep of everything /api/days serves: we render Matins
  // and Liturgy on nearly every date, so that produced 15 useless lows on the
  // first run. A check that cries wolf weekly gets ignored, which is worse than
  // no check. Only two omissions are actionable:
  const havePacket = new Set(live.map((a) => `${a.apiDate}:${a.service}`));
  const haveService = new Set(live.map((a) => a.service));

  // (a) the parish's standing weekly three — Sat Great Vespers, Sun Liturgy,
  //     Wed Daily Vespers. The director's own 09-24 body apologised for a
  //     missing DV, so a dropped sheet is a real and recurring event.
  const DOW = { sunday: 0, wednesday: 3, saturday: 6 };
  // Strictly AFTER the send date: a blast sent on Wednesday 09-16 is not
  // expected to carry that same evening's Vespers.
  const nextDow = (fromIso, dow) => {
    const start = addDays(fromIso, 1);
    const d = new Date(`${start}T12:00:00Z`);
    return addDays(start, (dow - d.getUTCDay() + 7) % 7);
  };
  // A feast-only blast ("Upcoming: Feast of Transfiguration") is not expected to
  // carry the standing weekly services, so only apply this check to a packet
  // that actually looks like a weekly blast — one holding at least one service
  // in a standing weekly slot. Without this, the 2026-08-02 Transfiguration
  // email was told off for lacking the 08-08 Great Vespers that arrived in a
  // different email.
  const STANDING_SLOT = { greatVespers: DOW.saturday, liturgy: DOW.sunday, dailyVespers: DOW.wednesday };
  const looksWeekly = live.some(
    (a) => STANDING_SLOT[a.service] !== undefined && dowOf(a.apiDate) === STANDING_SLOT[a.service]);

  const sat = nextDow(name, DOW.saturday);
  for (const want of (looksWeekly ? [
    { service: 'greatVespers', date: sat,                 label: 'Saturday Great Vespers' },
    { service: 'liturgy',      date: addDays(sat, 1),     label: 'Sunday Divine Liturgy' },
    { service: 'dailyVespers', date: nextDow(name, DOW.wednesday), label: 'Wednesday Daily Vespers' },
  ] : [])) {
    const d = await day(want.date);
    if (!d?.services?.[DAYS_FLAG[want.service]]) continue;   // not served — nothing to expect
    if (havePacket.has(`${want.date}:${want.service}`)) continue;
    // A sheet for the right service on a neighbouring date is the ambiguity
    // above, already reported; don't double-count it as missing.
    if (haveService.has(want.service)) continue;
    add('medium', 'missing-weekly',
      `no sheet for the expected ${want.label} (${want.date})`, { date: want.date });
  }

  // (b) a non-ordinary service in the window — a vigil, a Presanctified, a
  //     Vesperal Liturgy — never happens without music, so a gap here is real.
  const SPECIAL = ['allNightVigil', 'vesperalLiturgy', 'presanctified',
                   'royalHours', 'lamentations', 'bridegroomMatins',
                   'kneelingVespers', 'burialVespers'];
  // Window = the span the packet itself covers, not from the email date: a
  // service on the evening the blast was sent was never going to be in it.
  const spanned = live.map((a) => a.apiDate).sort();
  const firstDate = spanned[0] || name;
  const lastDate  = spanned[spanned.length - 1] || name;
  for (let iso = firstDate; iso <= lastDate; iso = addDays(iso, 1)) {
    const d = await day(iso);
    if (!d) continue;
    for (const key of SPECIAL) {
      if (!d.services?.[key]) continue;
      if (havePacket.has(`${iso}:${key}`)) continue;
      add('medium', 'missing-special',
        `${iso}: we serve ${key} and there is no sheet for it`, { date: iso });
    }
  }

  for (const a of superseded) {
    add('medium', 'superseded',
      `${a.stored} was superseded by ${a.supersededBy} — review the revision`,
      { attachment: a.original });
  }
  for (const u of manifest.unresolved || []) {
    add('low', 'unresolved',
      `${u.filename} could not be mapped to a service — decide by hand`,
      { attachment: u.filename });
  }

  // ── report ───────────────────────────────────────────────────────────────
  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  if (args.json) {
    console.log(JSON.stringify({ packet: name, parish: args.parish, rows, findings }, null, 2));
  } else {
    console.log(`\nPacket ${name}   parish ${args.parish}`);
    if (manifest.weekTone) console.log(`Director's tone for the week: ${manifest.weekTone}`);
    console.log('\n  Services in this packet:');
    for (const r of rows) {
      const ok = r.reachable && r.appointed !== false ? 'ok ' : '!! ';
      console.log(`    ${ok}${r.serviceLabel.padEnd(16)} ${r.apiDate}  tone ${r.serviceTone ?? '?'}  ${r.blocks ?? '?'} blocks  ${r.dayLabel || ''}`);
      if (r.contentDate !== r.apiDate) console.log(`${' '.repeat(23)}content from ${r.contentDate}`);
    }

    const counts = { high: 0, medium: 0, low: 0 };
    for (const f of findings) counts[f.severity]++;
    console.log(`\n  Findings: ${counts.high} high / ${counts.medium} medium / ${counts.low} low`);
    for (const f of findings) {
      console.log(`    [${f.severity}] ${f.check}: ${f.message}`);
      if (f.apiUrl) console.log(`${' '.repeat(12)}→ ${f.apiUrl}`);
    }
    if (!findings.length) console.log('    none');
    console.log(`
  A clean run here means the SHAPE lines up — the right services on the right
  dates at the right tone. It says nothing about the words on the page.
  Run /choir-packet-review to compare the actual texts.
`);
  }

  return findings.some((f) => f.severity === 'high') ? 2 : 0;
}

if (require.main === module) {
  // Not process.exit(): it discards stdout still queued for a pipe, which
  // truncated --json output at 64 KB.
  main().then((code) => { process.exitCode = code; })
        .catch((err) => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { eveVerdict, STANDING_DOW, VESPERS_FAMILY, DAYS_FLAG, blockCount, parseArgs };
