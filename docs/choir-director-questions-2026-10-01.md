# Questions for the choir director — 2026-10-01

**To:** Connie Russell <cjruss63@gmail.com>
**Subject:** Two questions on the St John troparion at Liturgy

Ready to copy and send. Both questions block a correction that is otherwise
fully routed — see "Why these matter" below.

---

Connie,

Thank you again for letting us reuse the choir documents — that's a big help.

Two questions about the new Byzantine "Lord Have Mercy" with the Troparion to
St John, so the texts my system generates match what the choir actually sings:

1. Where exactly does it fall? Your email said "following the Thanksgiving
   prayers." In the order I'm working from that could be any of three spots:
   right after the Litany of Thanksgiving, after "Blessed be the Name of the
   Lord," or at the Dismissal. Which one do you do?

2. When St John "gets trumped by the feast" on a feast or afterfeast — does the
   feast's troparion replace his entirely, or is the feast sung first and
   St John after?

And two small things I noticed in the 9/24 packet, in case they're useful:

- "Divine Liturgy 09.27.26.pdf" has Great Vespers Tone 8 Resurrection stichera
  on its last two pages, with the page numbering restarting at 1. No trouble on
  my end — just flagging in case those pages were meant to go out as a separate
  attachment.

- On that same Tone 8 stichera page, numbers 10 through 5 are in the thee/thy
  form, but number 4 reads "We glorify your resurrection from the dead, o
  christ… by which you have freed Adam's race." Looks like a modern-language
  version may have slipped in from a different source.

No rush on any of this.

Thanks!
Ryan

---

## Why these matter

**Question 1 — the anchor.** The troparion text already exists
(`troparia.id=40639`, commemoration 2471, Tyler's declared temple patron) and
already renders at the Little Entrance, in the Kontakia, and around Communion.
What is missing is a block after the Thanksgiving prayers. Our Liturgy ending
runs `litany-thanksgiving.*` → `prayer-ambon-*` → `blessed-be-the-name` →
Psalm 33 → Closing Doxology → Dismissal, so "following the Thanksgiving
prayers" has at least three readings. The 2026-09-27 booklet does **not**
settle it: it carries only the variable propers, and the practice began the
following week, so no sheet shows it yet.

**Question 2 — the suppression rule.** The patron-of-temple feature gates on
`feastOnly`, which covers Great Feasts only. "Feast **or afterfeast**" is
strictly broader, and no afterfeast boolean is surfaced to the Liturgy route
today — afterfeast logic is scattered through
`server-lib/sources/liturgy-from-orthocal.js`. Whichever answer comes back, that
signal has to exist before the rule can be honoured.

**Branch, once answered:** `structure` (a new block in the Liturgy ending),
gated by a new additive boolean rubric so it stays parish-scoped — the
`omitReadKathisma` pattern. Full dry-run routing, including rejected branches,
is in this session's `/choir-correction` report; `before_sha` is `2797e0f85c7b`.

## Pointers

- `docs/choir-packets/2026-09-24/body.md` — the directive as the director wrote it
- `features/patron-of-temple.md` — the existing feature and its `feastOnly` gate
- `data/rubric-registry.json` — where the new gate rubric would be declared
