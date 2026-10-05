# Draft email to Connie — 2026-10-05

Two open questions. Both are things we have been inferring from her documents and
should simply ask. Status: **DRAFT, not sent.**

- Q1 settles 13 hymns already changed on the evidence, and more importantly gives
  us a general rule for every future case.
- Q2 has been pending since the Daily Octoechos work (chunk 4): her book's
  appendix covers Monday–Friday only, so liturgical Saturday has no entry, and
  that is 52 dates a year.

---

**Subject:** Two questions about tones and the Saturday daily theotokia

Hi Connie,

Two things I keep guessing at, and you can settle both quickly.

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

Thanks — these two answers will save me a lot of guessing.

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
