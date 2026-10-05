# Feature: Daily Octoechos parser

**Status:** parser shipped and validated 2026-10-05 — **the write into
`octoechos.json` is NOT done**, pending one decision (below)
**Contract test:** `test/contracts/daily-octoechos-parse.test.js`
**Chunk:** 4 of the OCA-standardisation plan

## Why

225 of 365 Vespers mix English translations, and st-sergius.org appears in 210
of them, because every weekday day-node of `variable-sources/octoechos.json`
carries `_source: 'stSergius'`. This is the book the parish actually sings from.

**That was established from their own documents, not asked.** The choir
director's weekday Lord-I-Call and Aposticha match this book verbatim bar one
systematic edit — `thou` → `ye` where the address is plural, which the book gets
grammatically wrong. Aposticha matched 100% on the 10-08 packet.

## Why it parses the body and ignores the page headers

The obvious approach fails. The PDF's section headers survive text extraction on
only **~48 of 190 pages** — the same ~48 under `-raw`, `-layout` and default
mode. A missed header makes a section inherit the **previous day's** context:
hymns on the wrong day with the right tone, which nothing in this repo can
detect. A first attempt built that way captured **12 of 48** nodes and was
discarded.

The body is regular where the headers are not:

- `"Lord I Call"` appears **exactly 48 times** — 8 tones × 6 weekday evenings
- in a strict **L-A-A** rhythm with the Apostikha markers
- and the nearest preceding `Tone N` line yields a clean run of **six sections
  per tone, in order, for all eight tones**

So the day comes from **position** (0–5 → sunday…friday, civil evenings) and is
then **proven**, three independent ways.

## How the day mapping is proven

**1. Themes, derived from the book's own markers** — not from Octoechos lore.
Counts across the eight tones: tuesday cross ×16, thursday cross ×16, wednesday
apostles ×15, friday martyrs ×13.

⚠️ An earlier table expected the **Forerunner** at Monday-evening Vespers,
because liturgical Tuesday is his day. **He is in Matins.** Monday evening is
repentance and the martyrs, and the wrong table discarded six good nodes. INV-6
pins this.

**2. The discriminative cross-check — the real proof.** Themes alone cannot
stand: Sunday and Monday evenings share a theme, as do Tuesday and Thursday
(both the Cross), so a swap within either pair is invisible to them.
`octoechos.json` already holds **the same hymns in the st-sergius.org
translation on the same keys**, so each of our day-nodes must match the book's
same day better than any other. **48 of 48 did.** INV-4.

**3. The parish's own sheet.** `tone1.wednesday` reproduces the apostles
stichera printed in the 2026-10-07 packet. INV-5.

## Two day conventions in one book

- **Main body** (this parser) labels by **civil evening**: "Wednesday Vespers"
  holds the apostles, who are liturgical Thursday. Matches `octoechos.json`, so
  days map across **directly**.
- **Appendix of daily theotokia** labels by **liturgical day**, printing both
  ("Thursday (Wednesday Evening)") — **offset by one**. See corrections_log #10.

## Result

47 of 48 nodes usable: 197 Lord-I-Call hymns, 196 Aposticha. The one withheld is
`tone4/sunday`, whose Apostikha marker is missing so the span overran into Matins
and parsed 15 hymns including "(After the 1st reading of the Psalter): Sessional
Hymn". It is **reported, never emitted** — INV-3.

## ⛔ THE OPEN DECISION — why nothing was written

**The hymn counts do not correspond one-to-one.**

| | ours | book |
|---|---|---|
| Lord I Call | 6 per node | 3 stichera + Theotokion (34 nodes), 5 (11), 3 (2) |
| Aposticha | 3 | 4–5 |

A weekday Lord I Call takes six stichera, normally three from the Octoechos plus
three from the Menaion. The book prints the three; our st-sergius.org data holds
six. So this is **not** a one-for-one translation swap, and choosing which hymns
survive is a liturgical decision about an appointed count — the same class as
chunk 3's 32 slot mismatches, and not one to make unilaterally.

The parser is committed because it is the expensive, validated part. The write
waits on that decision.

## Keep in sync

- `server-lib/sources/daily-octoechos-parse.js`
- `reference/books/daily-octoechos-mtmary.pdf` — gitignored, regenerable from
  `ponomar.net/data/octoechos_week_days_MtMary.pdf`
- `features/translation-mix.md` — chunk 1, which measures the effect
