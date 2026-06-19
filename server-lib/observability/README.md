# Observability

Production-safety layer for a single-instance Railway deploy. Three components, all opt-in via env vars; zero overhead when unconfigured.

## Sentry — error tracking

Wire by setting one env var:

```
SENTRY_DSN=https://<key>@<org>.ingest.sentry.io/<project>
```

Optional:
- `SENTRY_ENV` — defaults to `NODE_ENV` (set this on Railway to `production`)
- `SENTRY_RELEASE` — git SHA recommended; lets Sentry tie errors to deploys

What gets captured automatically:
- `uncaughtException` and `unhandledRejection` (process-level handlers in `server.js`)
- Any error thrown inside a route handler (caught in `server-lib/routes/index.js`)
- Schema-sweep failures in production (`server-lib/boot/load-fixed.js` — warn-only by policy, but Sentry receives the warning)

Sign-up: sentry.io → create project (Node) → copy DSN → set on Railway. ~2 minutes.

## Structured logs — stdout JSON

One line per event:

```json
{"ts":"2026-06-19T12:34:56.789Z","level":"info","event":"http.request","method":"GET","path":"/api/matins","status":200,"ms":42}
```

Railway captures stdout natively. To ship to Axiom / Better Stack / Datadog, point their Railway integration at this service — no code change needed; they ingest JSON-lined stdout.

Tune verbosity with `LOG_LEVEL`:
- `silent` — nothing
- `error` — only errors
- `warn` — warnings + errors
- `info` *(default)* — request log + lifecycle events
- `debug` — verbose

## Liveness — /healthz

`GET /healthz` (or `/health`) returns `{"ok":true}` 200. No boot-state dependency — answers fast.

Configure Railway's healthcheck:
1. Service → Settings → Healthcheck
2. Path: `/healthz`
3. Timeout: 10s
4. Failure threshold: 3 (= ~30s of downtime before restart)

Railway will auto-restart on consecutive failures.

## Files

| File | Purpose |
|---|---|
| `sentry.js` | `initSentry()`, `captureException()`, `captureMessage()` — no-op without DSN |
| `log.js` | JSON-line logger + `requestLogger(req, res)` middleware |
| `index.js` | Surface re-export |

## Adding a new capture site

Throwing inside a route handler is already captured. For non-route paths:

```js
const { captureException } = require('./server-lib/observability');
try { /* work */ }
catch (err) { captureException(err, { kind: 'some-context' }); }
```

For non-error warnings worth a Sentry breadcrumb:

```js
const { captureMessage } = require('./server-lib/observability');
captureMessage('something noteworthy', 'warning', { extra: 'fields' });
```

## Tested-not-tested

- ✅ No-op path verified by running with no `SENTRY_DSN`
- ✅ `/healthz` returns 200 in smoke test
- ⚠️ Live Sentry capture not tested in CI — needs a real DSN. The integration code path is exercised by setting `SENTRY_DSN` to any value (init runs; first capture may 401 against a fake DSN — Sentry SDK is fail-quiet).
