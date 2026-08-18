# shaala — Design Spec

**Date:** 2026-08-17
**Status:** approved for implementation

## Goal

A public map of every Indian government school that the government's own data
flags as failing a girls'-toilet standard, plus a verified citizen-photo layer
that tests whether those records are true.

## Why this shape

UDISE+ 2024-25 reports 1,471,473 schools. Of the 1,460,759 girls'/co-ed
schools, 39,558 have no girls' toilet and 48,324 have one that does not
function — 87,882 with a problem.

The published headline "97.3% of schools have girls' toilets" is exactly
`(1,460,759 - 39,558) / 1,460,759 = 97.29%`. The headline counts a
non-functional toilet as a toilet. 48,324 schools — 55% of the real problem —
are invisible in the official statistic.

The map's job is to make that finite, named list visible and trackable.
87,882 is a crowdsourcing target a volunteer network can actually cover.

## Data sources

| Source | Use | Notes |
|---|---|---|
| `kys.udiseplus.gov.in/web-app/api/` | flagged school lists, per district | open, unauthenticated, year 2024-25 = `yearId=11` |
| `datameet/udise_schools` (2021) | lat/lng per UDISE code | 1,450,490 rows, 100% have coords, 99.99% inside claimed state |

**Verified data quality:** point-in-polygon on a 50,506-school sample put
99.99% inside their claimed state. 85.7% sit on a unique 4dp coordinate;
3.2% are centroid dumps (up to 552 schools on one point); 76,199 have
<= 3 decimal places.

**Known gotcha:** 469,756 of the 1.45M `schcd` values are 10 characters, not
11 — leading zeros were stripped. Both sides of the join MUST be zero-padded
to 11 or roughly a third of matches are silently lost.

**Vintage mismatch:** flags are 2024-25, coordinates are 2021. Schools opened
since 2021 will have no pin. The join match rate is reported by the pipeline
and is a known, measured limitation — not hidden.

## Out of scope, permanently

Nothing that defeats the KYS captcha or mass-scrapes per-school report cards.
`search-schools` is captcha-gated by design and we respect that. The open
indicator endpoints supply everything this product needs.

## Decisions (locked)

1. **Photos are public**, face-blurred, human-moderated before going live.
2. **Two capture tiers.** Camera-required is the primary path, with a QR
   handoff from desktop to phone. Gallery upload is accepted but labelled
   `unverified`, shown smaller, and excluded from public counts.
3. **Map scope:** the ~87,882 flagged schools are pinned. Any other school is
   reachable by search / UDISE code / near-me, and a report against one
   creates a `citizen-found` pin — the under-reporting story.
4. **Moderation:** automated pre-filters, then a human approves everything.
   Multiple moderators, magic-link auth, full audit log.

## Pin states

| State | Meaning |
|---|---|
| red | government-admitted: flagged in UDISE+ 2024-25 |
| orange | citizen-found: not on the government list, citizens documented a gap |
| green | reported fixed: evidence submitted and approved |
| grey | disputed: school or officer contests the record |

## Privacy and safety requirements

These are build constraints, not policy prose.

1. **The unblurred image never leaves the device.** Capture -> canvas -> face
   detection -> irreversible blur burned into pixels -> re-encode -> upload.
   No original is transmitted or stored.
2. **Never fail open.** If the face-detection model fails to load, the user
   gets a manual blur brush and cannot submit without using it.
3. **Attribution is structural.** Every pin renders
   "as reported by this school to UDISE+ 2024-25". The template makes it
   impossible to publish a claim without its source and year.
4. **No individual staff are named** anywhere in schema, UI, or copy.
5. **Capture guidance precedes capture:** "Photograph the facility only. Do
   not photograph students." Instruction prevents more bad photos than
   moderation catches.
6. **Honest verification copy.** Client GPS can be spoofed. "Verified on-site"
   means *passed our checks*, never *proven*. Anonymity copy must read:
   "Anonymous — we never record who you are. We do record where the photo was
   taken, to verify it." Blanket anonymity claims are forbidden.
7. **Dispute and fix flows are first-class**, shipped in v1.
8. **Submission goes through an Edge Function**, never a direct browser insert,
   so rate limiting and size caps are enforceable.

## Architecture

```
Static (Vercel)               Supabase
------------------            --------------------------
GeoJSON per state       <---  build-time export
map + pin sheet               schools    (87,882 flagged)
submit flow (camera)    --->  reports    (citizen photos)
search / near-me              fixes / disputes
/admin console          <-->  moderators, audit_log
                              Edge Fn: submit-report
                              Storage: shaala-photos (blurred only)
```

Forked from Andolan (`/Users/bhargavbvs/andolan`) for the map shell, pin sheet,
hash router, and Supabase wiring. Data-pipeline pattern (`scripts/` +
`validate.mjs` + size budgets) follows ssupwithstates
(`/Users/bhargavbvs/ssupwithstates`).

**New repo, new Supabase project.** Andolan deliberately strips EXIF and
location; shaala deliberately preserves location. Sharing a codebase would be
a permanent footgun, and a takedown on one must not touch the other.

## Testing

Vitest. Required coverage:
- the zero-pad join (the bug that silently eats a third of the data)
- haversine distance and the 200m tier threshold
- the blur invariant: output carries no EXIF, is re-encoded, dimension-capped
- RLS policies: anon can insert only `pending`, read only `approved`
