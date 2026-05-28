# Rule validation against historical bugs

Each rule claims to catch a specific past bug. To verify, we check out the
parent of the fix commit in a git worktree, copy in the current `audit/`
directory, start a server on a fresh port, and run the rule. A finding on the
expected date counts as validation.

Run date: 2026-05-28. Year audited: 2026.

| Rule | Fix commit | Expected findings | Actual | Verdict |
|---|---|---|---|---|
| `C1-paschal-opening-window` | 17784d4 (today) | 7 Bright Week + 4 Pent Saturday vespers missing `paschalOpening` | **11/11 high** — Apr 11–17, Apr 24, May 1, 8, 15 | ✅ Full match |
| `C2-paschal-aposticha-window` | deaa946 (Holy Fathers Vespers) | 1 — Holy Fathers Sunday (Pascha+42) wrongly had `paschalAposticha=true` | **1/1 high** — May 23 vespers (civil Sat → liturgical Sun May 24) | ✅ Full match |
| `E4-aposticha-distinct` | deaa946 (Holy Fathers Vespers, Bug 2) | 3 — Thomas / Ascension / Pentecost (first sticheron repeated ×3) | **3/3 high** — Apr 18 (Thomas), May 20 (Ascension), May 30 (Pentecost), each "slots 0↔1, 0↔2" | ✅ Full match |
| `L1-communion-ordering` | dab7cb5 (Restore Communion Hymn position) | All Liturgy days affected by Paschal communion order swap | **50/50 high** — Pascha onward, Communion Prayer rendering after Communion Hymn | ✅ Full match |
| `F-weekday-vespers-octoechos-source` (v2) | bf4ba30 (weekday off-by-one) | All ordinary-time weekday vespers (Mon–Fri) for Jan–Apr + Jun–Dec | **163/163 high** — every ordinary-time weekday flags "Octoechos LIC hymns not found in source tone{N}.{sungEve}.vespers" | ✅ Full match (after rule rewrite) |
| `L2-trisagion-substitution` | this session (Pentecost audit) | Pascha + 6 Bright Week days + Pentecost should render baptismal substitution; pre-fix `getTrisagionSubstitution` returned 'typical' for all 8 | **8/8 high** — Apr 12 (Pascha), Apr 13–18 (Bright Week), May 31 (Pentecost) | ✅ Full match |
| `B1-presanctified-shape` | — | — (no specific past bug) | n/a | — |
| `M1-sunday-matins-sections` | — | — (no specific past bug) | n/a | — |
| `M2-matins-section-ordering` | — | — (no specific past bug) | n/a | — |
| `M3-eothinon-gospel-match` | — | — (no specific past bug) | n/a | — |

## Note: F rule strengthened post-validation

The initial F rule used a theme-keyword heuristic on the assembled output and skipped when Menaion injection appeared. That heuristic missed most off-by-one cases — only 2 of dozens flagged on pre-fix state — because Menaion routinely displaces the back half of weekday Octoechos hymns and the rule conservatively bailed.

The rule was rewritten to compare assembled `source === 'octoechos'` LIC hymns against the source data at the expected key `octoechos.json → tone{N}.{VESPERS_SUNG_EVE[dow]}.vespers.lordICall.hymns`. This is independent of Menaion displacement: every Octoechos block that *is* rendered must be findable in the expected source set. A consumer reading the wrong day's data flags here. Pre-fix state now flags 163/163 ordinary-time weekday vespers — full coverage.

`VESPERS_SUNG_EVE` is inlined in the rule itself rather than imported, so the rule keeps catching regressions even if the constant is removed from `calendar-rules.js`.

## How to re-run

```bash
git worktree add /tmp/oca-prefix <fix-commit>~1
cp -r audit /tmp/oca-prefix/
PORT=3020 node /tmp/oca-prefix/server.js &
node /tmp/oca-prefix/audit/index.js --year 2026 --http http://localhost:3020 \
  --rules <rule-id> --no-allowlist
git worktree remove /tmp/oca-prefix --force
```
