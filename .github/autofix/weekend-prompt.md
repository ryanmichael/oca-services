# Autonomous weekend audit-fix — CI prompt

You are running **headless in GitHub Actions**, triggered because the weekly LLM
judge flagged findings for the upcoming weekend's services (Saturday Great
Vespers + Sunday Divine Liturgy). Your job is to investigate and prepare fixes
**as a pull request for human review**. You must NOT merge anything, and you must
NOT push to `main` or `staging`.

This repository generates Orthodox liturgical service texts. **Accuracy is the
whole product.** A conservative, well-documented PR that fixes what it can safely
fix and clearly flags what it cannot is a success. Fabricating liturgical text or
guessing at a saint's propers is a failure, even if it makes the audit go green.

## Follow the project skill exactly

Read `.claude/skills/audit-driven-fix/SKILL.md` and follow its 6-step workflow.
The summary below does not replace it.

## Steps

1. **Read the judge findings.** The reports for this weekend are at
   `audit/reports/llm-judge-<SAT>-vespers.md` and
   `audit/reports/llm-judge-<SUN>-liturgy.md` (dates are in the filenames). Read
   both in full. These are your finding list.

2. **Triage first, fix second.** Route every finding into exactly one of the 4
   buckets — `data-drift` / `structural` / `source-incomplete` /
   `judge-false-positive` — BEFORE touching anything. Merge findings that share a
   root cause (the skill explains why this matters). Do not chase finding #1's
   symptom when it is a side-effect of finding #3.

3. **Branch off main, and open the DRAFT PR immediately — before any fix.**

   ```
   git checkout -b autofix/weekend-<SAT>
   git commit --allow-empty -m "autofix: weekend <SAT>–<SUN> — triage"
   git push -u origin autofix/weekend-<SAT>
   gh label create auto-fix --color 1D76DB \
     --description "Automated weekend audit-fix PR" 2>/dev/null || true
   gh pr create --draft --base main --head autofix/weekend-<SAT> --label auto-fix \
     --title "autofix: weekend <SAT>–<SUN> judge findings" \
     --body "Triage in progress — see step 6 for the final body."
   ```

   **Do this even though nothing is fixed yet.** You are running under a hard
   turn cap and you get no warning before it fires: on 2026-08-09 a run spent 61
   turns and $5 on nine findings, was cut off mid-work, and left **nothing** —
   no branch, no PR, no record of what it had already concluded. Work that only
   exists in your context is work that did not happen. Push a commit after each
   fix so the PR always reflects your progress.

4. **Apply only the safe buckets:**
   - **data-drift** → backup `storage/oca.db` to `storage/oca.db.bak.<DATE>`
     first, then write a `/tmp/*.sql` transaction and apply via the `sqlite3`
     CLI (NOT any MCP write — it does not persist). Restart the server after.
   - **structural** → code fix in `server-lib/assemble/` (+ `server-lib/sources/`
     as needed).
   - For **each** data-drift or structural fix, add its paired **closing audit
     rule** under `audit/rules/<family>-<id>.js` whose `description` cites the
     discovery date. This is mandatory — it is the discipline that makes the
     audit compound. Run the new rule across the year to see if it surfaces more
     of the same class; fix now or document + queue.
   - **source-incomplete** where you do NOT have the authoritative OCA text on
     hand → do NOT fabricate. Document the gap in the relevant rule's
     `KNOWN_SOURCE_GAPS` and call it out in the PR body.
   - **BEFORE any wording change**, read `audit/judge-known-divergences.json`.
     It lists places where our text deliberately differs from the OCA published
     reference — the parish sings "we **shall** walk in the light of Thy
     countenance" where OCA prints "will", and reads one Gospel where the order
     appoints two. A finding that matches an entry there is a
     `judge-false-positive`, full stop. **Never revert one.** These are the
     changes most likely to look like easy wins and most costly to get wrong:
     they alter what the choir sings this Sunday.
   - **judge-false-positive** → change no code. Document why in the PR, citing the
     assembler comment or OCA convention that proves the current output is
     correct. (The `includeSecondGospel`-off one-Gospel practice is a known FP
     class — do not "fix" it.)

5. **Verify green before opening the PR** (paste the raw output into the PR body):
   - `npm run drift:check`
   - `npm run audit:date -- <SAT>` and `npm run audit:date -- <SUN>`
   - `npm run test:contracts`
   If you cannot reach green, still open the PR but mark it **draft** and state
   plainly what is unresolved and why.

6. **Finalize the PR** (it already exists — you opened it in step 3). Push the
   remaining work, write the real body, and take it out of draft only if step 5
   is green:
   ```
   git push
   gh pr edit <N> --body-file /tmp/pr-body.md
   gh pr ready <N>          # ONLY if step 5 came back green
   ```
   - body must contain, in this order:
     1. A triage table: `finding → bucket → fix (or why not fixed)`.
     2. The closing audit rule(s) added.
     3. The full verification output from step 5.
     4. A literal line: **`PROMOTION IS A HUMAN DECISION — review before merging.`**

## Turn budget

You have a hard cap and no warning when it is reached — the process is killed
mid-sentence. Spend it accordingly:

- **Fix in severity order, highest first.** A weekend can carry nine findings;
  you are not expected to close all of them. Three high-severity findings fixed
  and verified, with the rest triaged in the PR body, is a good week.
- **Push after every fix.** See step 3.
- **When you judge yourself past the halfway mark**, stop starting new fixes.
  Write the body, record the untouched findings with their triage, and finish.
  An honest partial PR is the deliverable; a perfect one that never gets opened
  is not.

## Hard rules

- **PR only.** Never `git push origin main`, never `gh pr merge`, never touch
  `staging`.
- **Never** add to `knownFailures` — project policy keeps that array empty.
- **Back up `oca.db`** before any DB write; use a `/tmp/*.sql` transaction.
- **Restart the server** after editing `oca.db` or any `variable-sources/*.json`
  (JSON sources are cached at boot).
- Be conservative. When a fix needs a liturgical judgment call or a source you do
  not have, leave it for the human and document it. Under-fixing with a clear
  explanation beats over-fixing with a guess.
- Beware the two-terminal coordination note in project memory: `oca.db` may be
  owned by a parallel process. You work on a branch off `main` and open a PR — the
  human resolves any coordination at merge time. Do not attempt to reconcile it.
