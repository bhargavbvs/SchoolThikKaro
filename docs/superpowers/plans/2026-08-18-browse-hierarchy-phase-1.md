# Browse Hierarchy — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the 78,744 flagged schools into ~6,160 pre-rendered, indexable pages — state → district → block — ranked by rate, with a sitemap.

**Architecture:** Three build-time Node scripts. One crawls region totals from the KYS API (resumable). One rolls flagged schools + totals into a nested aggregate tree. One renders that tree to static HTML plus `sitemap.xml`. Browse pages are plain HTML that never boot the SPA; only `/` loads `main.js`, for the map section below the fold.

**Tech Stack:** Node 20+ ESM, Vitest 3, Vite 5 (static `public/` passthrough). No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-browse-hierarchy-design.md`

**Phase scope:** This plan is Phase 1 only (browse hierarchy). Phase 2 (link contributions) and Phase 3 (any-school lookup) get their own plans and are NOT in scope here.

## Global Constraints

- Repo root `/Users/bhargavbvs/shaala`. Branch off `agent-b-submit-moderate`.
- Node >= 20, `"type": "module"`, ESM only. Match existing `scripts/lib/*.mjs` style.
- **Source year string, verbatim, on every page:** `UDISE+ 2024-25` (import `SOURCE_YEAR` from `src/config.js`).
- **Rank by rate descending** at every level, baked into the HTML at build time. Sorting UI is progressive enhancement only.
- **Slug collisions fail the build.** Never silently overwrite a page.
- **`sitemap.xml` is generated from the same tree that renders pages** — they must not drift.
- **No individual staff named** anywhere, per parent spec.
- Browse pages MUST NOT load `main.js`, MapLibre, or MediaPipe.
- Crawl spacing: 0.4s between requests. Resumable — skip already-fetched region IDs.
- KYS API base: `https://kys.udiseplus.gov.in/web-app/api/`, `yearId=11` (2024-25).
- Do not modify: `src/config.js`, `src/lib/geo.js`, `supabase/schema.sql`, `src/submit/**`, `src/admin/**`.

---

### Task 1: Slug generation and collision detection

**Files:**
- Create: `scripts/lib/slug.mjs`
- Test: `tests/slug.test.js`

**Interfaces:**
- Produces: `slugify(name): string`, `assertNoCollisions(names, label): Map<string,string>`

- [ ] **Step 1: Write the failing test**

```js
// tests/slug.test.js
import { describe, it, expect } from 'vitest';
import { slugify, assertNoCollisions } from '../scripts/lib/slug.mjs';

describe('slugify', () => {
  it('lowercases and hyphenates a plain name', () => {
    expect(slugify('EAST KHASI HILLS')).toBe('east-khasi-hills');
  });
  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify('JAMMU  &  KASHMIR')).toBe('jammu-kashmir');
  });
  it('trims leading and trailing hyphens', () => {
    expect(slugify('  (MYLLIEM)  ')).toBe('mylliem');
  });
  it('keeps digits, which appear in real block names', () => {
    expect(slugify('BLOCK 24 PARGANAS')).toBe('block-24-parganas');
  });
  it('handles a name that slugs to empty by falling back to a marker', () => {
    expect(slugify('!!!')).toBe('unnamed');
  });
});

describe('assertNoCollisions', () => {
  it('returns a name->slug map when all slugs are unique', () => {
    const m = assertNoCollisions(['MYLLIEM', 'SHELLA'], 'block');
    expect(m.get('MYLLIEM')).toBe('mylliem');
    expect(m.size).toBe(2);
  });
  it('THROWS when two different names produce the same slug', () => {
    expect(() => assertNoCollisions(['EAST KHASI', 'east  khasi'], 'district'))
      .toThrow(/collision/i);
  });
  it('names both colliding values in the error, so it is debuggable', () => {
    expect(() => assertNoCollisions(['A B', 'a-b'], 'district'))
      .toThrow(/A B|a-b/);
  });
  it('does not treat the same name appearing twice as a collision', () => {
    const m = assertNoCollisions(['MYLLIEM', 'MYLLIEM'], 'block');
    expect(m.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/slug.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/slug.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/slug.mjs

/** URL slug from an administrative name. Digits are kept because real block
 *  names contain them (e.g. "24 PARGANAS"). */
export function slugify(name) {
  const s = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'unnamed';
}

/** Maps each distinct name to its slug, throwing if two DIFFERENT names
 *  collide on one slug. A collision would silently make one page
 *  unreachable, so it must fail the build rather than be tolerated. */
export function assertNoCollisions(names, label) {
  const bySlug = new Map();
  const out = new Map();
  for (const name of names) {
    const slug = slugify(name);
    const seen = bySlug.get(slug);
    if (seen !== undefined && seen !== name) {
      throw new Error(
        `slug collision (${label}): "${seen}" and "${name}" both slug to "${slug}"`);
    }
    bySlug.set(slug, name);
    out.set(name, slug);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/slug.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/slug.mjs tests/slug.test.js
git commit -m "feat: add slug generation with build-failing collision detection"
```

---

### Task 2: Region totals crawler

Long-running (~46 min) and network-bound. Resumability is a hard requirement: the previous national crawl died twice mid-run (disk exhaustion, and an orphaned duplicate process double-writing).

**Files:**
- Create: `scripts/crawl-totals.mjs`
- Create: `scripts/lib/kys.mjs`
- Test: `tests/kys.test.js`
- Modify: `package.json` (add `data:totals` script)

**Interfaces:**
- Consumes: `.data-src/india_girls_toilet.ndjson` (existing crawl output; carries `_districtId`, `_districtName`, `_stateName`).
- Produces: `.data-src/region-totals.ndjson`; `parseTotals(json)`, `alreadyDone(lines)` from `scripts/lib/kys.mjs`.

- [ ] **Step 1: Write the failing test**

```js
// tests/kys.test.js
import { describe, it, expect } from 'vitest';
import { parseTotals, alreadyDone } from '../scripts/lib/kys.mjs';

describe('parseTotals', () => {
  const ok = {
    httpStatus: 200, status: true, message: 'success',
    data: { yearId: 11, regionId: 3826, totSch: 1955, totSchGirlsCoed: 1947,
            totSchNotHaveGirlsToilet: 4, totSchHaveGirlsToiletButNotFunc: 12 },
  };

  it('extracts the four counts we need', () => {
    expect(parseTotals(ok)).toEqual({
      total: 1955, girlsCoed: 1947, noToilet: 4, nonFunctional: 12,
    });
  });
  it('returns null for an error payload rather than throwing', () => {
    expect(parseTotals({ status: false, error: { message: 'nope' } })).toBeNull();
  });
  it('returns null when the data block is missing', () => {
    expect(parseTotals({ status: true })).toBeNull();
  });
});

describe('alreadyDone', () => {
  it('collects region ids from previously written NDJSON lines', () => {
    const lines = [
      JSON.stringify({ level: 'district', regionId: 3826 }),
      JSON.stringify({ level: 'block', regionId: 38105 }),
    ];
    const done = alreadyDone(lines);
    expect(done.has(3826)).toBe(true);
    expect(done.has(38105)).toBe(true);
    expect(done.has(999)).toBe(false);
  });
  it('ignores malformed lines instead of crashing the resume', () => {
    const done = alreadyDone(['not json', JSON.stringify({ regionId: 7 })]);
    expect(done.has(7)).toBe(true);
    expect(done.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kys.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/kys.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/kys.mjs
export const KYS_BASE = 'https://kys.udiseplus.gov.in/web-app/api/';
export const YEAR_ID = 11; // 2024-25

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Referer: 'https://kys.udiseplus.gov.in/',
  Accept: 'application/json',
};

export async function kysGet(path, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(KYS_BASE + path, { headers: HEADERS });
      return await res.json();
    } catch (err) {
      if (i === tries - 1) return { status: false, error: { message: String(err) } };
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    }
  }
}

/** Pulls the four counts out of a region-totals response, or null if the
 *  API returned an error shape. Never throws — a single bad region must not
 *  abort a 46-minute crawl. */
export function parseTotals(json) {
  const d = json?.data;
  if (!json?.status || !d) return null;
  return {
    total: d.totSch,
    girlsCoed: d.totSchGirlsCoed,
    noToilet: d.totSchNotHaveGirlsToilet,
    nonFunctional: d.totSchHaveGirlsToiletButNotFunc,
  };
}

/** Region ids already present in a partially written output file. */
export function alreadyDone(lines) {
  const done = new Set();
  for (const ln of lines) {
    try {
      const id = JSON.parse(ln).regionId;
      if (id !== undefined) done.add(id);
    } catch { /* skip malformed trailing line from an interrupted write */ }
  }
  return done;
}
```

```js
// scripts/crawl-totals.mjs
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { kysGet, parseTotals, alreadyDone, YEAR_ID } from './lib/kys.mjs';
import { dedupeDistricts } from './lib/normalise.mjs';

const NDJSON = '.data-src/india_girls_toilet.ndjson';
const OUT = '.data-src/region-totals.ndjson';
const DELAY = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('.data-src', { recursive: true });

const districts = dedupeDistricts(
  readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const done = alreadyDone(
  existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean) : []);
console.log(`districts: ${districts.length}, region ids already done: ${done.size}`);

const write = (row) => appendFileSync(OUT, JSON.stringify(row) + '\n');

let n = 0;
for (const d of districts) {
  const ctx = { state: d._stateName, district: d._districtName };

  if (!done.has(d._districtId)) {
    const t = parseTotals(await kysGet(
      `schools-girls-toilet-facility-count-by-region-id?yearId=${YEAR_ID}&regionId=${d._districtId}`));
    if (t) write({ level: 'district', regionId: d._districtId, ...ctx, ...t });
    await sleep(DELAY);
  }

  // Block ids are not in the existing crawl output, so fetch the block list
  // for this district before its per-block totals.
  const blocks = (await kysGet(`blocks?districtId=${d._districtId}&yearId=${YEAR_ID}`))?.data ?? [];
  await sleep(DELAY);

  for (const b of blocks) {
    if (done.has(b.blockId)) continue;
    const t = parseTotals(await kysGet(
      `schools-girls-toilet-facility-count-by-region-id?yearId=${YEAR_ID}&regionId=${b.blockId}`));
    if (t) write({ level: 'block', regionId: b.blockId, ...ctx, block: b.blockName, ...t });
    await sleep(DELAY);
  }

  if (++n % 25 === 0) console.log(`[${n}/${districts.length}] ${ctx.state} ${ctx.district}`);
}
console.log('DONE');
```

Add to `package.json` `scripts`:
```json
"data:totals": "node scripts/crawl-totals.mjs"
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/kys.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the real crawl**

Run: `npm run data:totals`
Expected: ~46 minutes, prints progress every 25 districts, writes `.data-src/region-totals.ndjson`.

Run it in the background and let it finish. If it dies, re-run the same command — it resumes.

**Verify before continuing:**
```bash
wc -l .data-src/region-totals.ndjson
node -e "
const rows=require('fs').readFileSync('.data-src/region-totals.ndjson','utf8').split('\n').filter(Boolean).map(JSON.parse);
const d=rows.filter(r=>r.level==='district').length, b=rows.filter(r=>r.level==='block').length;
console.log('district rows:',d,'(expect ~725)');
console.log('block rows:',b,'(expect ~5,403)');
"
```
If district rows are well under 725 or block rows well under 5,403, stop and report — do not build aggregates on partial data.

- [ ] **Step 6: Commit**

```bash
git add scripts/crawl-totals.mjs scripts/lib/kys.mjs tests/kys.test.js package.json
git commit -m "feat: add resumable region-totals crawler"
```

---

### Task 3: Aggregate rollup

**Files:**
- Create: `scripts/lib/aggregate.mjs`
- Create: `scripts/build-aggregates.mjs`
- Test: `tests/aggregate.test.js`
- Modify: `package.json` (add `data:agg` script)

**Interfaces:**
- Consumes: `slugify`, `assertNoCollisions` from `scripts/lib/slug.mjs`; `.data-src/joined.json`; `.data-src/region-totals.ndjson`.
- Produces: `buildTree(schools, totals): Tree` from `scripts/lib/aggregate.mjs`; writes `.data-src/aggregates.json`.

Tree shape (every node has the same stat fields):
```
{ national: {flagged,total,rate,noToilet,nonFunctional},
  states: [ {slug,name,flagged,total,rate,noToilet,nonFunctional,
             districts: [ {slug,name,...,blocks:[ {slug,name,...,schools:[{udise,name,indicator}]} ]} ]} ] }
```

- [ ] **Step 1: Write the failing test**

```js
// tests/aggregate.test.js
import { describe, it, expect } from 'vitest';
import { buildTree, rate } from '../scripts/lib/aggregate.mjs';

const schools = [
  { udise: '11111111111', name: 'A', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', indicator: 'no_girls_toilet' },
  { udise: '22222222222', name: 'B', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', indicator: 'girls_toilet_nonfunctional' },
  { udise: '33333333333', name: 'C', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'SHELLA', indicator: 'no_girls_toilet' },
  { udise: '44444444444', name: 'D', state: 'ASSAM', district: 'KAMRUP', block: 'RANI', indicator: 'no_girls_toilet' },
];

const totals = [
  { level: 'district', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', girlsCoed: 300 },
  { level: 'block', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', girlsCoed: 100 },
  { level: 'block', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'SHELLA', girlsCoed: 50 },
  { level: 'district', state: 'ASSAM', district: 'KAMRUP', girlsCoed: 200 },
  { level: 'block', state: 'ASSAM', district: 'KAMRUP', block: 'RANI', girlsCoed: 80 },
];

describe('rate', () => {
  it('computes a percentage', () => {
    expect(rate(16, 1947)).toBeCloseTo(0.82, 2);
  });
  it('returns null rather than Infinity when the denominator is missing', () => {
    expect(rate(5, 0)).toBeNull();
    expect(rate(5, null)).toBeNull();
  });
});

describe('buildTree', () => {
  const tree = buildTree(schools, totals);

  it('rolls block counts up into their district', () => {
    const ekh = tree.states.find((s) => s.name === 'MEGHALAYA').districts[0];
    const blockSum = ekh.blocks.reduce((n, b) => n + b.flagged, 0);
    expect(blockSum).toBe(ekh.flagged);
    expect(ekh.flagged).toBe(3);
  });

  it('rolls district counts up into their state', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    const distSum = meg.districts.reduce((n, d) => n + d.flagged, 0);
    expect(distSum).toBe(meg.flagged);
  });

  it('rolls state counts up into the national total', () => {
    const stateSum = tree.states.reduce((n, s) => n + s.flagged, 0);
    expect(stateSum).toBe(tree.national.flagged);
    expect(tree.national.flagged).toBe(4);
  });

  it('splits the two indicators and they sum to flagged', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    expect(meg.noToilet + meg.nonFunctional).toBe(meg.flagged);
    expect(meg.noToilet).toBe(2);
    expect(meg.nonFunctional).toBe(1);
  });

  it('uses the girls/co-ed denominator for rate, not total schools', () => {
    const mylliem = tree.states.find((s) => s.name === 'MEGHALAYA')
      .districts[0].blocks.find((b) => b.name === 'MYLLIEM');
    expect(mylliem.rate).toBeCloseTo(2.0, 5); // 2 of 100
  });

  it('sorts states by rate descending', () => {
    const rates = tree.states.map((s) => s.rate);
    expect(rates[0]).toBeGreaterThanOrEqual(rates[1]);
  });

  it('slugs every level', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    expect(meg.slug).toBe('meghalaya');
    expect(meg.districts[0].slug).toBe('east-khasi-hills');
  });

  it('leaves rate null when a region had no totals row, rather than guessing', () => {
    const orphan = buildTree(
      [{ udise: '5', name: 'E', state: 'X', district: 'Y', block: 'Z', indicator: 'no_girls_toilet' }],
      []);
    expect(orphan.states[0].rate).toBeNull();
    expect(orphan.states[0].flagged).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/aggregate.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/aggregate.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/aggregate.mjs
import { slugify, assertNoCollisions } from './slug.mjs';

/** Percentage, or null when there is no usable denominator. Returning null
 *  rather than 0 or Infinity keeps "we don't know" distinct from "zero". */
export function rate(flagged, denom) {
  if (!denom || !Number.isFinite(denom) || denom <= 0) return null;
  return (flagged / denom) * 100;
}

const blank = () => ({ flagged: 0, noToilet: 0, nonFunctional: 0 });

function tally(node, indicator) {
  node.flagged += 1;
  if (indicator === 'no_girls_toilet') node.noToilet += 1;
  else node.nonFunctional += 1;
}

const byRateDesc = (a, b) => (b.rate ?? -1) - (a.rate ?? -1);

export function buildTree(schools, totals) {
  const denom = new Map();
  for (const t of totals) {
    const key = t.level === 'district'
      ? `${t.state}|${t.district}`
      : `${t.state}|${t.district}|${t.block}`;
    denom.set(key, t.girlsCoed);
  }

  const states = new Map();
  for (const s of schools) {
    if (!states.has(s.state)) states.set(s.state, { name: s.state, ...blank(), districts: new Map() });
    const st = states.get(s.state);
    tally(st, s.indicator);

    if (!st.districts.has(s.district)) {
      st.districts.set(s.district, { name: s.district, ...blank(), blocks: new Map() });
    }
    const dt = st.districts.get(s.district);
    tally(dt, s.indicator);

    const bname = s.block ?? 'UNKNOWN';
    if (!dt.blocks.has(bname)) dt.blocks.set(bname, { name: bname, ...blank(), schools: [] });
    const bl = dt.blocks.get(bname);
    tally(bl, s.indicator);
    bl.schools.push({ udise: s.udise, name: s.name, indicator: s.indicator });
  }

  assertNoCollisions([...states.keys()], 'state');

  const outStates = [...states.values()].map((st) => {
    assertNoCollisions([...st.districts.keys()], `district in ${st.name}`);
    const districts = [...st.districts.values()].map((dt) => {
      assertNoCollisions([...dt.blocks.keys()], `block in ${dt.name}`);
      const blocks = [...dt.blocks.values()].map((bl) => ({
        slug: slugify(bl.name), name: bl.name,
        flagged: bl.flagged, noToilet: bl.noToilet, nonFunctional: bl.nonFunctional,
        total: denom.get(`${st.name}|${dt.name}|${bl.name}`) ?? null,
        rate: rate(bl.flagged, denom.get(`${st.name}|${dt.name}|${bl.name}`)),
        schools: bl.schools.sort((a, b) => a.name.localeCompare(b.name)),
      })).sort(byRateDesc);

      const dTotal = denom.get(`${st.name}|${dt.name}`) ?? null;
      return {
        slug: slugify(dt.name), name: dt.name,
        flagged: dt.flagged, noToilet: dt.noToilet, nonFunctional: dt.nonFunctional,
        total: dTotal, rate: rate(dt.flagged, dTotal), blocks,
      };
    }).sort(byRateDesc);

    const sTotal = districts.reduce((n, d) => n + (d.total ?? 0), 0) || null;
    return {
      slug: slugify(st.name), name: st.name,
      flagged: st.flagged, noToilet: st.noToilet, nonFunctional: st.nonFunctional,
      total: sTotal, rate: rate(st.flagged, sTotal), districts,
    };
  }).sort(byRateDesc);

  const national = {
    flagged: outStates.reduce((n, s) => n + s.flagged, 0),
    noToilet: outStates.reduce((n, s) => n + s.noToilet, 0),
    nonFunctional: outStates.reduce((n, s) => n + s.nonFunctional, 0),
    total: outStates.reduce((n, s) => n + (s.total ?? 0), 0) || null,
  };
  national.rate = rate(national.flagged, national.total);

  return { national, states: outStates };
}
```

```js
// scripts/build-aggregates.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTree } from './lib/aggregate.mjs';

const schools = JSON.parse(readFileSync('.data-src/joined.json', 'utf8'));
const totals = readFileSync('.data-src/region-totals.ndjson', 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const tree = buildTree(schools, totals);

const nBlocks = tree.states.reduce((n, s) =>
  n + s.districts.reduce((m, d) => m + d.blocks.length, 0), 0);
const noRate = tree.states.reduce((n, s) =>
  n + s.districts.reduce((m, d) => m + d.blocks.filter((b) => b.rate === null).length, 0), 0);

console.log(`states: ${tree.states.length}`);
console.log(`districts: ${tree.states.reduce((n, s) => n + s.districts.length, 0)}`);
console.log(`blocks: ${nBlocks}  (without a rate: ${noRate})`);
console.log(`flagged: ${tree.national.flagged.toLocaleString()}`);

writeFileSync('.data-src/aggregates.json', JSON.stringify(tree));
```

Add to `package.json` `scripts`:
```json
"data:agg": "node scripts/build-aggregates.mjs"
```

- [ ] **Step 4: Run test to verify it passes, then build for real**

Run: `npx vitest run tests/aggregate.test.js`
Expected: PASS (10 tests)

Run: `npm run data:agg`
Expected: ~32 states, ~725 districts, ~5,403 blocks, 78,744 flagged.

**Report the "without a rate" count.** Block names in the flagged data come from school records while denominators come from the blocks API; if those name spellings disagree, blocks lose their rate. If more than ~5% of blocks lack a rate, stop and report rather than shipping pages with missing percentages.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/aggregate.mjs scripts/build-aggregates.mjs tests/aggregate.test.js package.json
git commit -m "feat: roll flagged schools and region totals into an aggregate tree"
```

---

### Task 4: HTML rendering

**Files:**
- Create: `scripts/lib/render.mjs`
- Test: `tests/render.test.js`

**Interfaces:**
- Consumes: tree nodes from `scripts/lib/aggregate.mjs`.
- Produces: `esc(s)`, `fmtRate(r)`, `renderPage({title, description, canonical, breadcrumb, headline, table, extra})`, `renderStatePage(state)`, `renderDistrictPage(state, district)`, `renderBlockPage(state, district, block)`, `renderIndexPage(tree)` — all returning HTML strings.

- [ ] **Step 1: Write the failing test**

```js
// tests/render.test.js
import { describe, it, expect } from 'vitest';
import { esc, fmtRate, renderBlockPage, renderStatePage, renderIndexPage }
  from '../scripts/lib/render.mjs';

const block = { slug: 'mylliem', name: 'MYLLIEM', flagged: 7, total: 196, rate: 3.571,
  noToilet: 4, nonFunctional: 3,
  schools: [{ udise: '17040300201', name: 'GOVT LP MYLLIEM', indicator: 'no_girls_toilet' }] };
const district = { slug: 'east-khasi-hills', name: 'EAST KHASI HILLS', flagged: 312,
  total: 1204, rate: 25.9, noToilet: 200, nonFunctional: 112, blocks: [block] };
const state = { slug: 'meghalaya', name: 'MEGHALAYA', flagged: 4326, total: 14555,
  rate: 29.7, noToilet: 2601, nonFunctional: 1725, districts: [district] };
const tree = { national: { flagged: 78744, total: 1460759, rate: 5.39,
  noToilet: 39558, nonFunctional: 48324 }, states: [state] };

describe('esc', () => {
  it('escapes HTML so a school name cannot inject markup', () => {
    expect(esc('<img onerror=x>')).not.toContain('<img');
  });
  it('escapes quotes, which matter inside attributes', () => {
    expect(esc('a"b')).toBe('a&quot;b');
  });
});

describe('fmtRate', () => {
  it('formats a percentage to one decimal', () => {
    expect(fmtRate(3.571)).toBe('3.6%');
  });
  it('renders an explicit dash when the rate is unknown', () => {
    expect(fmtRate(null)).toBe('—');
  });
});

describe('renderBlockPage', () => {
  const html = renderBlockPage(state, district, block);

  it('names the source and year, per the parent spec', () => {
    expect(html).toContain('UDISE+ 2024-25');
  });
  it('lists the block\'s schools with their UDISE codes', () => {
    expect(html).toContain('GOVT LP MYLLIEM');
    expect(html).toContain('17040300201');
  });
  it('compares the block rate to its district and state, so the page is not a bare template', () => {
    expect(html).toMatch(/EAST KHASI HILLS/);
    expect(html).toMatch(/MEGHALAYA/);
    expect(html).toContain('25.9%');
  });
  it('renders a breadcrumb back up the hierarchy', () => {
    expect(html).toContain('/state/meghalaya');
    expect(html).toContain('/state/meghalaya/east-khasi-hills');
  });
  it('does NOT load the SPA bundle', () => {
    expect(html).not.toContain('main.js');
  });
  it('sets a canonical URL', () => {
    expect(html).toContain('rel="canonical"');
  });
});

describe('renderStatePage', () => {
  it('lists districts with their rates', () => {
    const html = renderStatePage(state);
    expect(html).toContain('EAST KHASI HILLS');
    expect(html).toContain('25.9%');
  });
});

describe('renderIndexPage', () => {
  const html = renderIndexPage(tree);
  it('shows the national headline figure', () => {
    expect(html).toContain('78,744');
  });
  it('lists states', () => {
    expect(html).toContain('MEGHALAYA');
  });
  it('DOES load the SPA bundle, for the map section below the fold', () => {
    expect(html).toContain('main.js');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/render.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/render.mjs
// Import rather than re-declare: the spec requires the source year to be
// structurally impossible to omit or drift. src/config.js imports cleanly
// under plain Node (its import.meta.env access is optional-chained).
import { SOURCE_YEAR } from '../../src/config.js';

export const SITE = 'https://shaala-flax.vercel.app';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtRate = (r) => (r === null || r === undefined ? '—' : `${r.toFixed(1)}%`);
const fmtNum = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'));

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

export function renderPage({ title, description, canonical, breadcrumb, headline, table, extra = '', spa = false }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<script>(function(){var t=localStorage.getItem('shaala.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;})();</script>
<link rel="stylesheet" href="/browse.css" />
</head>
<body class="browse">
<nav class="crumb">${breadcrumb}</nav>
<header class="head">${headline}</header>
${table}
${extra}
<footer class="foot">
  <p>Figures as reported by schools to ${esc(SOURCE_YEAR)}. We publish them as
     the school’s own record, not as our finding.</p>
  <p><a href="/#/methodology">How this works</a></p>
</footer>
${spa ? '<script type="module" src="/src/main.js"></script>' : ''}
</body>
</html>`;
}

const crumb = (parts) =>
  parts.map((p, i) => (p.href && i < parts.length - 1
    ? `<a href="${esc(p.href)}">${esc(p.label)}</a>`
    : `<span>${esc(p.label)}</span>`)).join(' › ');

const statRow = (label, href, flagged, total, rate) => `
  <tr>
    <td><a href="${esc(href)}">${esc(label)}</a></td>
    <td class="num">${fmtNum(flagged)}</td>
    <td class="num">${fmtNum(total)}</td>
    <td class="num rate">${fmtRate(rate)}</td>
  </tr>`;

const statTable = (rows) => `
<table class="stats">
  <thead><tr><th>Name</th><th class="num">Flagged</th><th class="num">Schools</th><th class="num">Rate</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;

export function renderIndexPage(tree) {
  return renderPage({
    spa: true,
    title: `${fmtNum(tree.national.flagged)} Indian government schools flagged for girls’ toilets`,
    description: `${fmtNum(tree.national.flagged)} schools are recorded in ${SOURCE_YEAR} as having no girls’ toilet or one that does not function. Browse by state and district.`,
    canonical: `${SITE}/`,
    breadcrumb: crumb([{ label: 'India' }]),
    headline: `<h1>${fmtNum(tree.national.flagged)} schools flagged</h1>
      <p class="sub">${fmtNum(tree.national.noToilet)} have no girls’ toilet ·
        ${fmtNum(tree.national.nonFunctional)} have one that does not function</p>`,
    table: statTable(tree.states.map((s) =>
      statRow(s.name, `/state/${s.slug}`, s.flagged, s.total, s.rate)).join('')),
    extra: `<section class="map-section"><h2>Where reports are</h2><div id="map"></div>
      <header id="topbar"></header><aside id="sheet" hidden></aside>
      <div id="submit-root" hidden></div><div id="admin-root" hidden></div>
      <div id="toast" hidden></div></section>`,
  });
}

export function renderStatePage(state) {
  return renderPage({
    title: `${state.name} — ${fmtNum(state.flagged)} schools flagged for girls’ toilets`,
    description: `${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools in ${state.name} (${fmtRate(state.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' }, { label: state.name }]),
    headline: `<h1>${esc(state.name)}</h1>
      <p class="sub">${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools flagged
        (<strong>${fmtRate(state.rate)}</strong>)</p>`,
    table: statTable(state.districts.map((d) =>
      statRow(d.name, `/state/${state.slug}/${d.slug}`, d.flagged, d.total, d.rate)).join('')),
  });
}

export function renderDistrictPage(state, district) {
  return renderPage({
    title: `${district.name}, ${state.name} — ${fmtNum(district.flagged)} schools flagged`,
    description: `${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools in ${district.name} district (${fmtRate(district.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` }, { label: district.name }]),
    headline: `<h1>${esc(district.name)}</h1>
      <p class="sub">${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools flagged
        (<strong>${fmtRate(district.rate)}</strong>) · ${esc(state.name)} average ${fmtRate(state.rate)}</p>`,
    table: statTable(district.blocks.map((b) =>
      statRow(b.name, `/state/${state.slug}/${district.slug}/${b.slug}`, b.flagged, b.total, b.rate)).join('')),
  });
}

export function renderBlockPage(state, district, block) {
  const cmp = block.rate === null || district.rate === null ? ''
    : ` — ${block.rate > district.rate ? 'above' : 'below'} the ${esc(district.name)}
        average of ${fmtRate(district.rate)}, and the ${esc(state.name)} average of ${fmtRate(state.rate)}`;

  const rows = block.schools.map((s) => `
    <tr>
      <td>${esc(s.name)}</td>
      <td class="udise">${esc(s.udise)}</td>
      <td>${esc(INDICATOR_TEXT[s.indicator] ?? 'Unknown')}</td>
    </tr>`).join('');

  return renderPage({
    title: `${block.name}, ${district.name} — ${fmtNum(block.flagged)} schools flagged`,
    description: `${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools in ${block.name}, ${district.name} (${fmtRate(block.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}/${block.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` },
      { label: district.name, href: `/state/${state.slug}/${district.slug}` },
      { label: block.name }]),
    headline: `<h1>${esc(block.name)}</h1>
      <p class="sub">${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools flagged
        (<strong>${fmtRate(block.rate)}</strong>)${cmp}</p>`,
    table: `<table class="stats schools">
      <thead><tr><th>School</th><th>UDISE</th><th>Reported issue</th></tr></thead>
      <tbody>${rows}</tbody></table>`,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/render.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/render.mjs tests/render.test.js
git commit -m "feat: add static page templates for browse hierarchy"
```

---

### Task 5: Prerender pages and sitemap

**Files:**
- Create: `scripts/prerender.mjs`
- Create: `scripts/lib/sitemap.mjs`
- Test: `tests/sitemap.test.js`
- Modify: `package.json` (add `data:pages`, and chain into `build`)

**Interfaces:**
- Consumes: `renderIndexPage`, `renderStatePage`, `renderDistrictPage`, `renderBlockPage` from `scripts/lib/render.mjs`; `.data-src/aggregates.json`.
- Produces: `collectUrls(tree): string[]`, `renderSitemap(urls, site): string` from `scripts/lib/sitemap.mjs`; writes `public/index.html`, `public/state/**/index.html`, `public/sitemap.xml`, `public/robots.txt`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sitemap.test.js
import { describe, it, expect } from 'vitest';
import { collectUrls, renderSitemap } from '../scripts/lib/sitemap.mjs';

const tree = { national: {}, states: [{
  slug: 'meghalaya', name: 'MEGHALAYA', districts: [{
    slug: 'east-khasi-hills', name: 'EAST KHASI HILLS',
    blocks: [{ slug: 'mylliem', name: 'MYLLIEM' }, { slug: 'shella', name: 'SHELLA' }],
  }],
}] };

describe('collectUrls', () => {
  const urls = collectUrls(tree);

  it('includes the root, every state, district, and block exactly once', () => {
    expect(urls).toEqual([
      '/',
      '/state/meghalaya',
      '/state/meghalaya/east-khasi-hills',
      '/state/meghalaya/east-khasi-hills/mylliem',
      '/state/meghalaya/east-khasi-hills/shella',
    ]);
  });
  it('produces no duplicates', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap(['/', '/state/meghalaya'], 'https://example.org');

  it('emits absolute URLs', () => {
    expect(xml).toContain('<loc>https://example.org/</loc>');
    expect(xml).toContain('<loc>https://example.org/state/meghalaya</loc>');
  });
  it('emits a valid urlset envelope', () => {
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });
  it('escapes ampersands, which would otherwise be invalid XML', () => {
    expect(renderSitemap(['/a&b'], 'https://x.org')).toContain('/a&amp;b');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sitemap.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/sitemap.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/sitemap.mjs

/** Every URL the prerenderer will write, in stable order. Derived from the
 *  same tree prerender walks, so the sitemap cannot drift from the pages. */
export function collectUrls(tree) {
  const urls = ['/'];
  for (const s of tree.states) {
    urls.push(`/state/${s.slug}`);
    for (const d of s.districts) {
      urls.push(`/state/${s.slug}/${d.slug}`);
      for (const b of d.blocks) urls.push(`/state/${s.slug}/${d.slug}/${b.slug}`);
    }
  }
  return urls;
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSitemap(urls, site) {
  const body = urls.map((u) => `  <url><loc>${xmlEsc(site + u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}
```

```js
// scripts/prerender.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderIndexPage, renderStatePage, renderDistrictPage, renderBlockPage, SITE } from './lib/render.mjs';
import { collectUrls, renderSitemap } from './lib/sitemap.mjs';

const tree = JSON.parse(readFileSync('.data-src/aggregates.json', 'utf8'));

// Clear previously generated pages so a removed region cannot linger as a
// stale page that the sitemap no longer lists.
rmSync('public/state', { recursive: true, force: true });

const write = (urlPath, html) => {
  const file = urlPath === '/' ? 'public/index.html' : `public${urlPath}/index.html`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

write('/', renderIndexPage(tree));
let n = 1;
for (const s of tree.states) {
  write(`/state/${s.slug}`, renderStatePage(s)); n++;
  for (const d of s.districts) {
    write(`/state/${s.slug}/${d.slug}`, renderDistrictPage(s, d)); n++;
    for (const b of d.blocks) {
      write(`/state/${s.slug}/${d.slug}/${b.slug}`, renderBlockPage(s, d, b)); n++;
    }
  }
}

const urls = collectUrls(tree);
if (urls.length !== n) throw new Error(`sitemap/page mismatch: ${urls.length} urls vs ${n} pages`);

writeFileSync('public/sitemap.xml', renderSitemap(urls, SITE));
writeFileSync('public/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`wrote ${n.toLocaleString()} pages + sitemap.xml`);
```

Add to `package.json` `scripts`:
```json
"data:pages": "node scripts/prerender.mjs"
```

**Important:** `index.html` at the repo root is Vite's entry and is NOT the generated one. The generated `public/index.html` would collide with it. Resolve by having Vite build first and prerender write into `dist/` instead of `public/` — change the two paths in `prerender.mjs` from `public/` to `dist/` and chain the build:

```json
"build": "npm run validate && vite build && npm run data:pages"
```

- [ ] **Step 4: Run test to verify it passes, then generate**

Run: `npx vitest run tests/sitemap.test.js`
Expected: PASS (5 tests)

Run: `npm run build`
Expected: `wrote 6,1xx pages + sitemap.xml`, and the page/sitemap count assertion does not throw.

Verify a real page and the counts:
```bash
grep -c "<url>" dist/sitemap.xml
find dist/state -name index.html | wc -l
cat dist/state/meghalaya/east-khasi-hills/mylliem/index.html | head -30
```

- [ ] **Step 5: Commit**

```bash
git add scripts/prerender.mjs scripts/lib/sitemap.mjs tests/sitemap.test.js package.json
git commit -m "feat: prerender browse pages and sitemap"
```

---

### Task 6: Browse stylesheet

**Files:**
- Create: `public/browse.css`

**Interfaces:**
- Consumes: the class names emitted by `scripts/lib/render.mjs` (`.browse`, `.crumb`, `.head`, `.stats`, `.num`, `.rate`, `.udise`, `.foot`, `.map-section`).
- Produces: no JS interface.

Reuses the theme tokens already defined in `src/style.css` by redeclaring them, since browse pages deliberately do not load the SPA's stylesheet.

- [ ] **Step 1: Write the stylesheet**

```css
/* public/browse.css — standalone; browse pages never load the SPA bundle. */
:root {
  --bg:#0d0d0f; --panel:#17171a; --panel-2:#1f1f24;
  --ink:#f4efe9; --body:#b9b2a8; --muted:#7c766d;
  --line:rgba(244,239,233,0.12); --admitted:#e0473e;
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --bg:#f7f5f2; --panel:#ffffff; --panel-2:#efece7;
    --ink:#17171a; --body:#4a453e; --muted:#8b8377;
    --line:rgba(23,23,26,0.12);
  }
}
:root[data-theme="light"] {
  --bg:#f7f5f2; --panel:#ffffff; --panel-2:#efece7;
  --ink:#17171a; --body:#4a453e; --muted:#8b8377;
  --line:rgba(23,23,26,0.12);
}
* { box-sizing:border-box; }
body.browse { margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
  max-width:900px; margin-inline:auto; padding:16px; }
.crumb { font-size:13px; color:var(--muted); margin-bottom:12px; }
.crumb a { color:var(--body); }
.head h1 { margin:0 0 4px; font-size:28px; }
.head .sub { margin:0 0 20px; color:var(--body); font-size:15px; }
table.stats { width:100%; border-collapse:collapse; }
table.stats th, table.stats td { padding:10px 8px; border-bottom:1px solid var(--line);
  text-align:left; }
table.stats th { font-size:12px; text-transform:uppercase; letter-spacing:.04em;
  color:var(--muted); font-weight:600; }
table.stats td.num, table.stats th.num { text-align:right; font-variant-numeric:tabular-nums; }
table.stats td.rate { font-weight:600; color:var(--admitted); }
table.stats td.udise { color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; }
table.stats a { color:var(--ink); text-decoration:none; }
table.stats a:hover { text-decoration:underline; }
.foot { margin-top:28px; padding-top:16px; border-top:1px solid var(--line);
  font-size:13px; color:var(--muted); }
.map-section { margin-top:32px; }
.map-section #map { position:relative; height:60vh; border-radius:10px; overflow:hidden; }
@media (max-width:600px) { .head h1 { font-size:22px; } table.stats th, table.stats td { padding:8px 4px; } }
```

- [ ] **Step 2: Verify it renders**

Run: `npm run build && npx serve dist -l 5199` (or any static server), open
`http://localhost:5199/state/meghalaya` and confirm the table is readable in
both light and dark.

- [ ] **Step 3: Commit**

```bash
git add public/browse.css
git commit -m "feat: add standalone stylesheet for browse pages"
```

---

### Task 7: Verify with JavaScript disabled

The spec's central claims are indexability and no-JS usability. Nothing so far proves either.

**Files:**
- Create: `scratch-browse-verify.mjs` (throwaway — delete before the final commit)

- [ ] **Step 1: Install Playwright and start a static server**

```bash
npm install --no-save playwright
npx playwright install chromium
npm run build
npx serve dist -l 5199 &
```

- [ ] **Step 2: Write and run the verification script**

```js
// scratch-browse-verify.mjs
import { chromium } from 'playwright';
const browser = await chromium.launch();

// javaScriptEnabled:false is the whole point — these pages must work without it.
const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 420, height: 900 } });

for (const path of ['/', '/state/meghalaya', '/state/meghalaya/east-khasi-hills']) {
  await page.goto('http://localhost:5199' + path, { waitUntil: 'domcontentloaded' });
  const rows = await page.locator('table.stats tbody tr').count();
  const h1 = await page.locator('h1').first().innerText();
  const hasSource = (await page.content()).includes('UDISE+ 2024-25');
  console.log(`${path} → h1="${h1}" rows=${rows} sourceYear=${hasSource}`);
  if (rows === 0) throw new Error(`no rows rendered at ${path} with JS disabled`);
  if (!hasSource) throw new Error(`missing source attribution at ${path}`);
  await page.screenshot({ path: `/tmp/browse-${path.replace(/\//g, '_')}.png` });
}
await browser.close();
console.log('OK — pages render with JavaScript disabled');
```

Run: `node scratch-browse-verify.mjs`
Expected: every path prints rows > 0 and `sourceYear=true`, then `OK`.

- [ ] **Step 3: Look at the screenshots**

Open the `/tmp/browse-*.png` files and confirm they are readable — a passing
assertion is not evidence the page looks right.

- [ ] **Step 4: Clean up and commit**

```bash
kill %1
rm scratch-browse-verify.mjs
npm uninstall playwright
rm -rf ~/Library/Caches/ms-playwright
npx vitest run
git add -A
git commit -m "test: verify browse pages render with JavaScript disabled"
```

---

## Deliberately not built in Phase 1

**Column-header click-to-sort.** The spec describes it as hydrating on top of
the pre-sorted rows. Rows already ship ordered worst-rate-first, which is the
ordering that matters, and the no-JS guarantee is met without it. Building a
sorting widget for ~6,160 static pages is cost without a clear reader need —
noted here so it is a recorded decision rather than a silent omission. Add it
later if anyone actually asks to re-sort.

## Definition of done for Phase 1

- [ ] `npm test` green (all suites, including the 5 pre-existing ones)
- [ ] `npm run build` completes and prints the page count
- [ ] `dist/sitemap.xml` `<url>` count equals the generated page count
- [ ] Every level renders with JavaScript disabled, screenshots reviewed
- [ ] Block pages state their rate against district and state averages
- [ ] Browse pages contain no reference to `main.js` (except `/`)
- [ ] **The "blocks without a rate" count from Task 3 is reported to the human**
