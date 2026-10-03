# Feature: judge exit codes — no verdict is not a verdict

**Status:** shipped 2026-10-02
**Contract test:** `test/contracts/judge-exit-codes.test.js`
**Last verified:** this commit

## The incident

On 2026-10-02 the Anthropic credit balance ran out. Both weekend services
returned `API 400 ... "Your credit balance is too low to access the Anthropic
API"`. The weekly cron reported:

```
── summary ──
  vespers  2026-10-03: medium/low findings
  liturgy  2026-10-04: medium/low findings
```

…for two services it had never looked at. It opened the findings issue, fired
the auto-fix agent at report files that were never written (`No files were found
with the provided path: audit/reports/llm-judge-*`), and **finished green**.

The wasted run is not the problem. The problem is that a dead judge and a judge
with real high-severity findings were **indistinguishable from outside**.

## Cause

`llm-judge.js` exited `1` for low/medium findings *and* `1` for every failure
path. `audit-upcoming.js` mapped child exit `1` to the string
`'medium/low findings'`, and the workflow gated on `steps.judge.outcome ==
'failure'`, which collapses every non-zero exit into one bucket.

Three layers, each individually reasonable, and no layer could tell "I looked and
found something" from "I never looked".

## The contract

| Code | Meaning |
|---|---|
| 0 | clean |
| 1 | low / medium findings |
| 2 | at least one high-severity finding |
| 3 | the model answered, the answer could not be parsed |
| **4** | **no verdict — setup, API or unexpected error** |

0–3 are **verdicts**. 4 means no verdict exists, and a weekend with no verdict is
neither clean nor flagged: it is **unreviewed**. `EXIT` is exported from
`audit/llm-judge.js` so the judge, the aggregator and the test share one
definition.

`audit-upcoming.js` ranks a broken run **above** findings when aggregating,
because if one service could not be judged the others' verdicts cannot be trusted
to mean much either.

The workflow branches on a `status` output (`clean` / `findings` / `broken` /
`skipped`), never on `steps.judge.outcome`. A `broken` run posts its own issue
comment saying the weekend was not judged, and then **fails the job** — the
2026-10-02 run reported success while nothing had been judged.

## The cron judges; it does not fix (2026-10-03)

The auto-fix leg was removed. It launched Claude Code to prepare a PR whenever
the judge found something, and it was **~96% of the running cost**: a findings
weekend ran ~$5.36 (63 turns) against ~$0.23 for the judge itself — roughly
$23/month versus about $1.

It also barely ran. Missing `id-token: write` killed every scheduled attempt from
2026-07-25 to 2026-08-09; an empty credit balance killed every run from
2026-08-21 on. Across its life it produced **one** pull request, #4 on
2026-08-14, left as a draft.

Judging is what earns its keep — it says a weekend needs a look. Drafting the fix
is a decision worth making with a human in the loop, through `audit-driven-fix`
or `choir-correction`.

Removed with it: `contents: write`, `pull-requests: write`, `id-token: write` and
the `autofix` dispatch input. The workflow now needs only `contents: read` and
`issues: write`, and INV-6 pins that — reviving the agent should fail the test
first, deliberately. The task spec survives, unwired, at
`.github/autofix/weekend-prompt.md`.

## Invariants (tested)

- **INV-1** — the five codes are distinct; `DID_NOT_RUN !== FINDINGS`.
- **INV-2** — `llm-judge.js` exits 4 when it cannot produce a verdict.
- **INV-3** — `audit-upcoming.js` propagates 4 rather than collapsing to 1.
- **INV-4** — the summary a human reads at 6am never says "findings" for a
  service that was not judged.
- **INV-5** — the workflow gates on `outputs.status`, never `outcome`.
- **INV-6** — the cron runs no fix agent, and holds no write scopes.
- **INV-7** — a broken judge fails the run.

INV-2/3/4 were falsified by reverting all four no-verdict paths to `exit 1`; all
three fail, and INV-5 fails independently when the workflow is reverted.

⚠️ The first falsification attempt reverted only two of the four paths and
everything still passed — with no dev server the judge throws a connection error
and leaves through `main().catch()`, a path that was still correct. A partial
revert proves nothing; revert the whole class.

## Note for whoever reads this next

`.env` at the repo root supplies `ANTHROPIC_API_KEY` without overriding a value
already in the environment, so deleting the variable in a test does **not**
guarantee the judge stops early — it may still reach the API and fail there
instead. Both routes land on exit 4, which is why the tests assert the code
rather than the route.

## Keep in sync

- `audit/llm-judge.js` — the `EXIT` table and all four no-verdict exits
- `scripts/audit-upcoming.js` — `describe()`, `producedNoVerdict()`, aggregation
- `.github/workflows/weekly-llm-judge.yml` — the `status` output, both
  `broken` steps, and the judge-only scope
- `.github/autofix/weekend-prompt.md` — unwired; read before reviving it
- Memory: `project_autofix_cron_2026_07_25.md`
