# Choir asset addressing — design

**Question:** should the choir documents have a naming/storage strategy so future
services can *find* and *share* them?

**Answer: yes, and most of the scheme already exists — in the director's own
filenames.** The gap is not naming. It is that the current layout is addressed by
*provenance* (which email brought it) when lookup needs *liturgical* addressing
(which service, which hymn), and that one of those two is not a reshuffle of the
other.

Companion to `docs/choir-email-pipeline-design.md`, which covers intake.

---

## 1. What is actually on disk (surveyed 2026-10-01)

Nine packet folders plus four thematic ones, at **three different granularities**:

| Granularity | Example | Count |
|---|---|---|
| **Per-service booklet** | `Great Vespers 09.26.26.pdf` (12 pp, compiled) | 9 folders |
| **Per-hymn** | `0701-Lord I Call-1-Unmercenaries Cosmas and Damian-You appeared as spiritual rivers-OBIKHOD-Tone4.pdf` | **119** in `docs/Vespers-july` |
| **Per-standing-item** | `Lord I Call - Tone 1.pdf` … `Tone 8.pdf`; `Fixed sections Liturgy.pdf` | 8 + 1 |

The per-hymn set is the interesting one, and it is the largest.

### The director's per-hymn convention is nearly block-addressable

```
0701 - Lord I Call - 4-3 - Unmercenaries Cosmas and Damian - At first instructed by the - OBIKHOD - Tone1
 │        │           │              │                              │                      │        │
 MMDD   section    position     commemoration                    incipit            melody source  tone
```

Compare `ServiceBlock` (CLAUDE.md):

```js
{ section: "Lord, I Have Cried", type: "hymn", text: "…", tone: 1,
  source: "menaion", label: "For the Martyrs" }
```

It maps almost one-to-one. `section` → `section`, `tone` → `tone`, melody source
→ `source`, commemoration → `label`, incipit → the opening of `text`. The
`position` field (`1`, `2`, `4-3`, `6-5`, `Glory`, `GloryNow`) is the stichos
slot — and `4-3` / `6-5` encode the verse-pairing that the Herman audit tracks as
the open "LIC 3+3+4 repeat-expansion" item.

**So we should not invent a naming scheme. We should normalize the director's.**

---

## 2. Why the current layout cannot be the lookup key

`docs/choir-packets/<email-date>/pdf/<service>-<date>.pdf` is correct as an
*immutable intake record*: it preserves what arrived, when, from which message,
with hashes and revision chains. Keep it.

But nobody asks "what was in the 2026-09-24 email?" They ask "what is the music
for Sunday's Liturgy?" And four real cases cannot be expressed by a folder per
email at all:

| Case | Real example | Why the folder fails |
|---|---|---|
| **Standing item** | Byzantine *Lord Have Mercy* + Troparion to St John, "at Liturgies following the Thanksgiving prayers … unless a feast or afterfeast" | applies from a date **onward, conditionally** — not to one date |
| **Tone-bound** | `INTRO to TONE 8 packet.pdf` | applies to **every Tone 8 week**, recurring on an 8-week cycle |
| **Future event spanning emails** | Nov 8 Hierarchical Liturgy: `Hymn to Theotokos Hierarchical` + `Rising of the Sun` arrived **Sep 19**; `Soul Shall Rejoice` / `Prophets Proclaimed` arrived **Sep 26** | one service's music is **split across packets a week apart** |
| **Per-hymn** | the 119 files in `Vespers-july` | bind to a **block**, not a service |

A derived index solves all four. The folder stays the record of arrival; the index
is the thing services read.

---

## 3. Proposed: keep provenance, derive the index

### 3.1 `docs/choir-packets/index.json` — generated, never hand-edited

Rebuilt from every `manifest.json` plus the thematic folders by
`scripts/choir-index-build.js`. Five binding kinds, each earned by files that
actually exist:

```json
{
  "bindings": [
    { "kind": "service", "date": "2026-09-26", "service": "greatVespers",
      "contentDate": "2026-09-27", "role": "booklet",
      "asset": "0213a6869261", "packet": "2026-09-24" },

    { "kind": "block", "contentDate": "2026-07-01", "service": "greatVespers",
      "section": "Lord, I Have Cried", "position": "4-3", "tone": 1,
      "commemoration": "Unmercenaries Cosmas and Damian",
      "incipit": "At first instructed by the", "melody": "OBIKHOD",
      "asset": "9f1c2a7b4e55", "packet": "vespers-july" },

    { "kind": "tone", "tone": 8, "role": "intro-packet",
      "asset": "7c4d1e90ab23", "packet": "2026-09-24" },

    { "kind": "standing", "service": "liturgy", "from": "2026-09-27",
      "slot": "after-thanksgiving-prayers",
      "title": "Lord Have Mercy (Byzantine)",
      "unless": ["feast", "afterfeast"],
      "asset": "5a8e3f21c7d0", "packet": "2026-09-24" },

    { "kind": "event", "label": "Hierarchical Divine Liturgy",
      "date": "2026-11-08", "assets": ["b1…", "c2…", "d3…", "e4…"],
      "packets": ["2026-09-19", "2026-09-24"] }
  ],
  "unbound": [ { "asset": "…", "filename": "…", "packet": "…" } ]
}
```

`unbound` is the `_unclassified/` bucket promoted to a visible backlog, so
unmapped material cannot quietly rot in a folder.

### 3.2 Asset id = `sha256[0:12]`

Content-derived, so it is stable across renames, survives a re-send, dedups the
byte-identical re-downloads for free (already 4 of 18), lets one standing hymn be
referenced from many dates without copying, and is the natural key if these ever
move to an object store or a URL. **Filenames stay human-readable** — the id is
what services reference, not what humans read.

Full content-addressed blob storage (`_blobs/<ab>/<sha256>.pdf`) is the next step
and is deliberately *not* proposed yet: it costs browsability, and nothing hurts
enough to pay for it. Carrying the hash in the index now makes that migration a
one-field change later.

### 3.3 Binding a per-hymn file to a rendered block

**Bind on `(contentDate, section, position, tone, commemoration)`. Use the incipit
only to confirm, never as the primary key.** Measured on 2026-07-01 against our
Tyler render — the director's translation is not ours:

| Director's incipit | Our rendered text | Tone | Incipit |
|---|---|---|---|
| With rays of miracles | With rays of miracles * dispel every infirmity… | 1 ↔ 1 ✓ | **exact** |
| Boundless is the grace that | Boundless is the grace of the saints, which they… | 6 ↔ 6 ✓ | **near** |
| As you received grace from | Having received grace freely from Christ God… | 1 ↔ 1 ✓ | **same hymn, different translation** |
| At first instructed by the | Having first been trained well as physicians… | 1 ↔ 1 ✓ | **same hymn, different translation** |
| You appeared as spiritual rivers | *(absent — we render 3 menaion stichera, the director sings 4)* | 4 | **no counterpart** |

So: **tone matched on every pair** (a strong, cheap cross-check), position and
commemoration are reliable, and incipit matched exactly on only 2 of 5 because the
director's `yy` sources differ from our `tt` render. Any auto-binder must
normalize register before comparing incipits, and must treat a tone disagreement
as a refusal to bind rather than a warning.

The last row is a **coverage finding, not a naming problem**: the director sings a
Tone 4 sticheron at position 1 that we do not render. Worth its own look.

---

## 4. The find-and-share seams that already exist

- **Find:** `server-lib/search/service-catalog.js` is the single source for which
  services exist and when; it feeds `/api/days` and `/api/search`. A binding
  lookup belongs beside it, not in a parallel registry.
- **Serve:** `/api/choir-prep?date=` is already date-keyed and already returns
  per-service payloads. Adding `music: [...]` per service — and per block — is the
  minimal change. **It is the natural consumer.**

⚠️ `api-choir-prep.js` rebuilds its own `available` map inline instead of calling
`servicesForDay()`. That is exactly the drift `service-catalog.js` was made to
prevent; fix it when wiring music in, or the two will disagree about which
services exist.

---

## 5. Sharing has a permission gate, not just a technical one

These packets are the director's compiled booklets, containing third-party
musical settings (OBIKHOD and other arrangements). **No permission grant is on
record for them.** The confirmed grant (2026-09-20) covers the *choir-site Menaion
corpus* — Mother Raphaela's texts — which is a different body of material.

Recommended posture:

1. **Index metadata is safe to expose** — titles, tones, sections, dates. It is
   our description of what exists, not their content.
2. **The files themselves stay parish-scoped**, behind the existing parish-admin
   token, until the director is asked.
3. **Ask before anything leaves the parish.** The precedent is the Myrrh-bearers
   Phase 0 permission gate, and the director has been generous when asked.

Also practical: `docs/choir-packets/*/pdf/` is gitignored, so **production has no
copies**. Serving files in prod needs a separate decision — object store, or
parish-admin upload — and should not be assumed to follow from building the index.

---

## 6. Status

**Steps 1–3 DONE 2026-10-01.**

- `scripts/choir-index-build.js` (`npm run choir:index`, `choir:index:check`) →
  `docs/choir-packets/index.json`, tracked. `--check` fails on a stale index, so
  it can gate CI; verified by mutation.
- **All nine packet folders backfilled.** `7-6` is the Transfiguration email
  (**2026-08-02** — the folder name was simply wrong), `8-29` → 2026-08-27,
  and `9-5` + `9-7` are **two emails on the same day**, 2026-09-04.
- `Vespers-july`'s 119 per-hymn files are normalized into `block` bindings.

Index as built: **151 bindings over 155 assets** — 20 `service`, 13 `tone`
(8 per-tone LIC settings + 5 intro packets), **97 `block`**, 20 `day`,
1 `standing`, and **4 `unbound`**.

The four unbound are the right four: the two standing hymns from 09-24
(`Lord Have Mercy (Byzantine)`, `Soul Shall Rejoice/Prophets Proclaimed`) and two
**date-range** filenames — `0713 thru 19-Fathers-…` and `071419-Fathers-…`, both
for the Fathers of the First Six Ecumenical Councils. Binding a week's music to
one arbitrary day would be a guess, so the parser refuses and the index shows
them as backlog. A run reporting zero unbound would mean it had started guessing.

### Two things the backfill exposed

**A packet folder can contain our own documents.** `docs/9-7/` held a 17 MB print
of `backlog-2026-08-29-vespers-liturgy-review.pdf`, which the parser would have
filed as a Great Vespers packet (it contains both a date and the word "vespers").
`choir:fetch` now takes `--exclude <substr>`, and the manifest records what was
excluded.

**The email date is not a unique key.** On 2026-09-04 the director sent the weekly
"Blast 09.04" at 15:32 and "Feast of the Most Holy Theotokos Music" at 17:12
("I will send music later today"). A single `subject` field would have lost one, so
the manifest now carries `messages[]` and each attachment records its
`messageSubject`. The folder stays one-per-day, which is what a human expects.

**Step 4 DONE 2026-10-01** — `music` is wired into `/api/choir-prep`.

- `server-lib/search/choir-assets.js` — the lookup. `musicForService(date, key)`
  returns `{ booklet, standing, tone, day, blocks }`; `attachToBlocks()` fastens
  per-hymn sheets onto the blocks they belong to. **Metadata only**; `available`
  says whether the PDF is on this machine, and is false in production.
- `/api/choir-prep` now returns `contentDate` and `music` per service, with a
  matched sheet hanging off `block.music`.
- 15 tests in `test/choir-assets.test.js`; 213 in `npm test`, 276 contracts.

### `/api/choir-prep` was dead, and had been since the server split

Before any of this could be wired, the endpoint had to be repaired. It threw on
**every** request:

1. `PORT is not defined` — `PORT` was a module global in the pre-split
   `server.js` (it still lives at `server.js:18`) and never reached the extracted
   route. Fixed with `req.socket.localPort`, which knows the real port and stays
   correct behind a proxy, unlike `req.headers.host`.
2. `http is not defined` — same cause, one layer down.

Nothing caught this: no test, no contract, no audit rule covers `/api/choir-prep`.
It is reachable only from the choir-prep UI, so it failed silently.

### Fixing the catalog drift found a latent bug in the catalog

Replacing the inline `available` map with `servicesForDay()` changed three dates,
two of them intended:

| Date | Change | Verdict |
|---|---|---|
| 2026-09-13 | **+ allNightVigil** | the drift, fixed — a vigil date previously offered neither half |
| 2026-04-10 | **+ burialVespers** | the drift, fixed |
| 2026-05-31 | **− kneelingVespers** | a regression, and the cause was in shared code |

`daysFromPascha()` subtracted two raw timestamps, so it was sensitive to the time
of day on `cur`: `/api/days` passes midnight and got 49.0, while `/api/choir-prep`
passes noon and got 49.5, which `Math.round` takes to 50. Kneeling Vespers
disappeared for that caller alone. Both sides are now floored to UTC midnight;
`/api/days` is unchanged, verified across the Pentecost windows of 2026 and 2027.

### Two bugs in the new wiring, both caught by measuring

- **Scope leak.** The 97 per-hymn Vespers sheets share a date with that day's
  Matins and Liturgy, so all six sheets for 2026-07-01 were offered to all three
  services. Fixed by recording `scope` on a thematic folder's bindings at build
  time — a fact about the folder, not about the query — and filtering all five
  lookups through it. There is a regression test.
- **`pages` never reached the index**, so every booklet reported `null` pages.

### Attachment, measured

On 2026-07-01, **2 of 6** sheets attach, at **2/2 precision**. The two that bind
are the ones whose translation agrees; the four that do not are the same hymns in
the director's `yy` sources against our `tt` render, plus one sticheron we do not
render at all. They stay listed in `music.blocks` rather than disappearing.

Raising recall further would mean fuzzy-matching different translations, which
would point a singer at a sheet whose words are not the words in front of them.
Precision is the right trade here, and the section + tone gates carry it: a tone
disagreement refuses the binding outright.

### Choir Mode in the UI was broken too, by the same bug

`public/scripts/app.js` fetches `/api/choir-prep` and throws on any non-404
failure. The endpoint was answering **500**, so the entire Choir Mode feature was
dead in the browser — not merely the API. No test, contract or audit rule covers
it, which is why it stayed dead.

**Step 5 DONE 2026-10-01** — `/api/search` now returns a third facet, `music`.

`choirAssets.searchMusic(query)` weights fields by specificity: a commemoration
or title (10) names the piece, an incipit (6) or melody (5) narrows it, a section
(2) or filename (1) barely distinguishes anything. `"tone 8"` is read as a **tone
filter**, not as a substring — that is what a chorister means by it, and the
literal string appears in no commemoration.

**Unbound assets are searchable.** `Lord Have Mercy (Byzantine)` has no date or
service yet, and omitting it would hide the backlog rather than surface it; it
returns with `kind: "unbound"` and a note saying so. Superseded sheets never
surface.

Working queries: `Cosmas` → 6 hymn sheets · `OBIKHOD` → every sheet in that
melody · `tone 8` → the intro packet, the LIC setting, and every Tone 8 hymn ·
`With rays of miracles` → the one sheet · `Byzantine` → the unbound standing item.

### Remaining

6. **The UI does not yet show any of this.** `music` is in both API responses but
   nothing renders it. Per the mobile-branch note, **mock up the UI before
   building it** — see `project_mobile_experience_branch`.
7. `docs/11-8 Hierarchical liturgy/` still needs its email date.
8. Only then consider blob storage and any sharing beyond the parish (§5).

## 8. A correction, recorded so it is not repeated

On first seeing `missing-special: 2026-09-13 allNightVigil` beside the director's
"there will not be a gv or vigil previous to that feast", this was called a
likely **calendar-data defect of ours**. That was wrong, and routing it that way
would have changed the OCA base for every parish.

2026-09-13 is a **Sunday**, the Forefeast of the Elevation, and the Exaltation is
a **Great Feast** on the Monday. A vigil on its eve is typikon-correct, so our
calendar is right. The director's sentence describes what **Tyler will do**, not
what is appointed — a `rubric-flag` parish divergence, the lowest-blast-radius
branch, not a change to shared data.

This is exactly the distinction in `feedback_oca_audit_workflow`: "OCA says"
versus "parish does". A packet that lacks music for an appointed service is
evidence about the parish's practice before it is evidence about our calendar.

## 7. Pointers

- `docs/choir-email-pipeline-design.md` — intake, and the two filename conventions
- `server-lib/search/service-catalog.js` — the find seam
- `server-lib/routes/api-choir-prep.js` — the serve seam (and the drift)
- `docs/Vespers-july/` (119 per-hymn) · `docs/LIC/` (8 per-tone) ·
  `docs/Fixed Divine Liturgy - St John/`
- Memory: `project_myrrhbearers_intake` (permission-gate precedent),
  `project_choir_site_corpus_2026_08_29` (the confirmed grant's actual scope),
  `project_panikhida_2026_09_19` (`service-catalog.js` is the ONE source),
  `project_herman_alaska_audit_2026_08_07` (LIC repeat-expansion)
