# Variant Library — Stability Contract

This directory contains the curated catalog of named text variants that
parishes pick from in self-service settings. Each file `<key>.json`
catalogs the variants for one overlay key (e.g. `pre-communion-prayer`,
`cherubic-hymn`, `blessed-is-the-man`).

Parish settings store references to variants as `(variant_key, variant_id)`
pairs in the `parish_variant_picks` table. **Those references must remain
resolvable for as long as the parish row exists.** That is the contract
this document defines.

## File shape

```json
{
  "key": "pre-communion-prayer",
  "_version": 1,
  "_target": { "service": "liturgy", "path": "pre-communion.prayer-chrysostom" },
  "_contract": "see fixed-texts/variant-library/CONTRACT.md",
  "variants": [
    {
      "id": "oca",
      "label": "OCA Service Book",
      "value": "...",
      "aliases": [],
      "deprecated": false
    }
  ]
}
```

Required per variant: `id`, `label`, `value`.
Optional per variant: `aliases` (string array), `deprecated` (bool).

`value` may be either a string (most variants) or a structured object (for
multi-part hymns like the Cherubic Hymn or Blessed-is-the-Man). The parish
overlay materializer slots the value as-is at `_target.path`.

`_target.service` is the service name (`liturgy`, `vespers`, etc.) the variant
applies to. `_target.path` is a dotted overlay key — e.g.
`cherubic-hymn` (top-level) or `kathisma.blessedIsTheMan` (nested). `_target`
is required as soon as a file has variants; placeholder files with
`variants: []` may omit it.

## The four rules

### 1. IDs are immutable

Once a `variants[].id` ships to production, it cannot be renamed in place.
A parish_variant_picks row pinning that id must keep resolving forever.

If you want to rename `htm` → `htm-boston`, the path is:
1. Add a new variant with `"id": "htm-boston"` and `"aliases": ["htm"]`
2. Remove the original `htm` entry in the same PR
3. The alias resolves the historical reference to the new variant

### 2. IDs cannot be removed

Removing a variant whose id (or any of its aliases) is referenced by a
parish row silently breaks that parish — its overlay falls back to default
with no error.

If a variant is no longer recommended, mark `"deprecated": true`. The
loader still resolves it; the settings UI hides it from the picker for
new parishes. Existing parishes keep working.

### 3. IDs and aliases share one namespace

Within a single `<key>.json` file:
- No two variants may share the same `id`
- No alias may collide with another variant's `id` or any other alias

The loader builds one flat map `{ id-or-alias → variant }` per key. A
collision in that map is a contract violation and fails CI.

### 4. The contract test must stay green

`test/contracts/variant-library.test.js` enforces rules 1-3 by:
- Loading the registry without errors
- Verifying no id/alias collisions within a file
- Verifying every parish_variant_picks row in the DB resolves

If the test fails, do not work around it. Fix the variant file so the
rules hold.

## Why this matters

This catalog is the load-bearing investment in the parish self-service
design (see `docs/parish-self-service-design.md` §2.3). The library-first
strategy depends on parishes being able to pick a named variant and trust
it to keep working through future library edits. Without these four rules,
"silently fall back to default" is a real, probably-frequent failure mode
that's invisible from the admin UI.
