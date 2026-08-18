# shaala — Browsable Hierarchy + Link Contributions

**Date:** 2026-08-18
**Status:** approved for implementation
**Supersedes nothing.** Extends `2026-08-17-shaala-design.md`; every constraint
in that spec (attribution, blur gate, anonymity copy, RLS posture) still holds.

## Goal

Make the 78,744 flagged schools browsable and findable — a levels.fyi-style
state → district → block → school hierarchy where every level is a real,
indexable URL with honest comparative numbers. Demote the map from sole entry
point to a supporting view.

## Why

Three concrete problems with the app as deployed:

1. **Nothing is indexable.** The entire app is one WebGL map behind a hash
   router. Hash fragments are not indexed as separate pages, so none of this
   data appears in a search for "girls toilet school <district>" — even though
   the data is real and sourced from the government's own records.
2. **There is no way to find your own area** short of panning a map of India
   or knowing a school's name. A parent in Mylliem has no path to Mylliem.
3. **The map is the heaviest possible first paint** — MapLibre plus a 826KB
   bundle — on an audience that is largely on low-end Android and slow
   connections.

A static list fixes all three and has none of the map's failure surface
(WebGL init, glyph loading, tile races, style-swap state loss).

## What this is not

Not a replacement for the map. The map answers "how widespread is this,
visually" and "what's near me", which a table cannot. It moves below the
fold on the landing page and remains reachable throughout.

## Scale (measured, not estimated)

| Level | Count |
|---|---|
| States | 32 |
| Districts | 725 |
| Blocks | 5,403 |
| Schools | 78,744 |

Mean 14.6 schools per block, which makes the block a natural leaf: its
schools list inline, so no per-school pages are generated.

**Pages generated: ~6,160** (32 + 725 + 5,403).

## Decisions (locked)

1. **Pre-rendered static HTML**, not client-rendered. This is the entire
   point — client-rendered pages index slowly and unreliably, and produce no
   rich link previews when shared.
2. **Landing page is the state list**, map below it.
3. **Rank by rate, not raw count**, at every level. Raw counts rank by
   population: Madhya Pradesh tops every list simply for being large, and
   genuinely worst-hit small states (Meghalaya at ~29.7%) disappear.
4. **Contributions stay structured.** Links and notes attach to the existing
   report as optional evidence. No free-form post type. What makes the
   levels.fyi model work is that contributions are typed and therefore
   aggregatable; free text feeds no ranking and creates unbounded moderation
   load and defamation exposure on named schools.

## Data pipeline

Three new build steps, all under `scripts/`.

### `crawl-totals.mjs`

Region totals are required for rates and are not in any local file. From the
KYS API (`yearId=11`), verified live before writing this spec:

- 725 requests — `blocks?districtId=…&yearId=11`, to obtain block IDs, which
  the existing crawl output does not contain (it carries `_districtId` only).
- 725 requests — district totals.
- ~5,403 requests — block totals.

Endpoint, confirmed working at both levels:
`schools-girls-toilet-facility-count-by-region-id?yearId=11&regionId=<id>`
returning `totSch`, `totSchGirlsCoed`, `totSchNotHaveGirlsToilet`,
`totSchHaveGirlsToiletButNotFunc`.

**~6,853 requests, roughly 46 minutes at 0.4s spacing.** Writes NDJSON
incrementally and resumes by skipping already-fetched region IDs — the
existing national crawl died twice mid-run (disk exhaustion, orphaned
duplicate process), so resumability is a requirement, not a nicety.

Output: `.data-src/region-totals.ndjson`

### `build-aggregates.mjs`

Joins the 78,744 flagged schools (`.data-src/joined.json`) to region totals
and emits a nested tree: state → district → block, each carrying `flagged`,
`total`, `rate`, and the `no_girls_toilet` / `girls_toilet_nonfunctional`
split.

Output: `.data-src/aggregates.json`

### `prerender.mjs`

Walks the aggregate tree and writes ~6,160 HTML files into `public/`.

**Slugs** derive from names (`EAST KHASI HILLS` → `east-khasi-hills`).
Collisions **fail the build** rather than silently overwriting a page — two
districts sharing a slug would otherwise make one silently unreachable.

## URL structure

```
/                                     state list + map below
/state/meghalaya                      district list
/state/meghalaya/east-khasi-hills     block list
/state/meghalaya/…/mylliem            school list (~15 rows)
```

Pre-rendered at those exact paths, so Vercel serves them directly with no
rewrite rules.

## Page anatomy

Deliberately minimal: breadcrumb, one headline stat, one table.

**Sorting is a progressive enhancement, not a dependency.** Rows are written
to the HTML already ordered worst-rate-first at build time, so the default
and most useful ordering survives with JavaScript disabled. Column-header
sorting hydrates on top for anyone who wants a different order. (Without
this, "sortable table" and "works with JS disabled" would contradict.)

```
India › Meghalaya › East Khasi Hills › Mylliem
7 of 196 schools flagged (3.6%)

SCHOOL              UDISE          ISSUE
Govt LP Mylliem     17040300201    No girls' toilet
  📷 2 reports · 🔗 instagram.com/p/…      ← hydrated client-side
Govt UP Nongkrem    17040300305    Non-functional
```

Every row links one level deeper; school rows link into the map and the
existing report flow.

Each page carries the attribution required by the parent spec: the source
and year (`UDISE+ 2024-25`) accompany every claim, and no individual staff
are named.

## Discoverability

**`sitemap.xml` is generated alongside the pages and is not optional.** At
~6,160 URLs, search engines will not reliably discover the block pages by
following links alone; without a sitemap most would never be indexed, which
would defeat the reason for generating them. Written by `prerender.mjs` from
the same tree it renders, so the two cannot drift apart. `robots.txt` points
at it.

**Block pages must carry content beyond their school table.** ~5,400 pages
that differ only by 15 templated rows are the classic thin-content pattern
and risk being deprioritized as a group. Each block page therefore states its
rate against its district and state averages ("Mylliem: 3.6% — below the East
Khasi Hills average of 25.9%"), which is genuinely useful to a reader and
makes each page substantively distinct.

## Coexistence with the SPA

**Browse pages do not boot the SPA at all.** No MapLibre, no MediaPipe, no
826KB bundle — that is what makes them fast and indexable. They are plain
HTML plus a small stylesheet.

Only `/` loads `main.js`, for the map section below the fold. The existing
`#/admin` and `#/methodology` hash routes therefore keep working unchanged,
so nothing already built and deployed regresses.

The SPA's existing `#/state/CODE` route becomes redundant once browse pages
exist. It is left in place — removing it is gratuitous risk for no gain.

## Citizen contributions

### Schema additions

`reports` gains:

- `link_url text` — nullable
- `note text` — nullable, 280 characters

Applied via idempotent `alter table … add column if not exists`, consistent
with how `faces_found` was retrofitted.

### Link allowlist

Permitted hosts: `instagram.com`, `youtube.com`, `youtu.be`, `x.com`,
`twitter.com`, `facebook.com` (plus `www.` variants).

**Validated server-side in the Edge Function**, not only in the browser.
Client-side validation is a UX affordance; anyone can POST to the function
directly. A rejected link returns 400 and no row is written.

Rationale: arbitrary user-submitted outbound links are a serious abuse
vector — spam, phishing, malware, and unrelated content published under this
project's name. Every rendered outbound link carries
`rel="nofollow noopener"` and `target="_blank"`, so a poisoned link cannot
borrow shaala's credibility or pass it SEO value.

Nothing is published without passing the existing human moderation queue.

### Where contributions surface

Block pages hold ~15 schools, so their reports load in a single query:

```
reports?udise_code=in.(…15 codes…)&review_status=eq.approved
```

No join and no dependency on the (currently empty) `schools` table.

This is a **progressive enhancement**: the static page renders and indexes on
its own; the reports/photos/links line hydrates on top. Works with JavaScript
disabled, richer with it on.

## Implementation phasing

This spec is large enough that it should implement in two independently
shippable phases, not one push. Phase 1 delivers standalone value and can
deploy on its own; Phase 2 is additive and touches a different surface.

**Phase 1 — browse hierarchy.** The three pipeline scripts, ~6,160 generated
pages, landing-page restructure. Deployable and useful with zero changes to
the submission flow or database.

**Phase 2 — link contributions.** Schema columns, Edge Function allowlist
validation, the two optional form fields, and client-side hydration of
reports onto block pages.

**Phase 3 — any-school lookup.** Per-district all-schools index and the
"report a school not on this list" path (detailed below).

Dependencies run one way: Phase 2's hydration and Phase 3's lookup entry
point both need Phase 1's pages to attach to. Phase 1 depends on neither, and
Phases 2 and 3 are independent of each other.

## Phase 3 — reporting a school that is not on the flagged list

The original map design promised "flagged pins **plus lookup for any
school**", so a citizen could document a school the government has *not*
admitted is failing. That is the under-reporting half of the argument and it
was never built: search currently covers only the 78,744 flagged schools.

### Why lookup, not free-form entry

Every report stays anchored to a real UDISE code. "This specific school, which
the government records as compliant, has no working toilet — here is a
photo taken 40m from its recorded location" is checkable and damaging.
"There is a bad school near me" is noise, and a free-text school field
invites duplicates, typos, and fabricated entries sitting alongside
government-sourced data.

### District-scoped index

A full all-schools index measures **99MB raw / ~35MB gzipped** — far too heavy
to send to a phone. Scoped per district it is **~2,000 schools, ~141KB**,
which needs no database and fits the static architecture unchanged.

`build-district-index.mjs` reads the 1.45M-row coordinate CSV and emits
`public/data/all/<state>/<district>.json` — `udise`, `name`, `block`, `lat`,
`lng`, `management` per school. 725 files.

District pages gain: *"Don't see your school? Show all 2,004 in this
district"* — loads that one file, searchable client-side, and reporting
against a picked school follows the existing flow. Such reports create the
`citizen-found` pin state already defined in the parent spec.

### Two risks, both real

**Deploy size.** ~99MB of additional static files. A previous deploy already
failed on a Vercel file-size limit, so this must be measured against actual
limits before committing to it, not assumed. Mitigation if it does not fit:
restrict the index to government schools only (~1.01M rows, ~70MB), which
matches the campaign's scope anyway and costs nothing the project needs.

**Coordinate quality breaks the verified tier for some schools.** Roughly 3.2%
of schools in the 2021 coordinate dump sit on shared "centroid dump"
coordinates — up to 552 schools stacked on one point — and 76,199 have three
or fewer decimal places. For those, the 200m GPS proximity check will reject a
photo taken *at the school*, because the school's recorded location is wrong.
Flagged schools mostly avoid this, but an arbitrary school picked from the
full index may not. Such a report must fall back to `unverified` with an
explicit reason ("this school's recorded location is imprecise"), never be
silently rejected as if the citizen were lying about where they were.

## Deferred, explicitly

- **State/district-level report totals.** Aggregating reports above block
  level does need the `schools` table populated plus a join view. The
  baseline UDISE numbers are useful without it.
- **Per-school pages.** 78,744 files to display one row each. Blocks list
  their schools inline instead.
- **Schools genuinely absent from UDISE.** Free-form school entry is not
  built; an unlisted school cannot be reported. Accepted trade-off — every
  report stays tied to a verifiable government identifier.

## Testing

Real coverage on what can silently corrupt:

- **Slug generation and collision detection** — a collision must fail the
  build, and the test asserts that it does.
- **Sitemap completeness** — every generated page appears in `sitemap.xml`
  exactly once, and the sitemap contains no URL without a corresponding
  file. A sitemap that silently drifts from the generated pages is worse
  than none.
- **Aggregate rollup integrity** — block sums equal their district sum;
  district sums equal their state sum. A rollup that silently drops rows
  would produce plausible-looking but wrong rankings.
- **Rate math** against a live-verified case: Anakapalli, 16 flagged of
  1,947 girls/co-ed schools = 0.82%.
- **Link allowlist** — accepts each permitted host, rejects arbitrary hosts,
  rejects `javascript:` and other non-http(s) schemes, and is not fooled by
  hosts like `instagram.com.evil.tld`.
- **Schema consistency** — the existing `schema-consistency.test.js` already
  fails the build if a payload key has no matching column; `link_url` and
  `note` fall under it automatically.

Then a Playwright pass over generated pages **with JavaScript disabled**,
since indexability and no-JS usability are the specific claims being made.
