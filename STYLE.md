# Design Philosophy

The design language for Orthodox Daily Services. The point of this document is to make it easy to recognize when a contribution is *aligned* and easy to refuse contributions that aren't — without having to argue about taste.

The engineering spec that implements this philosophy lives at `front-end/frontend-requirements.md`. The strategic frame that justifies it lives at `ASSESSMENT.md`.

---

## Five durable principles

1. **The prayer book is the product.** Every chrome element must be willing to disappear so the prayer text can fill the screen.
2. **Reverence is not theatricality.** No gradient flames. No swelling music. No "today's verse of the day!" Reverence is silence around the type.
3. **One opinionated default per decision.** Per jurisdiction, per role, per setting. Editable, but not "configurable."
4. **The service is the surface; the parish is the context; the user is the visitor.** The UI hierarchy reflects this. The user does not personalize the prayer; the user enters into the parish's prayer.
5. **Trust is built by precision.** Cite sources. Show provenance. Never round a liturgical edge case. Never let a generated value appear without traceability.

---

## Working principles (from `front-end/frontend-requirements.md`)

- **Prayer book aesthetic** — not a tech product. No rounded pill buttons, no card shadows, no bright colors.
- **Typography-first** — generous line height, warm parchment tones, Cinzel for headings/labels, EB Garamond for all reading text.
- **Focused and quiet** — every interaction should feel considered. Nothing competes for attention.
- **Full-screen transitions** — Search and Calendar both take over the entire viewport. No modals, no popovers, no overlays.
- **Mobile-first** — all takeover views are thumb-optimized on small screens.

---

## Color tokens

```css
--bg:      #F5F0E8;  /* warm parchment — page background */
--surface: #FAF7F2;  /* slightly lighter — header, panel */
--text:    #1A1209;  /* near-black warm — body text */
--rubric:  #8B1A1A;  /* liturgical red — accents, active states */
--gold:    #C9A84C;  /* rule dividers, hover borders */
--muted:   #6B6358;  /* metadata, labels, placeholder text */
--border:  #DDD5C4;  /* structural lines */
```

Restraint is part of the brand. There is no roadmap to add a third or fourth accent color. The liturgical red at `#8B1A1A` is plenty.

---

## Typography

| Use | Family | Notes |
|-----|--------|-------|
| Section headings, UI labels | **Cinzel** | All-caps, letter-spacing .1–.2em |
| All reading text (prayers, hymns, rubrics, search, calendar) | **EB Garamond** | Body 16–17px desktop / 19px mobile, line-height 1.88 desktop / 2 mobile |
| Rubrics, feast names, sticheron labels | **EB Garamond italic** | Color: `--rubric` for rubrics, `--muted` for labels |

Loaded from Google Fonts:

```
https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap
```

Full type-scale table: see `front-end/frontend-requirements.md`.

---

## Anti-patterns — refuse these by name

If a proposed change has any of these qualities, push back even if it would be "easy."

1. **Burgundy + gold heraldic chrome.** The "denominational committee" aesthetic. The palette already refuses it. Don't let it back in via a logo, a header band, or a "feast day banner."
2. **Stock religious iconography.** Cross-stamp logos, cathedral silhouettes, gradient flame, icon-style header art. The single `☩` glyph in the header is sufficient.
3. **Modal dialogs over the prayer.** A user reading a hymn must never have the hymn occluded. Full-screen views are the alternative.
4. **Tab-bar navigation.** "Calendar | Readings | Prayers | Saints | More." One main column of content; chrome out of the way.
5. **The card UI.** Borders, shadows, rounded corners, hover-lifts. Right for SaaS dashboards, wrong for prayer text. Maintain the typographic-divider discipline.
6. **The pop-up "What is Vespers?" first-launch tour.** Orthodox sensibility is "the prayer speaks for itself; meet it where it is." Onboarding is at most a single screen.
7. **Streak gamification of personal prayer.** A "10-day streak" badge is theologically wrong (prayer is not a performance) and aesthetically off. Continuity indicators for *choir prep* are fine; streaks on devotion are not.
8. **Therapeutic-genre copy.** "Find peace today," "What are you grateful for?" — Hallow's idiom. Orthodox idiom: "the appointed prayer of the Church for today."
9. **Mood-categorized prayer.** "Prayers for anxiety," "Prayers for sleep" as primary navigation. The liturgical year is the classification system; respect it.
10. **Personalized AI prayer generation.** The text of the prayer is canonical and must come from a human-attested translation. AI may organize, suggest, explain — never generate the appointed prayer.

---

## Patterns to adopt (with attribution)

Sources to draw from, with the specific transferable pattern named:

- **Universalis** — Customizable type rendering (size, day/night, scroll vs page), synchronized audio + text highlight, single-purchase / no-subscription posture
- **Lectio 365** — Time-of-day theming (morning warmer, evening dimmer), pre-download for offline, downloadable in advance
- **YouVersion** — "One friend makes it sticky" — `share with our choir` deep links
- **Day One** — Daily ritual as the home view, not a feature buried behind navigation
- **Linear** — Opinionated defaults; keyboard-first power-user shortcuts (`j/k` next/prev block, `/` to search, `g d` go-to-date); transferable muscle-memory patterns
- **Universalis & Hallow** — Personalized but minimal onboarding (single screen, real defaults)
- **Stratechery / Substack** — Inline catechesis as a tappable margin pearl — offer, never push

---

## Visual identity direction

- **Wordmark in Cinzel SemiBold**, all caps, narrow tracking — like a printed prayer book frontispiece, not a logo
- **Mark, if any**: a single classical cross-rule, or no mark at all. The header `☩` is correct.
- **Refuse iconographic shorthand.** Cross-with-rays, dome silhouettes, flame motifs — all out.
- **Photographic motif, if needed**: candles at low exposure, beeswax tones, no people, no incense smoke. Better still: no photography. Type and rule lines only.

---

## Onboarding posture

A first-time user is welcomed in 60 seconds:

```
Screen 1 — "What's your jurisdiction?"
[OCA] [GOA] [Antiochian] [ROCOR] [Other ▼]
(Sets default overlay)

Screen 2 — "Your parish?" (optional, skippable)
[Search field — autocompletes against assembly-of-bishops registry]
(Sets parish-specific overlay if registered)

Screen 3 — "What brings you here?" (optional)
[As a priest/deacon] [In our choir] [I'm new to Orthodoxy] [Daily prayer]
(Sets mode + default views)

→ Drop into today's service stack.
```

No tour. No "swipe to learn." No account required to read.

---

## When in doubt

Read [the Five durable principles](#five-durable-principles) again. The product should feel like a prayer book on a tablet, not an app with prayers in it. If a change would make the home of a thoughtful Orthodox layperson feel less *quiet*, it is probably wrong even if it would test well.
