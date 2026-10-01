---
name: choir-week
description: Pull the choir director's weekly blast, file and organize its attachments, cross-check the mapping against what we render, and extract the rubric directives from the email body — then hand off to choir-packet-review. Use when the user wants this week's choir email processed, or asks what the director sent.
---

# Choir week — intake

The director's weekly blast is the intake end of the most valuable oracle this
project has. This skill gets it onto disk, correctly mapped, with the body's
instructions captured — and then **stops**.

**Boundary.** This skill never edits liturgical text, data, or code. It ends at
review-ready and hands to:

- `choir-packet-review` — compare the texts (report-then-ask)
- `choir-correction` — apply a confirmed parish divergence (dry-run, 7 branches)
- `audit-driven-fix` — fix a confirmed defect of ours

See `docs/choir-email-pipeline-design.md` for why each piece is shaped this way.

---

## Step 1 — Find the blast

Sender: **Connie Russell `<cjruss63@gmail.com>`** (signs "Jeff & Connie").

```
mcp__claude_ai_Gmail__search_threads  query: from:cjruss63@gmail.com has:attachment newer_than:14d
```

Two things that look obvious and are wrong:

- **Never match on the subject.** Nine consecutive blasts had nine subject
  shapes: "St John Choir Blast 09.24 LONG EMAIL", "…Email Blast Sept 16 IMPT",
  "ST John Choir Weekly Blast", "Upcoming: Feast of Transfiguration". Match on
  the sender.
- **It is not reliably Thursday.** Observed send days: Thu, Wed, Thu, Fri, Thu,
  Sat, Fri — plus off-cycle feast emails. If the user says "this week's email"
  and nothing arrived Thursday, look at the whole week before concluding none
  came.

Then read the body — you need it in Step 5 regardless:

```
mcp__claude_ai_Gmail__get_message  messageId: <id>  messageFormat: PLAIN_TEXT
```

Also worth a look: `from:stjohnoftyler@gmail.com subject:"This Week"` — the
rector's schedule email is what says "No Daily Vespers" or announces a vigil, and
it settles which services actually happen.

## Step 2 — Get the bytes

**The Gmail MCP cannot download attachments.** `get_message` returns only
`{filename, mimeType, id}` — there is no attachment tool, and `RAW` would pull a
32 MB base64 blob into context. Do not spend turns trying.

So: ask the user to drop the attachments into a folder (Gmail's "Download all
attachments" gives one zip), and take the path. Once Phase 2 lands,
`--source imap` does this unattended; everything below is identical either way.

## Step 3 — Ingest

```bash
npm run choir:fetch -- --source manual \
  --from "<drop folder>" --email-date <the date the email was SENT> \
  --subject "<subject>" --body <body.txt>
```

`--email-date` is required and never guessed: it names the packet folder and
resolves year-less filenames like `09.14 Feastal Liturgy…`. Use `--dry-run`
first to see the classification before anything is copied.

Read the output rather than skimming it:

- **`UNRESOLVED`** — filed under `pdf/_unclassified/`. Expected for standalone
  hymn sheets ("Lord Have Mercy (Byzantine)"), but **look at every one**; a
  service sheet landing here means the filename broke the parser.
- **`REVISED`** — the director re-sent a corrected sheet. Both copies are kept
  and the old one gets `supersededBy`. **Review the revision, never the sheet
  it replaced.** Exit code 2 means this happened.
- **`Already held`** — byte-identical re-download, skipped. Normal.

## Step 3b — Read the OCR sidecar before opening any scan

`choir:fetch` now OCRs every page into `docs/choir-packets/<date>/ocr/<sheet>.txt`
(macOS Vision; `--no-ocr` skips it, `npm run choir:ocr` backfills older packets).
Each page is marked `[text]`, `[music]` or `[blank]`.

**Grep the sidecar first.** On the typed pages the OCR is near-perfect — it
reproduces the director's own "VESPRERS" typo and the `//` phrase marks — and
those are the pages carrying the day's variable propers. A packet that used to
need 41 visual page-reads can often be checked with a few greps:

```bash
grep -n "TONE\|Tone" docs/choir-packets/<date>/ocr/*.txt    # the tones claimed
sed -n '/\[text\]/,/^--- page/p' docs/choir-packets/<date>/ocr/<sheet>.txt
```

On `[music]` pages it is only partial: lyrics come back syllable-hyphenated and
mixed with noise read off the staves ("551 ald 88 a les"). Those pages carry
settings of fixed hymns we already hold, so that is usually fine — but when a
music page is the only source for a text, **read it with the Read tool**, not
from the sidecar.

**The sidecar is an INDEX, never a source.** Nothing in it may be authored into
`fixed-texts/` or the DB. A mis-read word in a sticheron is worse than no word.
Use it to find and compare; quote the scan itself when it matters.

## Step 4 — Cross-check the mapping, before reading a single page

```bash
node server.js &                      # the check needs a live server
node scripts/choir-week-verify.js --latest
```

It runs as the parish (`st-john-damascus-tyler`) by default, because `/api/days`
is parish-aware and the OCA base answers "is this appointed?" for the wrong
rubrics. Exit 2 = at least one high finding.

| Finding | Meaning | Do |
|---|---|---|
| **`eve-misread`** | the filename names the **liturgical day**, not the eve — we would render the wrong day's texts | confirm against the body's weekday, then `choir-packet-remap.js` |
| `eve-ambiguity` | both readings are plausible and neither is the standing weekday | resolve from the body; remap if needed |
| `vigil-trap` | the day is an all-night vigil — Vespers **and** Matins | review `/api/vigil`, not `/api/service` alone |
| `not-appointed` | we serve no such service that day | our calendar or the packet is wrong — investigate, don't assume |
| `flavour-mismatch` | packet says Great, we say Daily (or vice versa) | real finding |
| `tone-mismatch` | the director's tone packet disagrees with our computed tone | real finding; the tone packet is an independent oracle |
| `missing-weekly` | no sheet for the standing Sat Vespers / Sun Liturgy / Wed Vespers | often genuine — the director has apologised for a dropped DV |
| `missing-special` | a vigil/Presanctified/Vesperal Liturgy with no music | real gap |
| `superseded` / `unresolved` | see Step 3 | |

### `eve-misread` is the one that bites

The director uses **both** filename conventions:

- `Great Vespers 09.26.26.pdf` — the **civil evening** (a Saturday, drawing on
  Sunday 09-27).
- `Daily Vespers 10.01.26.pdf` — the **liturgical day**. 2026-10-01 is a
  *Thursday* and the Protection of the Theotokos; the service was sung
  **Wednesday evening 09-30**, and the body said so ("DV (Wed 10.01)").

Read as a civil evening it rendered 10-02 — Hieromartyr Cyprian, with **zero**
mentions of the Protection. The whole service would have been wrong. Fix it with
the reason recorded:

```bash
node scripts/choir-packet-remap.js --packet 2026-09-24 \
  --attachment "Daily Vespers 10.01.26.pdf" --api-date 2026-09-30 \
  --reason "body says 'DV (Wed 10.01)'; 10-01 is a Thursday and the Protection"
```

`contentDate` is recomputed from the service's shift rule. Re-run the verify
until the mapping is clean, then stop the server (SQLite lock).

## Step 5 — Extract the body's directives

**The body carries rubrics that appear in no attachment.** This is not optional
polish; it is where the 2026-09-24 blast introduced the Byzantine *Lord Have
Mercy* with the Troparion to St John of Damascus after the Thanksgiving prayers,
"if it is a feast or afterfeast, St John gets trumped by the feast" — a
patron-of-temple precedence rule found nowhere in the PDFs.

Fill in `docs/choir-packets/<date>/body.md`: the email text, then one row per
instruction that affects what we render.

| Directive | Proposed branch | Blast radius | Confidence | Status |
|---|---|---|---|---|
| Byzantine Lord Have Mercy + Troparion to St John after Thanksgiving prayers, trumped by a feast | rubric-flag or text-overlay | Tyler only | high | proposed |

Rules:

- **Proposed, never applied.** Routing and application belong to
  `/choir-correction`, which has its own dry-run contract.
- Read the whole body. It also carries apologies that are signals ("Sorry I never
  got this week's DV to you" = expect a late follow-up), and forward-dated prep
  (the Nov 8 Hierarchical Liturgy).
- Quote the director's words in the row. Do not paraphrase a rubric.

## Step 5b — Rebuild the asset index

```bash
npm run choir:index          # rebuild docs/choir-packets/index.json
npm run choir:index:check    # CI-style: fails if stale
```

The index is what makes the new material *findable*: `/api/choir-prep?date=`
returns `music` per service (booklet, standing items, tone packets, per-hymn
sheets) with matched sheets attached to individual blocks, and `/api/search?q=`
returns a `music` facet. Anything the index could not bind lands in `unbound` —
still searchable, so it reads as a backlog rather than disappearing.

Metadata only. The scans are the director's compiled booklets containing
third-party settings, **no redistribution permission is on record**, and
`available` reports merely whether the file is on this machine. See
`docs/choir-asset-addressing-design.md` §5 before exposing anything.

## Step 6 — Hand off

Invoke `choir-packet-review` with the packet folder. It owns the text comparison
and its own report-then-ask contract. Tell it the manifest already resolves each
sheet to a service, an `apiDate`, a `contentDate` and an `apiUrl`, so it can skip
rediscovering the mapping.

Then report to the user, highest-stakes first: anything affecting the **next
service**, then the verify findings, then what matched.

## Hard rules

1. **A clean verify means the shape is right, not the words.** It checks
   service, date, tone and reachability. Five defects on 9-07/9-08 shipped with
   `audit:date` at 0/0/0. Never let a green verify shorten Step 6.
2. **Never guess `--email-date`,** and never guess a date mapping. The parser
   surfaces ambiguity precisely so it is not resolved by inference; resolve it
   from the body or ask.
3. **These PDFs are scans** — 0 text characters, confirmed on every packet.
   `pdftotext` returns nothing and there is no OCR installed. Read pages with the
   Read tool, which renders them visually. A weekend is 20–35 pages; read them
   all.
4. **The director's pen is authoritative.** A handwritten correction on a sheet
   outranks the printed text on it.
5. **Parish practice beats the book.** "We do X" routes to `choir-correction`;
   do not argue it against OCA.
6. **Stop the dev server when done** — it holds a SQLite lock that stalls a push.

## Pointers

- `docs/choir-email-pipeline-design.md` — the design, the researched source
  behaviour, and the phase status
- `scripts/choir-mail-parse.js` / `choir-mail-fetch.js` / `choir-week-verify.js`
  / `choir-packet-remap.js`
- `test/choir-mail-parse.test.js` — the parser's falsification corpus; add a case
  here whenever a new filename shape appears
- `.claude/skills/choir-packet-review`, `choir-correction`, `audit-driven-fix`
- Memory: `project_choir_corrections_log`, `feedback_oca_audit_workflow`,
  `feedback_assert_structure_not_labels`, `feedback_verification_false_greens`,
  `project_patron_of_temple`
