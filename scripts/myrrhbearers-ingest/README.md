# Myrrh-bearers ingestion harness

Tools for the intake described in `docs/myrrhbearers-intake-plan.md`.
Source: **[myrrh-bearers.org](https://www.myrrh-bearers.org/)** (Holy Myrrh-bearers,
Etna CA). **Permission obtained (2026-07-07)** for parish/attributed use.

## Fetch (polite, identify yourself)

```bash
for n in 1 2 3 4 5 6 7 8; do
  curl -s -A "parish liturgy tool; contact <you>" \
    "https://www.myrrh-bearers.org/octoechos/english-$n.htm" -o "english-$n.htm"
done
```
Fetched `*.htm` are gitignored (don't vendor their copyrighted text into the repo).

## Tools

| Script | Purpose |
|---|---|
| `parse-octoechos.js` | Parse a tone page (`english-N.htm`) into services → sections → hymns. `<h2>`=service, `<h3/h4>`=section label, `<p><i>Stichos:</i>`=verse, `<p>`=hymn. Run: `node parse-octoechos.js english-1.htm` |

## Phase 1 finding (2026-07-07)

Their Sunday Octoechos vs our `variable-sources/octoechos.json`: **~70% mean
word-overlap** on the Saturday Great Vespers resurrectional stichera across all 8
tones (65–75% per tone). Same hymns / same tradition, but a genuinely distinct
translation (e.g. "Zion" vs "Sion", "make merry" vs "be glad", "life-receiving
tomb" vs "lifebearing tomb"). ~30% of words differ → a choir would notice →
intake is warranted for the full Octoechos.

## Next (Phase 2)

Import their resurrectional stichera/aposticha/troparia/canons under
`source='myrrhbearers'` (source-tagged alternates in `octoechos.json`, not
overwriting), then wire the parish source-preference (Phase 4).
