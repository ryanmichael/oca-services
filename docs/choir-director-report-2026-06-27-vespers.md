# Great Vespers — Sat Jun 27, 2026

> **Please read this alongside the rendered service sheet.** This document
> explains where each variable hymn came from and what to spot-check; the
> service sheet has the actual text. You'll get the most out of it with both
> open side by side.

**Parish:** St. John of Damascus, Tyler, TX
**Liturgical day:** 4th Sunday after Pentecost (sung as eve of Sun 6/28)
**Tone:** 2 *(tone of the week ending, i.e. Sun 6/21's tone — not Sun 6/28's)*
**Season:** Ordinary time, Octoechos open. Apostles' Fast (fish/wine/oil).
**Rank:** Simple commemoration — no Old Testament readings.

---

## Today's commemorations

1. **Translation of the Relics of Sts. Cyrus and John, Unmercenary Physicians** *(primary)*
2. Sts. Sergius and Herman of Valaam (1353)
3. Synaxis of the Icon of the Theotokos *"Of the Three Hands"*
4. Our Holy Father Sennuphius the Standard-Bearer

Per Tyler's settings, **only #1 is named at the dismissal**; we don't currently name lesser saints at Tyler.

---

## Translation in effect

Fixed prayers and litanies come from the **OCA Service Book** and the **OCA Sluzhebnik** (the priest's altar book), in archaic English — *Thee, Thy, didst*. Variable hymns each have their own source; see the notes below.

---

## What's variable in tonight's sheet

Everything else is the standard Great Vespers order from the OCA Service Book.
These four sections are where the day's content actually changes:

- **Kathisma I — "Blessed is the Man"**
  Tyler sings the **Holy Transfiguration Monastery (Brookline, MA)** setting here, not the OCA Service Book default.

- **Lord I Call — 10 stichera**
  - 6 × Octoechos Tone-2 resurrectional stichera — from the **OCA Octoechos** in archaic English.
  - 3 × Menaion stichera for Sts. Cyrus & John (June 28) — sourced from the **OCA online menaion (oca.org)**, where the base text is in modern English. To match the rest of the service, we run that text through a script that converts modern English to archaic English (*you → thou, your → thy*, and the corresponding verb endings). The script does well on most hymns but occasionally produces awkward phrasing — this is the most common place to spot a wording bug.
  - Glory: if the menaion supplies a doxastikon appointed for Sts. Cyrus & John on June 28, that is sung; otherwise we fall back to the Tone-2 Glory sticheron from the Octoechos.
  - Now-and-ever: **Dogmatikon, Tone 2** ("The shadow of the Law passed when grace came…") — from the OCA Octoechos.

- **Aposticha — idiomelon + 3 stichera**
  - Octoechos Tone-2 Saturday Vespers — from the **OCA Octoechos**.
  - Glory: if the menaion supplies an aposticha doxastikon for Sts. Cyrus & John, that is sung (same modern-to-archaic conversion caveat as above); otherwise the Tone-2 aposticha Glory from the Octoechos.
  - Now-and-ever: the **Tone-2 aposticha Theotokion** from the Octoechos — note this is a *different* Theotokion than the Dogmatikon sung earlier at Lord I Call.

- **Troparia at the end**
  - Resurrectional Troparion Tone 2 — from the **OCA Octoechos**.
  - Glory: **Cyrus & John troparion (Tone 5)** — from the OCA online menaion, converted from modern to archaic English by script. Worth a close read against the OCA Service Book or June 28 menaion volume.
  - Now: Tone-2 Resurrectional Theotokion — from the OCA Octoechos.

### Melody models (podoben) carried by today's variable hymns

For tonight, the menaion sources note these melodic models for the Cyrus & John hymns:

- **Cyrus & John kontakion (Tone 3):** Podoben *"Today the Virgin…"*

The other June-28 commemorations (Three-Hands Icon, Sergius & Herman, Sennuphius) carry their own podoben tags in our source data — most relevant only if the dismissal or another section pulls them in. Please flag if any podoben tag appears in the service sheet that doesn't match what your choir actually sings, or if a hymn that should carry a podoben is missing one.

---

## Please verify

- [ ] **Blessed is the Man** — wording matches the HTM-Boston setting your choir sings.
- [ ] **Lord I Call** — total of 10 stichera; the 3 menaion stichera are the ones appointed for Sts. Cyrus & John on June 28 (not the General-Menaion generic-unmercenaries fallback, which you can spot by the saints' names being slotted into a template like "*…O glorious Cyrus and John…*").
- [ ] **Lord I Call Now-and-ever** is the **Tone-2 Dogmatikon**, not Tone 3.
- [ ] **Aposticha closing structure** — ends with Glory → Now → Tone-2 Theotokion.
- [ ] **Cyrus & John troparion + kontakion** (June 28) — wording matches the OCA Service Book. *(These were converted from modern English to archaic English by script — watch for awkward `thou didst / Thy / hast` constructions that wouldn't appear in a hand-translated text.)*
- [ ] **Menaion Glory-doxastika** at Lord I Call and Aposticha — same script-conversion caveat; check for awkward archaic-English phrasing.
- [ ] **Hierarch names at the augmented litany** — Metropolitan Tikhon (primate), Archbishop Alexander (ruling).
- [ ] **Saturday-evening prokeimenon refrain** — *"The Lord is King…"* — let us know if your sung refrain differs from what appears. *(The system doesn't yet let individual parishes substitute their own prokeimenon refrains — once you flag the desired wording we'll know to build that.)*

### Live example of a script-conversion failure
While preparing this report, I spotted an existing menaion troparion in our database that reads *"In thou, O Father, was preserved with exactness…"* — that should be *"In thee, O Father…"*. This is exactly the kind of bug to look for; this one is already fixed-list and not in tonight's service, but I mention it so you know what shape the failure has.

---

## What's *not* included tonight, and why

A few things you might expect to see, that we deliberately omitted:

- **Old Testament readings (paroemias)** — not appointed for simple-rank commemorations; they appear only at polyeleos+, vigil-rank feasts, and Great Feasts.
- **Litya** — same reason: not appointed at simple rank.
- **Lesser saints at the dismissal** — Sergius & Herman of Valaam, the Three-Hands Icon, and Sennuphius are commemorated today but won't be named at the dismissal, because Tyler's settings name only the primary commemoration. (This is a switch we can flip per parish.)

If any of these *should* appear and don't, that's a real bug — please flag it.

---

## What would you like to be able to customize that you can't today?

Beyond bugs in tonight's sheet, what's the highest-leverage change to *how* services are composed at Tyler? Examples that would be useful to hear about:

- A variant (Znamenny / Carpatho-Rusyn / other setting) you'd choose for some section if the picker offered it.
- A long/short form choice (e.g., abbreviated litany petitions, fuller psalm verses).
- A rubrical preference Tyler observes that the system doesn't yet expose as a setting.
- A hymn whose translation Tyler would prefer to override with a specific source (HTM, Jordanville, Father Lash, etc.).

These shape the roadmap as much as bug reports do — please name even speculative wishes.

---

## How to flag something

For each item above that doesn't match, a one-line note is enough — e.g.:

> *"Lord-I-Call sticheron #4 should be the Glory-doxastikon, not an Octoechos sticheron."*
> *"Troparion for Cyrus & John uses 'who hast given' — we sing 'Who didst give'."*

We'll figure out where each correction needs to be applied.

---

*Generated 2026-06-22 from `data/orthocal/2026-06-28.json` and the
`st-john-damascus-tyler` parish-settings row.*
