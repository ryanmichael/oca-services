'use strict';

/**
 * The ONE place the audit fetches assembled service output.
 *
 * ── WHY THIS MODULE EXISTS ───────────────────────────────────────────────────
 *
 * There were two copies of this fetch. On 2026-09-23 a clean 0/0/0 report was
 * printed for 9-23 Vespers with nothing checked, because no server was running;
 * the fix added an ECONNREFUSED guard — to the copy in `index.js`, which only
 * the single-date `--print` path uses. The copy inside `runner.js`'s sweep, the
 * one behind `npm run audit` and `audit:full`, kept its bare
 * `catch (_) { /* leave ctx.assembled undefined *\/ }`.
 *
 * So on 2026-10-06, a year later, this still held:
 *
 *   node audit/index.js --year 2026 --services vespers,liturgy \
 *     --http http://localhost:3999            # nothing listening
 *   -> Done. high=0 medium=0 low=0 suppressed=0      (exit 0)
 *
 * 122 of 131 rules declare `needsAssembled`, and `runner.js` skips each of them
 * with a bare `continue` when `ctx.assembled` is missing. "Everything is
 * correct" and "nothing was checked" were the same reading on the project's
 * headline surface.
 *
 * ── THE THREE OUTCOMES, KEPT DISTINCT ────────────────────────────────────────
 *
 * They were collapsed into one before, which is what made the failure invisible:
 *
 *   THROW            the server is unreachable. Not a finding — the run is
 *                    invalid, and every caller must abort rather than report.
 *   'not-served'     HTTP 404, or 200 with no blocks. A real answer: Liturgy is
 *                    not appointed on 35 dates of 2026. Rules skip, correctly.
 *   'server-error'   HTTP 5xx. The service FAILED to render this date. That is a
 *                    defect of the first order and it used to read as silence.
 */

/**
 * @returns {Promise<{ok: true, assembled: object}
 *                 | {ok: false, reason: 'not-served'|'server-error'|'no-http', status?: number}>}
 * @throws if the server cannot be reached at all.
 */
async function fetchAssembled(httpBase, service, date) {
  if (!httpBase) return { ok: false, reason: 'no-http' };

  const endpoint = service === 'vespers' ? 'service' : service;
  const url = `${httpBase}/api/${endpoint}?date=${date}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    // Transport failure. Never swallowed, never downgraded to a skip.
    throw new Error(
      `audit: cannot reach ${httpBase} — start the server (node server.js) before ` +
      `an --http/--print audit, or pass --offline to run only the rules that ` +
      `need no server. Underlying error: ${err?.message || err}`);
  }

  if (res.status >= 500) return { ok: false, reason: 'server-error', status: res.status };
  if (!res.ok)           return { ok: false, reason: 'not-served',   status: res.status };

  let assembled;
  try {
    assembled = await res.json();
  } catch (err) {
    // 200 with a body we cannot parse is a server defect, not a quiet skip.
    return { ok: false, reason: 'server-error', status: res.status };
  }
  if (!assembled || !(assembled.blocks || []).length) {
    return { ok: false, reason: 'not-served', status: res.status };
  }
  return { ok: true, assembled };
}

module.exports = { fetchAssembled };
