# Feature: parish practice layer

## Purpose

Lets a parish declare **which units of a canonical text are actually sung**,
without altering the text itself.

The translation cascade governs *what the words are*. This governs *what is
used*. Keeping them apart matters because they scale differently:

| | Mechanism | Cost of one addition |
|---|---|---|
| **Text** (wording) | variant library + overlay cascade | **zero code** — no variant id appears anywhere in `server-lib/` |
| **Shape** (what's sung, how often, in what order) | one bespoke rubric | **1–3 hand-written code branches** |

Eleven of the twelve entries in `data/rubric-registry.json` are shape, not text.
So the mechanism that scales cleanly governs the smaller problem. This layer is
the first step at closing that gap.

## Scope — deliberately narrow

Only `select` (with an optional `reprise` tail) is implemented, because that is
what an actual parish needed. The remaining operations sketched during design —
`count`, `repeat`, `move`, `speaker`, `pick` — slot in behind the same
addressing and the same validator when a second need appears. **Do not build
them speculatively.**

The existing rubric booleans are left alone. They work, and the `namespace`
indirection in the rubric registry is a clean seam to re-express them later if
it ever pays. Churning working code for symmetry is not a reason.

**Operations are data, not a language.** No conditionals, no expressions. A
practice needing logic is a rubric with code, not an entry here.

## Addressing

Canonical verse arrays already carry sub-verse structure: `\n` separates
stichoi — the `*` breath marks of the printed psalter, documented in the
`_note` of each antiphon key. An address is `"<verse>.<stichos>"`, both 1-based.

```
1.1  Bless the Lord, O my soul; blessed art Thou, O Lord.
1.2  Bless the Lord, O my soul, and all that is within me bless His holy name.
2.1  Who is gracious unto all thine iniquities, Who healeth all thine infirmities,
```

This granularity is what makes selection viable. Every cut in the Tyler choir
book lands on an existing stichos boundary — including the First Antiphon's
closing line, which turned out to be **stichos 1.1 sung again**, not a truncated
verse 9.

## Where it lives and when it runs

- **Spec:** `parish_settings.rubrics_extra_json` → `practice[]`, alongside
  `principalOverrides` and `antiphonSet`. Merged into overlay rubrics by
  `buildRubrics`.
- **Engine:** `server-lib/practice/index.js`.
- **Applied:** in `server-lib/routes/api-liturgy.js`, after the translation
  cascade resolves the words and before assembly — so a selection always applies
  to whatever text the parish's overlay chain produced.

## Entry shape

```json
{
  "service": "liturgy",
  "target": "typical-antiphon-1.verses",
  "op": "select",
  "units": "stichoi",
  "keep": ["1.1", "1.2", "1.3", "2.1", "2.2", "4.1"],
  "reprise": ["1.1"],
  "fingerprint": "1b43a6ce",
  "_provenance": { "confirmedBy": "...", "date": "...", "source": "...", "note": "..." }
}
```

`select` preserves the original verse grouping (so refrain placement is
unchanged), drops verses left with no surviving stichoi, and appends each
`reprise` address as its own trailing unit.

## The two properties that matter

**1. A selection can never delete canon.** It names units to keep; the canonical
array is untouched and one settings change away. This closes the `c95da45` class
structurally rather than by tripwire.

**2. It stores intent, not output.** "Tyler omits 2.3, verse 3, and 4.2" is
auditable. A replacement array is indistinguishable from a transcription gap six
months later — which is exactly why that bug survived from June to July.

## Failure behaviour: fail toward MORE text

On any problem the offending entry is **skipped entirely** and the canonical
text renders unchanged. Too much text is a visible, self-correcting error; too
little is the silent one that took six weeks to notice. A partially-applied
selection is never emitted.

## Invariants (tested)

`test/contracts/practice-layer.test.js`

- **INV-1** — Tyler renders 4 and 5 sung units; the First Antiphon closes with
  the reprise of 1.1; every omitted stichos is absent.
- **INV-2** — A parish with no practice entries is untouched (10 and 8 verses).
- **INV-3** — **Canon survives.** Requesting Tyler first and `oca` second must
  still yield 10 verses; catches a transform that mutated the shared cached tree.
- **INV-4** — `select` preserves grouping, drops emptied verses, appends reprise.
- **INV-5** — **An unresolvable address fails toward more text**, never a partial cut.
- **INV-6** — `applyPractice` never mutates its input.
- **INV-7** — A stale fingerprint warns but still applies; addresses are the real gate.
- **INV-8** — Entries are scoped by service; unknown ops are ignored with a warning.

## Drift guard

`validateParishPractice` in `server-lib/overlays/drift.js`, run by
`npm run drift:check`. Fails on:

- **Unresolvable address** — the canonical text changed shape; the selection
  must be re-derived, never silently re-pointed.
- **Fingerprint mismatch** — the source was re-worded or re-split. The selection
  may still be right, but a human must re-read it against the parish source
  before it is trusted.
- **Malformed `rubrics_extra_json`** — `buildRubrics` parses it in a bare
  try/catch and silently drops **all** extra rubrics on failure. Found the hard
  way: a sqlite `readfile()` write stored the column as a BLOB and disabled
  `principalOverrides`, `antiphonSet` and `practice` at once, with no error
  anywhere. Always write that column with `CAST(readfile(...) AS TEXT)`.

All three verified by deliberately breaking each and confirming `drift:check`
goes red.

Note: the CLI registers the liturgy base and loads parish overlays so it
validates the same cascade the server serves. A side effect is that the parish
overlay's pre-existing `warnUnknownKeys` notices (e.g. `trisagion.variants`) now
also print during `drift:check`. They are informational and do not fail it.

## Keep in sync

- `server-lib/practice/index.js` — ops, addressing, failure behaviour
- `server-lib/routes/api-liturgy.js` — the call site
- `validateParishPractice` in `server-lib/overlays/drift.js`
- `parish_settings.rubrics_extra_json` for any parish with `practice[]`
- The `fingerprint` on every entry, whenever a targeted canonical array changes

## Open

- **Liturgy only.** Vespers and Matins have no call site yet; add one the same
  way when a parish needs it.
- **Not exposed in parish self-service.** Entries are authored directly in the
  DB. A UI needs an address picker, since raw `"2.1"` addresses are not something
  to hand to a choir director.
- **Whether other Diocese of the South parishes share Tyler's cut** is unknown.
  If they do, the entries want promoting to a shared preset rather than being
  copied per parish.
