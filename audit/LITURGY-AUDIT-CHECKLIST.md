# Liturgy Audit Checklist

Codified walkthrough for "audit the Divine Liturgy for `<date>`." Always walks the same sections in the same order so nothing gets skipped. Used by Claude on `audit Liturgy` requests; can be followed manually by a human auditor as well.

## Setup

```bash
# 1. Ensure dev server is running on :3000
node server.js &

# 2. Capture the rendered Liturgy (default = no parish; add &translation=<slug> for a parish view)
curl -s 'http://localhost:3000/api/liturgy?date=YYYY-MM-DD' > /tmp/lit.json

# 3. Get the high-level shape
jq '.tone, .season, .liturgicalLabel, [.commemorations[] | .title]' /tmp/lit.json
```

## Classify the date

Before walking sections, establish what kind of Liturgy this is:

- **Day of week** — is it a Sunday or a weekday? (Sunday has a Resurrectional layer; weekday does not.)
- **Tone** — drives Octoechos hymns + prokeimenon + alleluia.
- **Season** — `ordinaryTime`, `triodion`, `pentecostarion`, `brightWeek`, etc. Each season has substitutions.
- **Principal commemoration rank** — simple-rank vs. polyeleos+/feast.
  - Quick proxy: is there a `variable-sources/cocelebrated-overlays.json` entry for this date? If yes → polyeleos+.
  - Is there a `variable-sources/feast-canons/` file or a Great Feast? If yes → feastOnly likely.
- **Parish-specific overlays** — re-run with `?translation=<parish-slug>` and audit again.

## Section-by-section checklist

For each section, the audit asks two questions: **structural** ("does this exist + in the right place?") and **content** ("does the text match the rubric?").

### 1. Antiphons

- [ ] First Antiphon — Psalm 102 ("Bless the Lord, O my soul"), or paschal antiphon in Bright Week, or feast antiphon on a Great Feast. Parish-overlay short forms (e.g. v1+v8+v9) appear in some parishes.
- [ ] Second Antiphon — Psalm 145 ("Praise the Lord, O my soul"), or paschal / feast. OCA overlays the Sluzhebnik/Boston archaic-English form on the modern base.
- [ ] Third Antiphon (Beatitudes) — block-by-block: each Beatitude followed by Irmos/Troparion/Theotokion from the Octoechos resurrection canon (Sundays) or feast canon (Great Feasts). On principal-feast Sundays the feast canon blends in (`FEAST_BEATITUDES_OVERRIDES` append mode).

### 2. Entrance + Troparia + Kontakia

- [ ] Little Entrance rubric
- [ ] Entrance Hymn — "Come, let us worship…" + "risen from the dead" (Sunday) / "wondrous in His saints" (feast saints) / "in the prayers of the Theotokos" (Theotokian feasts) ending.
- [ ] **Troparia order** (Sundays): Resurrection → Patron of Temple (if parish overlay sets one) → Day's saint(s). Cross-check against `features/patron-of-temple.md` INV-1.
- [ ] **Kontakia shape** (Sundays): Resurrection kontakion NOT rendered (carried by Res troparion above). Glory: → principal-feast / patron / saint depending on rank. Now: → Kontakion-Theotokion "Protection of Christians…". See `features/sunday-kontakia-restructure.md` and `features/patron-of-temple.md` behavior tables.
- [ ] Weekday kontakia: no Glory/Now restructure; saint kontakion as authored.

### 3. Trisagion + Prokeimenon + Readings + Alleluia

- [ ] Trisagion — substituted with "As many as have been baptized into Christ" (Theophany, Lazarus Saturday, Holy Saturday, Pascha, Bright Week, Pentecost) or "Before Thy Cross" (Cross feasts). See `getTrisagionSubstitution`.
- [ ] Prokeimenon — tone matches Sunday tone (or feast prokeimenon). Verse matches the printed second line. On saints' Sundays (`hasCocelebratedOverlay`), a second festal prokeimenon may co-celebrate — **OPEN GAP** as of 2026-06-15 for NA Saints.
- [ ] Epistle reading — book/display matches OCA lectionary for this date. Verify Epistle pericope cross-references (e.g. 2nd Sun after Pentecost = Rom 2:10-16). Note: KJV body text (orthocal source) — translation drift to NKJV/OCA is a known deferral.
- [ ] Alleluia — tone matches; verses are the appointed Psalm verses for the day.
- [ ] Gospel reading — book/display matches OCA lectionary. Secondary Gospel hidden by default per `secondGospel` toggle.

### 4. Cherubic Hymn + Great Entrance

- [ ] Cherubic Hymn — parish-specific variant if overlay sets one (e.g. Tyler uses Tchaikovsky as active). The Cherubic is split into two parts around the Great Entrance.
- [ ] Great Entrance rubric + commemorations.

### 5. Anaphora + Kiss of Peace + Creed

- [ ] Kiss of Peace.
- [ ] Creed — overlays apply archaic-English Sluzhebnik form for OCA (not the modern base). On Tyler/HTM-style overlays may differ further.

### 6. Hymn to the Theotokos

- [ ] "It is truly meet…" on most days, or megalynarion + irmos for Great Feasts (e.g. Pascha's "The Angel cried…" + "Shine, shine…").

### 7. The Lord's Prayer + Pre-Communion + Communion Hymn

- [ ] Pre-Communion: priest's "Holy things are for the holy" + choir's "One is holy" (rubric only — full text lives elsewhere).
- [ ] **Communion Hymn (koinonikon)**: appointed verse for the day. On principal-feast Sundays a second koinonikon co-celebrates — hidden by default per `secondKoinonikon` toggle.
- [ ] After the koinonikon: cycling Troparia + Kontakia labels (reference-only). The Theotokion-Kontakion is excluded from the cycle.

### 8. Communion Prayer

- [ ] **Order**: default is `pc-draw-near → pc-blessed → pc-prayer-*`; if `confessFirst: true`, order is `pc-prayer-* → pc-draw-near → pc-blessed`. In the Paschal period (`brightWeek` or `pentecostarion` season), call/response are suppressed; only prayer renders. Cross-check `features/confess-first.md` INV-1..3.

### 9. Communion of the Faithful + Post-Communion + Dismissal

- [ ] "I have seen the true Light", "Let our mouths be filled", "Blessed be the Name."
- [ ] Hymn of Thanksgiving + Litany of Thanksgiving + Prayer behind the Ambon.
- [ ] Psalm 33 — abbreviated form should include v1–3 + v8 + v9–10 (verse 8 was restored 2026-06-14).
- [ ] Dismissal — feast-specific dismissal substitutions on Pascha, Pentecost, Theophany, Christmas, etc.

## After the walk

- Distinguish "OCA says X" vs "parish does Y" — see `feedback_oca_audit_workflow.md`. The OCA reference DOCXs live at `https://files.oca.org/service-texts/YYYY-MMDD-texts-tt.docx` and in `reference/` for downloaded ones.
- For findings, check whether they have an existing `audit/rules/` rule. If yes, run that rule; if no, consider proposing one.
- If the audit surfaces a code change, the patron-of-temple session pattern applies: fix → verify with `npm run test:contracts` → update the relevant `features/<name>.md` spec in the same commit.
- If the audit surfaces a memory-only project follow-up, note it in the relevant memory file's "follow-ups" section.

## Quick-reference commands

```bash
# Run all contract tests
npm run test:contracts

# Run audit rules against this date
node audit/index.js --date YYYY-MM-DD --http http://localhost:3000

# Run LLM-judge against OCA reference DOCX
npm run audit:judge -- YYYY-MM-DD

# Pre-print checklist for a single date (includes audit rules + provenance gaps)
npm run audit:date -- YYYY-MM-DD
```
