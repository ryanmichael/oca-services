---
name: choir-packet-review
description: Review a choir director's service packet (the scanned PDFs in docs/<dates>/) against our rendered output for the same services, and triage every difference. Use when the user adds choir PDFs for an upcoming Vespers/Liturgy/Vigil and wants to know whether our texts are right before the service.
---

# Choir packet review

The choir director's packet is the single most valuable oracle this project has,
because it is what the parish **actually sings** — not what a book says they
should. Reviewing 9-07/9-08 against one found five real defects, **every one of
which `audit:date` passed clean at 0/0/0**. Structural rules assert shape; a
packet catches content and position.

This skill is the REVIEW. It does not apply anything:

- a defect in **our** output → hand to `audit-driven-fix`
- a deliberate **parish** divergence → hand to `choir-correction`
- an error in the **packet** → report it to the user for the director; change nothing

## Default mode: REVIEW, REPORT, THEN ASK

Produce the finding table and ask which to act on. Do not edit data or code from
inside this skill. Services are usually hours away — the user needs the findings
first and the fixes second.

## Step 1 — Establish what is being served

```bash
ls -la "docs/<folder>/"                  # what the director actually sent
python3 -c "import datetime;print(datetime.date.fromisoformat('YYYY-MM-DD').strftime('%A'))"
```

Map each PDF to a service **and an API date**, and say the mapping back before
reading anything. Two traps, both seen:

- **Vespers is date-shifted.** A Saturday-evening Great Vespers packet is
  `?date=<Saturday>&service=vespers`, but its content comes from Sunday. Matins
  and Liturgy are unshifted.
- **A vigil is ONE service.** If the day is an all-night vigil, the packet covers
  `/api/vigil?date=<eve>` — Vespers *and* Matins. Do not review only the Vespers
  half; that is the defect reported on 2026-09-08.

Check whether a vigil is appointed rather than assuming:

```bash
curl -s "http://localhost:3000/api/days?from=<d>&to=<d>" | python3 -m json.tool | grep -i vigil
```

## Step 2 — Read the packet (expect scans)

**These PDFs have no text layer.** `pdftotext` returns nothing — confirmed on
every packet so far. Read them with the Read tool, which renders pages visually.
Check first so you do not conclude a packet is empty:

```bash
pdftotext -l 2 "file.pdf" - | tr -d '[:space:]' | wc -c     # 0 ⇒ scanned
```

A weekend is typically 20-30 pages. Read them all — the sheet you skip is the one
with the correction on it.

While reading, capture for each piece: **tone**, **the opening line**, and any
**handwritten marks**. The director's pen is authoritative: a hand-corrected
"you" → "thee" on 9-08's Ode 9 confirmed our register was right.

## Step 3 — Pull our render for the same services

```bash
node server.js &
curl -s "http://localhost:3000/api/service?date=<eve>&service=vespers" -o /tmp/v.json
curl -s "http://localhost:3000/api/liturgy?date=<date>" -o /tmp/l.json
curl -s "http://localhost:3000/api/vigil?date=<eve>"   -o /tmp/g.json   # if a vigil
```

**Also pull the parish overlay** — it is what they will actually print:
`&translation=st-john-damascus-tyler`. Reviewing only the OCA base misses overlay
divergence, and was an early gap on 9-08.

## Step 4 — Compare, and get a third opinion when they disagree

Walk the packet in order and match each piece to our blocks. Compare four things,
because three of them have produced defects that shape-checks missed:

1. **Text** — wording, register (thee/thy vs you/your), punctuation.
2. **Tone** — the number. "God is the Lord" announced Tone 5 over a Tone 4
   troparion and every text-based check passed.
3. **Position** — what precedes and follows. Four Resurrection troparia once sat
   two stichoi late with correct count and correct membership.
4. **Presence** — pieces in the packet but absent from our render, and vice versa.

When packet and render disagree, consult the offline oracles BEFORE deciding who
is wrong:

- `reference/scrape/YYYY-MM-DD.docx` — OCA published service text for the date.
- `reference/orders/YYYY-MMDD-order-services.txt` — OCA order. **Sundays only.**

Extract with:
```bash
unzip -p reference/scrape/<f>.docx word/document.xml \
  | sed 's|</w:p>|\n|g' | sed 's|<[^>]*>||g' | tr -s ' ' | sed '/^ *$/d'
```

## Step 5 — Triage every difference

| Bucket | Signature | Hand to |
|---|---|---|
| **our-defect** | OCA text agrees with the packet; we differ | `audit-driven-fix` |
| **parish-practice** | Packet differs from OCA deliberately; parish sings it their way | `choir-correction` |
| **packet-issue** | The sheet itself is wrong or misfiled | the user, for the director |
| **no-op** | Packet and render already agree | note it, so the check is visible |

Seen in practice, so look for them:

- **A reused sheet.** 9-08's prokeimenon and communion pages were headed
  "Dormition — August 15". The texts happened to be right; the headers were not.
- **A sheet filed under the wrong service.** "First Kanon – Ode 9" sat in the
  Liturgy folder but is the Matins ode; at Liturgy a *different* irmos replaces
  "It is truly meet". Singing the filed one would have been wrong.
- **Translation-choice differences are NOT defects** (`will`/`shall`,
  thee/thy nuance). Present them to the user as a parish decision; never
  "correct" them unilaterally.

## Step 6 — Report

A table, most service-critical first: piece · packet · ours · bucket · what to do.
Lead with anything affecting **tonight's** service. Then state plainly what
matched — a review that only lists problems hides how much was verified.

Finish by asking which to act on. Do not start fixes from inside this skill.

## Hard rules

1. **Never author liturgical text from memory.** Cite `reference/scrape/`,
   `reference/orders/`, or the packet itself, or record a source gap.
2. **The audit passing means nothing here.** Five defects on 9-07/9-08 shipped
   green. Do not let a clean `audit:date` shorten the comparison.
3. **Prove the probe can see the thing before reporting it missing.** A
   `find | head -1` once grabbed the wrong saint's chapter on a two-commemoration
   day. Check which file, and which commemoration, you are actually reading.
4. **Parish practice beats the book.** When the user says "we do X", that is
   authoritative; route it to `choir-correction`, do not argue it against OCA.
5. **Read every page**, including the tone-intro packet — it carries the week's
   tone and occasionally a correction.

## Pointers

- `docs/<dates>/` — the packets, one folder per weekend, usually untracked.
- `.claude/skills/choir-correction` — applying a confirmed parish divergence.
- `.claude/skills/audit-driven-fix` — fixing a confirmed defect of ours.
- `corrections_log` table — `source_artifact` should name the packet PDF.
- Memory: `feedback_oca_audit_workflow` ("OCA says" vs "parish does"),
  `feedback_assert_structure_not_labels`, `project_choir_corrections_log`.
