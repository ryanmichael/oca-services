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
npm run audit:parish-baseline          # all months
npm run audit:parish-baseline -- --month 09
```

Rows marked `⚑` are non-Sunday dates where our principal saint doesn't share a
name-token with the parish's LIC-Glory saint, or the LIC Glory disagrees —
review these. Sundays are not principal-flagged (resurrection dominates); check
their slot counts / Glory by eye. The `slots p/o` column is parish max LIC slot
vs. our menaion sticheron count — a systematic `6/3` gap flags days the parish
sings a fuller (6-sticheron) saint service than our daily-Vespers 3+3 split.

Name matching is a light hagiographic stemmer (Kyriacus≈Kyriakos), so expect a
few false positives around afterfeast-vs-named-saint framing — it's a
review oracle, not an auto-fixer.

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
