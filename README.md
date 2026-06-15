# Orthodox Daily Services

**The daily service-text platform for every Orthodox parish in America — in your jurisdiction's voice, your parish's translation, your choir's view.**

Production: [oca-services-production.up.railway.app](https://oca-services-production.up.railway.app/)

---

## What this is

A service like Great Vespers is not a static document. It is the **output of an assembly algorithm** that draws together fixed prayers, calendar-driven hymns from the Octoechos, Menaion, Triodion, and Pentecostarion, the appointed psalmody, and the parish's chosen translation tradition — and orders them according to centuries-old rubrics.

This project models that process as code, and exposes it as a free, modern, parish-customizable web app that serves clergy preparing services, choirs preparing music, laity following along, and catechumens learning the shape of Orthodox prayer.

It is rooted in the Orthodox Church in America (OCA) and is being expanded jurisdiction by jurisdiction toward serving every canonical Orthodox parish in the United States.

New here? Start at [`HANDOFF.md`](./HANDOFF.md) — the cold-reader onboarding doc that frames what's load-bearing.

For the strategic frame and roadmap: see [`ASSESSMENT.md`](./ASSESSMENT.md). For the design philosophy: see [`STYLE.md`](./STYLE.md). For implementation conventions and the liturgical glossary: see [`CLAUDE.md`](./CLAUDE.md). For the feature catalog with contract specs and regression tests: see [`FEATURES.md`](./FEATURES.md).

---

## What it does today

### Services assembled

| Service | Endpoint | Status |
|---|---|---|
| Great Vespers / Daily Vespers | `/api/service` | Production |
| Matins | `/api/matins` | Production |
| Divine Liturgy | `/api/liturgy` | Production |
| Presanctified Liturgy | `/api/presanctified` | Production |
| Vesperal Liturgy of St. Basil | `/api/vesperal-liturgy` | Production |
| Bridegroom Matins | `/api/bridegroom-matins` | Production |
| Twelve Passion Gospels | `/api/passion-gospels` | Production |
| Royal Hours | `/api/royal-hours` | Production |
| Lamentations | `/api/lamentations` | Production |
| Paschal Matins | `/api/paschal-matins` (via service) | Production |
| Paschal Hours | `/api/paschal-hours` | Production |
| Pascha Collection | `/api/pascha-collection` | Production |
| Kneeling Vespers of Pentecost | `/api/kneeling-vespers` | Production |

### Modes

- **Default reading view** — laity-facing service text, full rubrics, parchment palette
- **Choir Director Mode** — `/api/choir-prep`, hymns-only filter, multi-service prep for the coming week
- **Education Mode** — inline catechetical commentary on each block; patristic and rubrical context

### Translation cascade

Eight live overlay traditions and parish customizations, each layered manifest-first via `extends` chains over the OCA base:

- `oca-tt` — OCA "thee/thou" base
- `oca-modern` — OCA modern-English
- `hapgood` — Service Book of the Holy Orthodox-Catholic Apostolic Church (Hapgood)
- `htm-boston` — Holy Transfiguration Monastery, Boston
- `jordanville` — Holy Trinity Publications (Jordanville)
- `antiochian-aocana` — Antiochian Archdiocese
- `sts-sluzhebnik` — St. Tikhon's Sluzhebnik
- `st-john-damascus-tyler` — Parish overlay extending sts-sluzhebnik

Allowed jurisdiction tags are enumerated for all eight canonical traditions: `oca, rocor, antiochian, goa, serbian, romanian, bulgarian, georgian`. See [`fixed-texts/translations/README.md`](./fixed-texts/translations/README.md) for the manifest schema and cascade rules.

### Data coverage

- 205 hand-authored Menaion entries
- Complete Octoechos (all eight tones)
- Full Triodion (Lenten and Pre-Lenten propers)
- Pentecostarion (Paschal cycle through Pentecost)
- Calendar generation by date for the full liturgical year (OCA New Style)

---

## The data architecture

Three layers plus a conductor:

```
service-structure/        ← the skeleton: ordered sections + assembly logic
fixed-texts/              ← invariable prayers, psalms, litanies
  translations/           ← sparse overlays per tradition / parish
variable-sources/         ← the "books": Octoechos, Menaion, Triodion, Pentecostarion
  calendar/               ← per-date conductor entries (mostly runtime-generated)
```

The **calendar entry** for a given date specifies the season, weekly tone, all commemorations with rank, and for each service section: which source(s) to draw from, how many stichera, in what order, with which tone.

The **assembler** (`assembler.js`) takes `(calendarDay, fixedTexts, sources)` and returns an ordered array of `ServiceBlock` objects suitable for rendering.

```js
{
  id:      "lic-hymn-v6",
  section: "Lord, I Have Cried",
  type:    "hymn",                 // rubric | prayer | hymn | verse | response | doxology
  speaker: "choir",                // priest | deacon | reader | choir | all | null
  text:    "The passion-bearers…",
  tone:    5,
  source:  "triodion",             // optional
  label:   "For the Martyrs"       // optional
}
```

---

## Quickstart

```bash
# First-time setup (one command, points git at the versioned hooks dir)
npm run setup-hooks

node server.js                          # HTTP server on :3000
node server.js --port 8080              # alternate port

# Test + audit suite
npm test                                # backend smoke tests
npm run test:contracts                  # per-feature contract tests (see FEATURES.md)
npm run audit:quick                     # structural rules (no server), pre-push gate
npm run audit                           # ~208 representative dates against running server
npm run audit:full                      # full 365-day sweep
npm run audit:date -- 2026-06-07        # single date, pre-print checklist
npm run audit:judge -- 2026-05-24       # LLM-as-judge vs OCA reference DOCX
```

Requirements: Node ≥ 24 (uses `node:sqlite` unflagged — added in 22.5 behind `--experimental-sqlite`, flag lifted in 24). The only npm dependency is `@anthropic-ai/sdk`, required by `audit:judge`.

---

## Audit + quality

Structural correctness is enforced by a six-family rule auditor (`audit/rules/A`–`F`: calendar geometry, service availability, substitution flags, variant tables, provenance, theme/keyword) plus a Claude-based LLM judge that diffs the assembled output against the canonical OCA reference DOCX for the date. The pre-push hook runs `audit:quick`. See [`audit/README.md`](./audit/README.md).

---

## Contributing

The fastest path to contribution is a **translation overlay or parish customization**:

1. Create `fixed-texts/translations/<your-id>/`
2. Add `manifest.json` declaring `name`, `kind` (`tradition` | `parish` | `jurisdiction`), `jurisdiction`, and optional `extends` parent overlays
3. Add `<service>-fixed.json` files with only the keys you want to override
4. Restart the server (or `curl /api/translations` to verify the manifest)

Full guide and conventions: [`fixed-texts/translations/README.md`](./fixed-texts/translations/README.md).

For new jurisdictions, calendar variants, or service-structure additions, open an issue first — those touch `calendar-rules.js` and `assembler.js` and need coordination.

### Schema — the public data contract

Formal JSON Schema (draft 2020-12) definitions for the project's core data shapes live in [`schema/`](./schema/):

- [`schema/service-block.schema.json`](./schema/service-block.schema.json) — the assembler's output shape
- [`schema/calendar-entry.schema.json`](./schema/calendar-entry.schema.json) — the per-date conductor object
- [`schema/overlay-manifest.schema.json`](./schema/overlay-manifest.schema.json) — the translation / parish overlay manifest

External tooling can `$ref` these by their `$id` GitHub-raw URLs. See [`schema/README.md`](./schema/README.md) for strictness conventions, versioning policy, and how the schemas relate to the runtime validators (`server.js#validateManifest`, `data-validators.js`).

---

## Strategic frame

This project is being built with a startup-discipline posture (growth thinking, product-market-fit rigor, modern UX) toward a free, durable, cross-jurisdictional public good — not a monetized product. The four-lens strategic assessment, including the 90-day plan and biggest-opportunity claim, lives at [`ASSESSMENT.md`](./ASSESSMENT.md).

The design philosophy is canonicalized at [`STYLE.md`](./STYLE.md). It should be read before any visual contribution.

---

## License

MIT. Provenance for variable texts is attributed at the overlay level (`manifest.sources`). Some traditions reserve attribution requirements — consult the relevant overlay's manifest before redistributing.
