# Tech Elevator Pitch

## The basic idea

Every day of the Orthodox Church year has a unique service text — a mashup of fixed prayers, seasonally rotating hymns, and saint-specific content keyed to that exact date. Traditionally, clergy assemble these by hand from 5–10 different books. This app generates them automatically for any date, served as a webpage or API.

## The architecture in plain English

Think of it like a **recipe assembler**:

1. **The cookbook (fixed texts)** — prayers and chants that never change, stored in JSON files.
2. **The pantry (variable sources)** — the "liturgical books" digitized: the 8-week hymn cycle, the saints' calendar, the Lenten book, the Easter book.
3. **The recipe card (calendar entry)** — one file per date that says "use hymn #4 from book A, then 3 hymns from book B in tone 5, then the saint's hymn for today."
4. **The chef (assembler)** — reads the recipe, pulls from cookbook and pantry, hands back an ordered service ready to render.

On top of this sits a **translation overlay system** — sparse files that can override any text without copying the whole base. A parish in Tyler, Texas can have their own pronoun preferences, hymn variants, and rubric tweaks layered on top of the OCA standard, which itself layers on top of the base.

## What's interesting / unusual

- **It's just JSON and Node.** No CMS, no database for the content layer. Everything important is text-in-files, diffable in git.
- **The calendar is the conductor, not the assembler.** The hard logic of "what gets sung today" lives in one place; the assembler is mechanical.
- **Translation cascades like CSS.** Each overlay declares what it extends; the loader walks parent-first. You can stack OCA → parish → personal.
- **Audit-driven authoring.** ~150 automated rules check every service every day for structural drift (missing Glory-and-Now, wrong tone, duplicate hymns). The audit is a CI gate — broken services can't merge.
- **Nightly determinism + translation-matrix crons.** The server is checked every night to confirm that the same date gives the same output across reboots, and that every overlay still renders cleanly.

## Strengths

- **Transparent.** A priest can read the JSON for a date and see exactly what was decided and why.
- **Fast iteration.** Fixing a hymn = one PR, deployable in minutes. No content team, no CMS migration.
- **Composable for multiple jurisdictions.** OCA, ROCOR, Antiochian, Serbian, Georgian all share infrastructure; only the overlay files differ.
- **Hard to silently break.** Schema validation + 56 contract tests + 149 unit tests + nightly drift checks + audit gate. Most regressions get caught before they ship.

## Weaknesses

- **Authoring is still manual.** The hard work is digitizing books — transcription, tagging, translation. No AI can be trusted with liturgical text, so it's hand-keyed and audit-verified.
- **Coupling between calendar and content.** Adding a new feast type sometimes touches calendar rules, the assembler, and the data. Recently split a 2,376-line calendar file into 15 modules to ease this.
- **Single maintainer.** Bus factor of one. Documentation and contract tests are the mitigation.
- **No proper editorial workflow.** Edits go through git PRs. Fine for a developer; a barrier for a typical parish musician.

## Where it stands today

- One year of dates fully covered (2025–2029 windows for some axes).
- 0 known audit failures, 0 suppressed warnings.
- Running in production on Railway, serving real parishes.
- The 90-day technical-architecture cleanup just shipped — codebase is in the cleanest state it's been in.

The interesting bet is that **liturgical content is more like code than like content** — versioned, tested, layered, composable — and the tooling we use for software fits it better than the CMS-style tools that other prayer-text projects use.
