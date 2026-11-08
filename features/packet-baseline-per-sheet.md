# Packet baseline — per sheet, not just per service

**Status:** shipped 2026-11-07
**Contract test:** `test/contracts/packet-baseline-per-sheet.test.js`
**Code:** `scripts/lib/packet-baseline.js`, `scripts/lib/packet-pieces.js`
**Gate:** `npm run audit:packet-diff:check` (manual — see *Not in pre-push*)

## The gap this closes

On 2026-11-07 a parishioner heard the six Menaion stichera to Michael and
Gabriel sung in wording the parish does not use. `choir-packet-diff` had
already scored that sheet —

    great-vespers-2026-11-07 — pieces 15 · located 10 · verbatim 2

— and reported nothing. Three failures compounded:

1. **A new sheet could not fail.** `audit/packet-baseline.json` held only
   per-service aggregates, so an unseen sheet landed in `better` ("new in this
   run") however badly it scored, and the next `--capture-baseline` folded 13%
   verbatim into the accepted 38%.
2. **Aggregates net out.** One sheet collapsing while another improves leaves
   the service rate unmoved, so a real regression is invisible.
3. **The sheet could not be scored at all.** The engraved-music sheets number
   stichera `(6).` where the text sheets print `6`. Only the bare form was a
   piece boundary, so all six Archangel stichera merged into ONE piece — and a
   six-hymn piece can never reach the 0.92 verbatim threshold against a single
   rendered hymn. That sheet read 2/15 verbatim no matter what we printed.

## How it works

`--capture-baseline` now writes a `_sheets` map beside the service
aggregates. `--check` compares two scopes, always both:

- **A sheet seen before** is judged against **itself** on located, in-order and
  verbatim. This is what an aggregate cannot do.
- **A NEW sheet** is judged against **the rate already accepted for its
  service**, read from the baseline rather than hand-picked. A threshold
  someone chooses is a label; a threshold read from the corpus moves with it.

A service with no baseline has nothing to be worse than, so its first sheet is
reported and cannot fail — a tool that fails on its own first observation is
measuring nothing. A baseline with no `_sheets` prints the recapture note and
keeps the old service-level behaviour exactly.

## Invariants

- **INV-1** — a NEW sheet matched worse than its service rate FAILS. (The
  2026-11-07 case, replayed from its real numbers.)
- **INV-2** — a NEW sheet at or above its service rate does not. The rule must
  not fire on every new packet; that is noise, and noise gets switched off.
- **INV-3** — one sheet collapsing is caught even when the aggregate holds
  still.
- **INV-4** — a baseline without `_sheets` cannot fail on sheets, and says how
  to arm the rule.
- **INV-5** — the service-level comparison still fails as it always did.
- **INV-6** — a freshly captured baseline verifies clean against its own run.
- **INV-7** — a parenthesised position (`(6).`, `(5).-`, `(4)`) marks a hymn
  boundary, as the bare form always has.
- **INV-8** — a bare number with trailing punctuation (`1.`, `2,`) does **not**.
  Measured, not assumed: allowing it split page footers and numbered lines in
  the Liturgy sheets and cost five sheets a located hymn. Narrowing to
  parenthesised-only left exactly one sheet changed.
- **INV-9** — ordinary hymn text never marks a boundary.

Each invariant was falsified by removing the rule it guards and confirming the
test goes red.

## Measured effect

Only `great-vespers-2026-11-07` changes, and it changes in both axes:

| | pieces | located | verbatim |
|---|---|---|---|
| before | 15 | 10 | 2 |
| after segmentation + the parish's Menaion variants | 19 | 16 | 6 |

Every other sheet in the 34-sheet corpus is byte-identical.

## Not in pre-push

`audit:packet-diff:check` needs a running server, and the pre-push hook already
has a server-vs-SQLite deadlock (`project_session_handoff_2026_11_06`). Adding
it there would trade a silent gap for a hung push. It stays a manual gate, run
when a packet lands — which is when it has something to say.
