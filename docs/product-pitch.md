# Product Pitch

## What it is

A free web app that gives any Orthodox Christian — clergy, choir, or layperson — the complete prayer service for today, on any device, in seconds. No flipping between books. No "which tone are we in this week?" No subscription. Just the day's service, ready to pray or sing.

## Who it's for

- **Parish priests and deacons** preparing services without a full liturgical library
- **Choir directors and chanters** needing the exact hymns in the exact order for tonight
- **Lay faithful** wanting to follow along or pray privately at home
- **Mission parishes and small communities** that can't afford the $500+ shelf of service books
- **Travelers and the homebound** who can't get to church but want to pray the day's service

## The market gap it fills

Today, accessing the daily service requires either:
- Owning and skillfully navigating 5–10 expensive specialized books, or
- Paying for a closed commercial app with limited jurisdictional coverage, or
- Cobbling together PDFs from various diocesan websites of inconsistent quality

There is no free, comprehensive, multi-jurisdictional, daily-accurate option. This product is that option.

## The strategic posture

- **Free, always.** Liturgical texts are the Church's patrimony, not a SaaS product.
- **National in reach.** Designed from day one to serve OCA, ROCOR, Antiochian, Serbian, and Georgian parishes — not one jurisdiction's house app.
- **Parish-customizable.** Each parish can layer its own local customs (patron saint, language preferences, sung variants) on top of the standard, without forking.
- **Startup discipline.** Small team, fast iteration, modern UX. No committee approval cycles.

## Product strengths

- **Just works on the day.** Open the URL, pray. No setup, no login, no app store.
- **Faithful to the rubrics.** Every service is validated against the OCA Order of Services and audited daily for drift.
- **Adapts to your parish.** Patron saint, jurisdictional pronouns, hymn variants, communion practices — all configurable per parish.
- **Multiple modes.** Standard rendering, Choir Director mode (just what choir sings), Education mode (with explanatory footnotes).
- **Specialized services included.** Not just Sunday Vespers — Holy Week, Kneeling Vespers of Pentecost, Typika, Reader's services for parishes without a priest, memorial services.

## Honest weaknesses

- **Coverage is a moving frontier.** Some rare commemorations and Lenten weekday services still have gaps. Closing them requires hand-translating service books that aren't yet digitized in English.
- **Translation editorial decisions are opinionated.** Defaults to traditional ("thee/thy") English from OCA sources. Modern-English parishes need overlay customization.
- **No printed-booklet workflow yet.** Geared toward screens. Choirs that prefer paper need to print from the web view.
- **Discoverability is low.** No marketing, no SEO push. Growth has been word-of-mouth.
- **No parish self-service.** Customizations currently require a developer touching code. Long-term, parishes should be able to configure themselves through a UI.

## Risks the Archbishop should know about

- **One developer.** If he stops, maintenance stops. Mitigated by clean architecture and tests, but not eliminated.
- **Liturgical authority.** The product makes editorial choices (which translation, which rubric variant). For wide adoption, formal blessing from a hierarch lends credibility — and de-risks the project from being seen as "one layman's opinion."
- **Hosting cost is small but real.** Currently runs on a startup-tier cloud account. Sustained growth would need a more durable home.

## Interesting product bets that have paid off

- **Per-parish overlays beat per-jurisdiction forks.** One codebase serves all jurisdictions because customization is layered, not branched.
- **Treating liturgical content like source code.** Every change is reviewed, tested, and deployable in minutes — the same discipline that ships software ships hymns.
- **Choir Director mode.** A small UX choice that turned the app from a "read along" tool into a "run rehearsal" tool. Drove the first wave of parish adoption.

## Where it could go next

- **Parish onboarding self-service.** Let a parish administrator set patron saint, jurisdiction, language preference, and custom hymns through a settings page — no developer needed.
- **Print and PDF workflows.** A "print tonight's choir booklet" button.
- **Audio.** Pair each hymn with a representative recording for choirs learning the tone.
- **Mobile app shell.** Same content, native install, offline mode.
- **Diocesan partnership.** Formal blessing + integration with a diocese's official website would 10x adoption overnight.

## The one-sentence pitch

> *A free, faithful, multi-jurisdictional daily-service generator that gives every Orthodox parish — and every Orthodox Christian at home — the prayers and hymns of the day, exactly as the Church appoints them.*
