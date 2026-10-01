# Choir-email intake pipeline — design

Automate the weekly intake of the choir director's email: fetch it, store and
organize the attachments, extract what they say, and drive the existing review
and correction workflows.

**Scope boundary:** this pipeline ends at *review-ready*. It never edits
liturgical text. `choir-packet-review` (report-then-ask) and `choir-correction`
(dry-run, 7-branch) already own that, and they stay human-gated.

---

## 1. What the source actually looks like (researched 2026-10-01)

Sender: **Connie Russell `<cjruss63@gmail.com>`** ("Blessings, Jeff & Connie").

A second sender matters: **`stjohnoftyler@gmail.com`** ("This Week at
St. John's", the rector) is the schedule oracle — it is what says
"No Daily Vespers" or "Vigil for Nativity of the Theotokos at 6:00 PM".

### Subject lines are not a usable key

| Date | Subject |
|---|---|
| 2026-09-24 | St John Choir Blast 09.24 LONG EMAIL - PLEASE READ CAREFULLY |
| 2026-09-16 | St John Choir Email Blast Sept 16 IMPT |
| 2026-09-10 | St John Choir - Weekly Email Blast 09.10.26 |
| 2026-09-04 | St John Choir Email Blast 09.04 |
| 2026-09-04 | Feast of the Most Holy Theotokos Music |
| 2026-08-27 | St John Choir Weekly Email Blast 08.27.26 |
| 2026-08-02 | Upcoming: Feast of Transfiguration |
| 2026-08-01 | ST John Choir Weekly Blast |
| 2026-07-10 | St John Choir Blast 07.10.26 |

Match on **sender + `has:attachment`**, never on subject.

### Send day is not Thursday

Observed: Thu, Wed, Thu, Fri, Thu, Sat, Fri, plus feast one-offs on Sun/Sat.
A Thursday-only trigger misses ~45% of blasts. **Poll; do not schedule on
Thursday.**

### Attachment filename patterns (both field orders occur)

```
Great Vespers 09.26.26.pdf              # service first, MM.DD.YY
09.19.26 Great Vespers.pdf              # date first
09.14 Feastal Liturgy for the Exaltation of the Cross.pdf   # no year, typo "Feastal"
08.06 Transfiguration Liturgy.pdf
Daily Vespers 10.01.26.pdf
Divine Liturgy 09.27.26.pdf
INTRO to TONE 8 packet.pdf              # no date — carries the week's tone
Lord Have Mercy (Byzantine).pdf         # no date — standalone hymn
Soul Shall Rejoice.Prophets Proclaimed (Hierarchical Lit).pdf
```

So: a tolerant regex for `MM.DD(.YY)?` + a service-keyword table + a residual
bucket. **Never silently drop an attachment that doesn't parse.**

### The PDFs are scans

`pdftotext` returns **0 characters** on all of them (12 pages per service
packet, 8 for a tone packet, ~32 pages per week). `tesseract` is not installed,
and OCR on chant scans would be unreliable anyway. Content extraction is
therefore a **model-visual read**, not a script — exactly as
`choir-packet-review` Step 2 already documents.

### Duplicates are byte-identical

`Daily Vespers 10.01.26.pdf` and `Daily Vespers 10.01.26 (1).pdf` in
`docs/9-26 and 9-27 and 10.1/` have the same MD5. Content-hash dedup is
sufficient — **but see §5 on revisions.**

### Hard constraint: no attachment download via MCP

`mcp__claude_ai_Gmail__get_message` returns attachment *metadata* only
(`filename`, `mimeType`, `id`); there is no `get_attachment` tool. `RAW` format
would pull a 32 MB base64 blob into context — not viable. **Bytes must come
from outside the MCP.**

---

## 2. Architecture: a script for I/O, a skill for judgment

Two components, deliberately split.

### `scripts/choir-mail-fetch.js` — the only part that touches email

Deterministic, model-free, cron-able. Pluggable source:

- `--source imap` (default) — Python/Node IMAP over `imap.gmail.com`, app
  password from `.env` (`CHOIR_MAIL_USER`, `CHOIR_MAIL_APP_PASSWORD`).
  `.env` is already gitignored.
- `--source manual` — skip the network; index PDFs the user dropped into a
  folder by hand. **Built first**, so nothing downstream is blocked on
  credentials, and so the pipeline still works the week the auth breaks.

Writes a normalized folder + `manifest.json`. Idempotent: re-running fetches
nothing new and rewrites nothing.

### `.claude/skills/choir-week/SKILL.md` — `/choir-week`

Needs judgment, so it is a skill: resolve ambiguous mappings, read the scans
visually, triage the body's directives, then hand off. It **invokes**
`choir-packet-review` rather than reimplementing it.

Why split: the fetch must run unattended; the extraction cannot.

---

## 3. Storage layout

Replaces the ad-hoc, human-named folders (`9-26 and 9-27 and 10.1`,
`8-1 and 8-2`, `11-8 Hierarchical liturgy`) with one deterministic convention
keyed on the **email's sent date** — stable, one folder per blast, never
renamed when a service is added.

```
docs/choir-packets/
  2026-09-24/
    manifest.json        # tracked — the machine-readable index
    body.md              # tracked — email text + triaged directives
    review.md            # tracked — findings from the packet review
    pdf/                 # GITIGNORED (~32 MB/week, ~1.5 GB/year)
      great-vespers-2026-09-26.pdf
      divine-liturgy-2026-09-27.pdf
      daily-vespers-2026-10-01.pdf
      tone-08-intro.pdf
      _unclassified/
        Lord Have Mercy (Byzantine).pdf
        Soul Shall Rejoice.Prophets Proclaimed (Hierarchical Lit).pdf
```

Normalized names carry the resolved ISO date; the original filename is
preserved in the manifest. Existing `docs/<dates>/` folders are left in place;
`choir-packet-review`'s pointers get updated to accept both.

### `manifest.json`

```json
{
  "emailDate": "2026-09-24",
  "messageId": "1a0d4c0b67b92a71",
  "subject": "St John Choir Blast 09.24 LONG EMAIL - PLEASE READ CAREFULLY",
  "sender": "cjruss63@gmail.com",
  "fetchedAt": "2026-10-01T14:02:11Z",
  "weekTone": 8,
  "attachments": [
    {
      "original": "Great Vespers 09.26.26.pdf",
      "stored": "pdf/great-vespers-2026-09-26.pdf",
      "sha256": "…", "bytes": 6081464, "pages": 12, "hasTextLayer": false,
      "service": "vespers", "serviceLabel": "Great Vespers",
      "apiDate": "2026-09-26",
      "contentDate": "2026-09-27",
      "apiUrl": "/api/service?date=2026-09-26&service=vespers&translation=st-john-damascus-tyler",
      "confidence": "high",
      "appointedCheck": "ok"
    }
  ],
  "directives": [],
  "unresolved": []
}
```

`contentDate` vs `apiDate` is the **Vespers date-shift encoded as data.** The
review skill documents it as a trap that has already bitten; computing it in the
fetcher means the model cannot forget it.

---

## 4. Date and service resolution

| Rule | Detail |
|---|---|
| `MM.DD.YY` | direct → ISO |
| `MM.DD` (no year) | infer from the email's sent date; nearest match within ±45 days, so `10.01` on a 09-24 email → 2026-10-01 and `01.07` on a 12-28 email → next year |
| Service keyword | `Great Vespers`→vespers · `Daily Vespers`→vespers · `Divine Liturgy`/`Liturgy`/`Feastal Liturgy`→liturgy · `Vigil`→vigil · `Matins`→matins · `Presanctified`→presanctified |
| **Vespers shift** | the filename date **is** the civil evening → `apiDate` = filename date, `contentDate` = +1 day |
| Liturgy / Matins | unshifted → `apiDate` = `contentDate` = filename date |
| No date at all | → `_unclassified/`, listed in `unresolved[]` |

Verified against the real case: `Great Vespers 09.26.26.pdf` is a Saturday; its
content is Sunday 09-27. `/api/service?date=2026-09-26&service=vespers`.

### Two free cross-checks worth wiring

1. **Is the service even appointed?**
   `/api/days?from=<d>&to=<d>` — flag a packet for a day we don't serve, and a
   day we serve with no packet. Cross-reference the rector's "This Week at
   St. John's" for cancellations (`No Daily Vespers` has occurred).
2. **The tone packet is an independent tone oracle.** The director states the
   week's tone every week. Assert it against our computed tone for the Sunday —
   remembering that Saturday Great Vespers uses the tone of the week *ending*
   (CLAUDE.md). A mismatch is a real finding; this is a weekly, free check on a
   rule that has produced defects before.

---

## 5. Revisions are the dangerous case

The director **re-sends corrected sheets.** A same-filename attachment whose
sha256 differs from the stored one is a *correction*, and silently overwriting
it loses exactly the information this project most wants.

Rule: never overwrite. Store as `…-r2.pdf`, mark the prior entry
`supersededBy`, and surface it at the **top** of the report as
`REVISED — re-review required`.

---

## 6. Body-directive extraction

First-class, not an afterthought — proven by the 09-24 body, which contains
three things found in no attachment:

| Directive | Route |
|---|---|
| Byzantine *Lord Have Mercy* + Troparion to St John of Damascus at Liturgy after the Thanksgiving prayers; **"if it is a feast or afterfeast, St John gets trumped by the feast"** | `choir-correction` — patron-of-temple precedence; see `project_patron_of_temple` |
| "Sorry I never got this week's DV to you" | missing-attachment signal → expect a late follow-up |
| Hierarchical Divine Liturgy, Nov 8 | forward-dated prep (already a local folder) |

`body.md` = the raw text, then a triaged table (directive · proposed branch ·
blast radius · confidence), left for human confirmation. Directives are
**proposed, never applied.**

---

## 7. Phases

**Phase 0 — decisions. DECIDED 2026-10-01:**
- **Auth: IMAP + app password.** `.env` keys `CHOIR_MAIL_USER` /
  `CHOIR_MAIL_APP_PASSWORD`; `.env` is already gitignored. Requires 2FA on the
  account and one app password from myaccount.google.com.
- **Git: in repo, gitignored.** `docs/choir-packets/*/pdf/` ignored;
  `manifest.json`, `body.md`, `review.md` tracked. Add the ignore rule **in the
  same commit that creates the directory**, before any fetch runs — `docs/` is
  not currently ignored, so the four untracked packet folders already present
  are one `git add .` away from entering history.

**Phase 1 — fetcher + normalizer, `--source manual` only. DONE 2026-10-01.**

- `scripts/choir-mail-parse.js` — pure filename→(service, date) resolution
- `scripts/choir-mail-fetch.js` — hashing, probes, filing, manifest, revisions
  (`npm run choir:fetch -- --source manual --from <dir> --email-date <iso>`)
- `test/choir-mail-parse.test.js` — 23 tests, wired into `npm test` (186 pass)

Backfilled all five historical folders → `docs/choir-packets/{2026-07-07,
2026-08-01, 2026-09-10, 2026-09-16, 2026-09-24}`: 16 attachments filed,
13 service packets, 3 tone packets, 2 unresolved (the expected hymn sheets),
4 byte-identical re-downloads skipped. 85 MB on disk, 10 metadata files tracked.

Verified rather than assumed:

- **All 12 generated `apiUrl`s return 200 with real content** against a live
  server (173–384 blocks each).
- **The tone oracle agrees.** For the three blasts carrying a tone packet, the
  director's tone matches our computed tone for both the Saturday Great Vespers
  and the Sunday Liturgy (6/6, 7/7, 8/8). No finding — and the subtlety about
  the week *ending* resolves to the same number on these dates.
- **Revision detection**, tested with a hand-mutated re-send: both copies kept,
  `supersededBy` chained, reported first, exit code 2.
- **The suite can fail.** Mutating `DATE_SHIFTED` to unshift Great Vespers
  breaks 3 tests. An earlier draft of the contentDate test derived its
  expectation from `DATE_SHIFTED` itself and survived that mutation — the
  tautology in `feedback_assert_structure_not_labels`. It is now a hand-written
  (apiDate, contentDate) table plus an independent Saturday→Sunday weekday check.

One real bug found and fixed in the process: `readdir` sorts `" (1).pdf"`
*before* `".pdf"` (space 0x20 < dot 0x2e), so the re-download became the
canonical copy and the original was reported as the duplicate — inverted
provenance in the manifest. `canonicalOrder` now sorts un-suffixed names first,
with a regression test that asserts the naive sort is wrong.

Known gap: `docs/11-8 Hierarchical liturgy/` was **not** backfilled. Its two
files (`Hymn to Theotokos Hierarchical.pdf`, `Rising of the Sun.pdf`) are
dateless, and which blast carried them is ambiguous. `--email-date` is required
and never guessed, so this one needs the user to name the email.

**Phase 2 — IMAP fetch.** `--source imap`, app password in `.env`, dedup via
sha256, revision detection per §5.

**Phase 3 — `/choir-week` skill. DONE 2026-10-01.**

- `.claude/skills/choir-week/SKILL.md` — the orchestration: find the blast
  (sender, never subject), get bytes, ingest, cross-check, extract body
  directives, hand to `choir-packet-review`.
- `scripts/choir-week-verify.js` (`npm run choir:verify`) — the §4 cross-checks
  as code, because a deterministic check should not depend on a model
  remembering to run it. Runs as the parish by default: `/api/days` is
  parish-aware, so the OCA base answers "is this appointed?" for the wrong
  rubrics. Exit 2 on any high finding.
- `scripts/choir-packet-remap.js` (`npm run choir:remap`) — records a corrected
  date mapping with a mandatory reason, keeping the original under
  `remappedFrom`. Verify skips a remapped entry rather than re-litigating it.
- 5 more tests (28 in the file, 191 in `npm test`).

Findings across the five backfilled packets: `2026-08-01` and `2026-09-24` clean;
three `missing-weekly` (no Wednesday Daily Vespers sheet) and one
`missing-special` (the all-night vigil on 2026-09-13, eve of the Exaltation).
The `missing-weekly` findings are corroborated by the director's own words —
"Sorry I never got this week's DV to you."

### The real catch: the filename date is not always the eve

`choir-week-verify` found that **the director uses two conventions**:

- `Great Vespers 09.26.26.pdf` — the **civil evening** (Saturday, drawing on
  Sunday 09-27). This is what the parser assumed.
- `Daily Vespers 10.01.26.pdf` — the **liturgical day**. 2026-10-01 is a
  *Thursday* and the Protection of the Theotokos; the service is sung
  **Wednesday evening 09-30**, and the body said so: "DV (Wed 10.01)".

Measured, not reasoned: `/api/service?date=2026-09-30` mentions "Protection"
**4 times**; `date=2026-10-01` mentions it **0 times**. The original mapping
would have had the choir singing Hieromartyr Cyprian at the Protection. Fixed via
`choir:remap`; the reason is in the manifest.

The parser is deliberately *not* taught to guess this. `eveVerdict()` discriminates
using the parish's standing evening (Great Vespers → Saturday, Daily Vespers →
Wednesday) and returns `standing-ok` / `misread` / `ambiguous` / `single`;
`misread` is HIGH because it changes which feast is sung, while `ambiguous` asks
the human. A vigil has no standing day, so it always asks.

### A noisy check is a dead check

The first run of the coverage check enumerated everything `/api/days` serves and
produced **15 useless low findings** in one packet — we render Matins and Liturgy
on nearly every date, while the parish sings three services a week. A check that
cries wolf weekly gets ignored, which is worse than no check. It was narrowed to
the two actionable omissions: the parish's standing weekly three, and
non-ordinary services (vigil, Presanctified, Vesperal Liturgy) that never happen
without music. 15 lows → 1 true high.

**Phase 4 — polling.** Daily check that is a no-op when nothing is new
(not Thursday-keyed). Notify only on a new blast or a revision.

---

## 8. Falsification requirement

Per `feedback_verification_false_greens` and "prove the probe can SEE a thing
before reporting it missing," the parser ships only after it is run against the
**full 9-email history** and deliberately fed its known-hard cases:

- `09.14 Feastal Liturgy for the Exaltation of the Cross.pdf` — no year, misspelled
- `INTRO to TONE 8 packet.pdf` — no date, must become `weekTone`, not an unresolved service
- `Lord Have Mercy (Byzantine).pdf` — must land in `_unclassified/`, not be guessed
- a Saturday Great Vespers — must emit `contentDate` = Sunday, `apiDate` = Saturday
- a hand-mutated duplicate — must be detected as a **revision**, not deduped away

A parser that reports zero `unresolved` on this corpus is wrong, not good:
at least the two dateless hymn sheets must surface. Assert that.

---

## 9. Pointers

- `.claude/skills/choir-packet-review` — the downstream review (report-then-ask)
- `.claude/skills/choir-correction` — the 7-branch dry-run router
- `.claude/skills/audit-driven-fix` — for a confirmed defect of ours
- `scripts/audit-upcoming.js` — already computes the upcoming Sat/Sun pair
- `corrections_log.source_artifact` — should name the stored packet path
- Memory: `project_choir_corrections_log`, `feedback_oca_audit_workflow`,
  `feedback_choir_correction_noop`, `project_patron_of_temple`
