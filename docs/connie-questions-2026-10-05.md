# Draft email to Connie — 2026-10-05 (Q3–Q4 added 2026-10-06)

Four open questions. All are things we have been inferring from her documents and
should simply ask. Status: **DRAFT, not sent.**

- Q1 settles 13 hymns already changed on the evidence, and more importantly gives
  us a general rule for every future case.
- Q2 has been pending since the Daily Octoechos work (chunk 4): her book's
  appendix covers Monday–Friday only, so liturgical Saturday has no entry, and
  that is 52 dates a year.
- Q3 is a one-line confirmation, not a blocker — our tooling already measures the
  offset per sheet. Asking only so the convention is recorded rather than
  re-derived every time.
- Q4 is the one real decision: on 10 dates a year we substitute a generic hymn,
  and whether that is wanted at all is a practice question, not ours to settle.

---

**Subject:** Four quick questions — tones, Saturday theotokia, and the generic hymns

Hi Connie,

Four things I keep guessing at. The first two are the substantive ones; the last
two are quick.

**1. When the Daily Octoechos and St Sergius disagree about the tone, which do you sing?**

We draw the saints' hymns from a few books, and I have found places where two of
them print *the same hymns, in the same order*, but under different tones. For
example, on October 24 (Martyr Arethas and his companions) the three Lord-I-Call
stichera are word-for-word the same hymns in both books, but one appoints Tone 1
and the one on your site appoints Tone 4.

Here is the full list I have found so far:

| Date | Commemoration | St Sergius | Your site |
|---|---|---|---|
| Feb 6 | St Photius (3 hymns) | Tone 1 | Tone 4 |
| Jun 17 | Martyrs Manuel, Sabel and Ismael | Tone 8 | Tone 6 |
| Aug 21 | Afterfeast of the Dormition | Tone 2 | Tone 8 |
| Aug 22 | Afterfeast of the Dormition | Tone 4 | Tone 1 |
| Sep 24 | St Thecla | Tone 6 | Tone 8 |
| Oct 2 | Hieromartyr Cyprian (3 hymns) | Tone 4 | Tone 6 |
| Oct 24 | Martyr Arethas (3 hymns) | Tone 1 | Tone 4 |
| Nov 6 | St Paul the Confessor (4 hymns) | Tone 4 | Tone 6 |

I have set these to follow your site, on the assumption that it reflects what the
choir actually sings. **Is that right as a general rule — when the two disagree,
your Menaion wins?** If so I will apply it everywhere rather than case by case.

One thing worth mentioning: I nearly got this wrong in the other direction. The
August 5 Forefeast of the Transfiguration looked like the same kind of
disagreement, and your vigil packet for that day settled it — your sheet reads
Tone 5, which is what we already had. So I would rather ask than keep inferring.

**2. The daily theotokia for Saturday**

The appendix at the back of the Daily Octoechos gives the daily theotokia for
Monday through Friday, which is what we are using for the weekday dismissal
theotokion. There is no Saturday entry, and Saturday evening falls outside the
weekday cycle — so for the Saturday *daytime* service we currently have nothing
appointed from that book. That affects about 52 dates a year.

**What do you sing as the dismissal theotokion at a Saturday service that is not
a vigil?** Is there a source you use for those, or does the practice differ?

**3. One small thing about how the service sheets are named**

When I line your sheets up against what we generate, the Great Vespers ones are
named for the evening the service is sung, and the two most recent Daily Vespers
ones look like they are named for the day the hymns belong to — so the file called
`daily-vespers-2026-10-08` is the service sung on the evening of the 7th. I have
made our side work either way, so nothing is broken and nothing is waiting on
this.

**Is that the convention, or is it just how those two happened to get saved?**
Worth a single line if you know offhand; genuinely not worth any time if you
don't.

**4. On about ten days a year we print a generic hymn. Is that what you want?**

For most saints we have their own hymns. For a handful we have none, and we fall
back to a general hymn for that *kind* of saint with the name dropped in. On
July 9 (Venerable Anthony of the Kiev Far Caves) the Aposticha comes out as:

> We honor thee as a teacher of monastics, O Anthony our Father, for from thee we
> have truly learned to walk upon the straight and narrow path.

It is true, and it is singable, but it is not Anthony's own hymn — the same text
serves any monastic saint, with the name changed. It affects ten days: January 10,
February 11, April 24, May 8, May 10, July 2, July 9, August 27, November 29 and
December 11.

**Would you rather we printed that, or left the slot to the Octoechos and said
plainly that we have nothing proper for the day?** I can do either. I would
rather match what you would actually do than keep choosing for you.

Thanks — these will save me a lot of guessing.

Ryan

---

## Notes for me, not for the email

- Q1's 13 hymns are in prod as of `bf1d884`; provenance in
  `reference/raphaela/batch-2026-10-05.json` (`tone_rows`).
- Two rows are still held and are NOT in the table above: 9553 (12-24, fails the
  round-trip gate on "you" vs "ye") and 8263 (1-9, match too ambiguous to judge).
- If she says St Sergius wins instead, the revert is
  `storage/oca.db.bak.2026-10-05-tones`.
- Do not ask her about the translation-mix count or the Raphaela/St Sergius
  question — that is our decision, not hers, and she has already answered the
  underlying question by sending the packets.

### Added 2026-10-06 with Q3–Q4

- **A fifth question was drafted and dropped: "which books does the parish sing
  from?"** It is the same question the note above rules out. The measurement work
  needed it to decide which translations count as conformant, but the packets are
  already the evidence — so `PARISH_BOOKS` in `scripts/provenance-sweep.js` should
  be DERIVED from packet matches (`npm run audit:packet-diff`) rather than asked.
  That also removes the CI-baseline step's dependency on her reply.
- **Q4 was blocked on a bug of ours until this commit.** Three of the ten dates
  were substituting a rank or an event word instead of a name, live in prod:
  05-10 sang *"O Apostle Equals"* (from "Equals of the Apostles and Teachers of
  the Slavs, Cyril and Methodius"), 08-27 gave "Recovery", 04-24 gave "and
  Evangelist Mark". Fixed in `server-lib/sources/general-menaion.js`; the class is
  closed by `test/contracts/general-menaion-name.test.js`, whose INV-8 proves the
  invariants fail against the pre-fix code. Verified over all 2,551 distinct
  titles: 281 improved, 0 regressed.
- **Two things on those dates are still wrong and are NOT in the email**, because
  they are ours to fix, not hers to answer:
  - 05-10 now reads *"O Apostle Cyril and Methodius"* — singular rank, two
    saints. The name is right; the TEMPLATE is wrong. It needs the plural
    `apostles` General Menaion set, which exists. Ask nothing; fix the saint_type
    selection.
  - 08-27 reads *"upon yourself1 from thy youth"*. The `1` is a footnote marker
    the scraper glued on (`troparia` 2836 and 39524), and that row is also a
    yy/tt register hybrid. **60 rows corpus-wide carry a digit glued to a word,
    and `text-well-formedness.test.js` has no check for the class.**
- 05-10's generic text is also built from commemoration **#3** (Cyril and
  Methodius), not the principal ("Commemoration of the Founding of
  Constantinople"). Related to `project_principal_saint_picker_2026_06_20`.
