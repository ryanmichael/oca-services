# ocanwa parish-selection baseline

Filename manifests from the ocanwa.org "Daily Sheet Music (by Month)" Vespers
folders — the parish's actual sung propers. Each PDF is named:

```
MMDD-<Section>-<Slot>-<Saint>-<Incipit>-OBIKHOD-Tone<N>.pdf
```

The hymn **text** is music notation (neumes) and NOT usefully extractable — so
we do **not** scrape it (that was evaluated 2026-07-07 and rejected: it's lossy,
coverage is partial, and we already have cleaner hymn text from the OCA DOCX
corpus). What the **filenames** give us for free is an authoritative baseline for
*selection and ordering*: which saint the parish sings, how many stichera, in
which tones, and who gets the Glory (doxastikon). That is exactly the class of
bug the assembler drifts on (wrong principal, wrong sticheron count, wrong
Glory, mis-filed Theotokia — e.g. the Jul 12 / Jul 23 icon-bleed fixed in
`9c92604`).

## Files

- `<MM>-vespers.txt` — one filename per line for that month's Vespers folder.

## Auditing against our system

```bash
node server.js &                       # /api/service must be up
npm run audit:parish-baseline          # all months, human table
npm run audit:parish-baseline -- --month 09
```

For each date, the parish's principal is whoever gets the **LIC Glory**
(doxastikon). A **deterministic resolver** matches that saint against *that
date's own commemoration set* from `/api/service` (≈10 candidates — so an
incidental shared token can't cross-match an unrelated saint on another day),
and classifies:

- **ok** — parish principal is our principal (`commemorations[0]`).
- **RANK→#N** — the parish's saint *is* one of our commemorations, but ranked
  #N, not principal. The crisp picker/rank-bug signal (e.g. Jul 4 Andrew=#1,
  Sep 24 Silouan=#9).
- **UNRES** — parish principal maps to none of our day commemorations: a
  coverage gap, or we labeled the day as an afterfeast/forefeast period.

`⚑` marks **gated** findings (non-Sunday `RANK`/`UNRES`). Sundays are shown but
not gated — resurrection dominates, so a lower-ranked saint is expected. The
`slots p/o` column (parish max LIC slot vs. our menaion sticheron count) is
info-only; a systematic `6/3` gap flags days the parish sings a fuller
6-sticheron service than our 3+3 split.

## Baseline / check (the standing gate)

Same shape as `scripts/rescrape-diff.js`: capture the current known findings,
then alert only on what's **new** (mirrors the `rescrape-drift` cron).

```bash
# accept the current state as the baseline (after triaging or adding a month)
node scripts/ocanwa-baseline.js --capture-baseline audit/parish-baseline.json

# alert only on NEW divergences — exit 2 if our pick changed since baseline
node scripts/ocanwa-baseline.js --check audit/parish-baseline.json
```

`.github/workflows/nightly-parish-baseline.yml` runs `--check` nightly (08:45
UTC), booting the server first, and opens/updates a `parish-baseline-drift`
issue only on a NEW divergence. Because the parish files are effectively static,
this watches **our** side: it fires when the assembler's principal pick changes
(intended or regression) or a month is added without refreshing the baseline.
When a NEW finding is intended, refresh the baseline with `--capture-baseline`.

## Adding a month

1. Get the month's Vespers Dropbox folder URL from
   <https://www.ocanwa.org/liturgical-resources> ("Daily Sheet Music").
2. Download the folder as a zip and list filenames (no music is kept):
   ```bash
   curl -sL "<folder-url>?dl=1" -o /tmp/m.zip
   unzip -l /tmp/m.zip | awk '{$1=$2=$3=""; print}' | sed 's/^ *//' \
     | grep -iE '\.pdf$' | sed 's#^/##' > audit/ocanwa-baseline/<MM>-vespers.txt
   ```
3. Re-run `npm run audit:parish-baseline`.
