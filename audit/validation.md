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
| `F-weekday-vespers-theme` | bf4ba30 (weekday off-by-one) | All ordinary-time weekday vespers w/ wrong theme | **2/many medium** — Jan 22 (Friday: Cross missing), Dec 30 (Thursday: Apostles missing) | ⚠️ Partial — Menaion-skip suppresses days with saint commemorations; the May 13 motivator was hidden |
| `B1-presanctified-shape` | — | — (no specific past bug) | n/a | — |
| `M1-sunday-matins-sections` | — | — (no specific past bug) | n/a | — |
| `M2-matins-section-ordering` | — | — (no specific past bug) | n/a | — |
| `M3-eothinon-gospel-match` | — | — (no specific past bug) | n/a | — |

## Calibration note: F-weekday-vespers-theme

The rule skips when `b.source === 'menaion'` appears in the Lord I Call hymns to avoid flagging days where saint stichera legitimately displace the theme-bearing back half of Octoechos. This catches most false positives but also misses true positives: the May 13 case that motivated the bug fix has Menaion injection, so the deployed rule would NOT have caught it. The rule still found 2 Menaion-free dates with the same bug pattern, proving the heuristic works in principle.

A stronger version would check theme keywords against the source `octoechos.json` data directly (per-day, per-tone), not the assembled output — bypassing the Menaion-displacement issue entirely. Future work.

## How to re-run

```bash
git worktree add /tmp/oca-prefix <fix-commit>~1
cp -r audit /tmp/oca-prefix/
PORT=3020 node /tmp/oca-prefix/server.js &
node /tmp/oca-prefix/audit/index.js --year 2026 --http http://localhost:3020 \
  --rules <rule-id> --no-allowlist
git worktree remove /tmp/oca-prefix --force
```
