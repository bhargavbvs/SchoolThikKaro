# shaala Plan A — Data Pipeline + Public Map (AGENT A, runs LOCALLY)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Turn the crawled UDISE flags into per-state GeoJSON, and render them as a searchable national map with attributed pin detail.

**Architecture:** Build-time Node scripts join flags to coordinates and emit size-budgeted GeoJSON. The browser loads one state at a time. MapLibre renders clustered pins coloured by state.

**Tech Stack:** Node 20 ESM, MapLibre GL 4, Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-17-shaala-design.md`

**MUST RUN AFTER:** Plan 0, Task 4 committed.

**RUN THIS AGENT LOCALLY.** It needs two large local files that are not in git:
- `/private/tmp/claude-501/-Users-bhargavbvs/a8c5da9a-20de-47d6-8e4a-eb229f727cdf/scratchpad/india_girls_toilet.ndjson` (crawl output)
- `/private/tmp/claude-501/-Users-bhargavbvs/a8c5da9a-20de-47d6-8e4a-eb229f727cdf/scratchpad/udise_schools.csv` (377MB, 1,450,490 rows)

Copy both into `.data-src/` (gitignored) as the first action.

## Global Constraints

- **Zero-pad every UDISE code to 11 characters on BOTH sides of the join.** 469,756 of the 1.45M `schcd` values are 10 chars. Skipping this silently loses ~1/3 of matches.
- **Dedupe the crawl NDJSON on `_districtId`.** Two crawler processes ran concurrently; districts appear twice. `_districtId` is the dedupe key.
- Every pin's rendered detail MUST include the string `UDISE+ 2024-25` from `src/config.js` `SOURCE_YEAR`.
- Do not edit `index.html`, `src/config.js`, `src/lib/geo.js`, `src/lib/supabase.js`, or `supabase/schema.sql`.
- Per-state GeoJSON budget: **500KB** each. Fail the build if exceeded.

---

### Task 1: Dedupe and normalise the crawl output

**Files:**
- Create: `scripts/lib/normalise.mjs`
- Test: `tests/normalise.test.js`

**Interfaces:**
- Produces: `padUdise(code): string`, `dedupeDistricts(records): Array`, `flattenSchools(records): Array<{udise,name,state,district,block,indicator,category,management}>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/normalise.test.js
import { describe, it, expect } from 'vitest';
import { padUdise, dedupeDistricts, flattenSchools } from '../scripts/lib/normalise.mjs';

describe('padUdise', () => {
  it('pads a 10-char code to 11', () => {
    expect(padUdise('2813339019')).toBe('02813339019');
  });
  it('leaves an 11-char code untouched', () => {
    expect(padUdise('28133390196')).toBe('28133390196');
  });
  it('trims whitespace before padding', () => {
    expect(padUdise(' 2813339019 ')).toBe('02813339019');
  });
  it('coerces numbers, which is how leading zeros get lost', () => {
    expect(padUdise(2813339019)).toBe('02813339019');
  });
});

describe('dedupeDistricts', () => {
  it('keeps one record per districtId', () => {
    const recs = [
      { _districtId: 1, schools: [{ udiseSchCode: 'a' }] },
      { _districtId: 1, schools: [{ udiseSchCode: 'a' }] },
      { _districtId: 2, schools: [{ udiseSchCode: 'b' }] },
    ];
    expect(dedupeDistricts(recs)).toHaveLength(2);
  });
});

describe('flattenSchools', () => {
  it('flattens districts to schools with padded codes and indicator', () => {
    const recs = [{
      _districtId: 1, _districtName: 'ANAKAPALLI', _stateName: 'ANDHRA PRADESH',
      schools: [{
        udiseSchCode: '28133390196', schoolName: 'ST.PETERS HS ANKP',
        blockName: 'ANAKAPALLI', schCategoryDesc: 'Upper Pr. and Secondary',
        schMgmtNationalDesc: 'Private Unaided (Recognized) ',
        _indicator: 'girls_toilet_nonfunctional',
      }],
    }];
    expect(flattenSchools(recs)[0]).toEqual({
      udise: '28133390196', name: 'ST.PETERS HS ANKP',
      state: 'ANDHRA PRADESH', district: 'ANAKAPALLI', block: 'ANAKAPALLI',
      indicator: 'girls_toilet_nonfunctional',
      category: 'Upper Pr. and Secondary',
      management: 'Private Unaided (Recognized)',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/normalise.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/normalise.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/normalise.mjs
export function padUdise(code) {
  return String(code).trim().padStart(11, '0');
}

export function dedupeDistricts(records) {
  const seen = new Set();
  const out = [];
  for (const r of records) {
    if (seen.has(r._districtId)) continue;
    seen.add(r._districtId);
    out.push(r);
  }
  return out;
}

export function flattenSchools(records) {
  const out = [];
  for (const r of dedupeDistricts(records)) {
    for (const s of r.schools) {
      out.push({
        udise: padUdise(s.udiseSchCode),
        name: String(s.schoolName ?? '').trim(),
        state: r._stateName,
        district: r._districtName,
        block: s.blockName ?? null,
        indicator: s._indicator,
        category: (s.schCategoryDesc ?? '').trim() || null,
        management: (s.schMgmtNationalDesc ?? '').trim() || null,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/normalise.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: normalise and dedupe crawled UDISE flag data"
```

---

### Task 2: Join flags to coordinates and report the match rate

**Files:**
- Create: `scripts/join-coords.mjs`
- Create: `scripts/lib/coords.mjs`
- Test: `tests/join.test.js`

**Interfaces:**
- Consumes: `padUdise`, `flattenSchools` from `scripts/lib/normalise.mjs`.
- Produces: `buildCoordIndex(csvPath): Promise<Map<string,{lat,lng}>>` from `scripts/lib/coords.mjs`; writes `.data-src/joined.json` and prints a match-rate report.

- [ ] **Step 1: Write the failing test**

```js
// tests/join.test.js
import { describe, it, expect } from 'vitest';
import { joinSchools } from '../scripts/lib/coords.mjs';

describe('joinSchools', () => {
  const coords = new Map([
    ['28133390196', { lat: 17.6903, lng: 83.0418 }],
    ['02813339019', { lat: 10.0, lng: 77.0 }],
  ]);

  it('attaches coordinates when the code matches', () => {
    const [out] = joinSchools([{ udise: '28133390196', name: 'A' }], coords).matched;
    expect(out.lat).toBeCloseTo(17.6903);
  });

  it('matches a school whose coordinate row lost its leading zero', () => {
    const r = joinSchools([{ udise: '02813339019', name: 'B' }], coords);
    expect(r.matched).toHaveLength(1);
    expect(r.unmatched).toHaveLength(0);
  });

  it('reports unmatched schools rather than dropping them silently', () => {
    const r = joinSchools([{ udise: '99999999999', name: 'C' }], coords);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
    expect(r.matchRate).toBe(0);
  });

  it('computes a match rate across a mixed batch', () => {
    const r = joinSchools(
      [{ udise: '28133390196' }, { udise: '99999999999' }], coords);
    expect(r.matchRate).toBeCloseTo(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/join.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/coords.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/coords.mjs
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { padUdise } from './normalise.mjs';

export async function buildCoordIndex(csvPath) {
  const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });
  const map = new Map();
  let header = null;
  let iCode = -1, iLat = -1, iLng = -1;
  for await (const line of rl) {
    if (!header) {
      header = line.split(',');
      iCode = header.indexOf('schcd');
      iLat = header.indexOf('lat');
      iLng = header.indexOf('lon');
      continue;
    }
    const f = line.split(',');
    const lat = Number(f[iLat]), lng = Number(f[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    map.set(padUdise(f[iCode]), { lat, lng });
  }
  return map;
}

export function joinSchools(schools, coordIndex) {
  const matched = [], unmatched = [];
  for (const s of schools) {
    const c = coordIndex.get(padUdise(s.udise));
    if (c) matched.push({ ...s, lat: c.lat, lng: c.lng });
    else unmatched.push(s);
  }
  const total = schools.length;
  return { matched, unmatched, matchRate: total ? matched.length / total : 0 };
}
```

```js
// scripts/join-coords.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { flattenSchools } from './lib/normalise.mjs';
import { buildCoordIndex, joinSchools } from './lib/coords.mjs';

const NDJSON = '.data-src/india_girls_toilet.ndjson';
const CSV = '.data-src/udise_schools.csv';

const records = readFileSync(NDJSON, 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const schools = flattenSchools(records);
console.log(`flagged schools (deduped): ${schools.length.toLocaleString()}`);

const coords = await buildCoordIndex(CSV);
console.log(`coordinate index: ${coords.size.toLocaleString()}`);

const { matched, unmatched, matchRate } = joinSchools(schools, coords);
console.log(`matched:   ${matched.length.toLocaleString()}`);
console.log(`unmatched: ${unmatched.length.toLocaleString()}`);
console.log(`MATCH RATE: ${(matchRate * 100).toFixed(2)}%`);

const byState = {};
for (const u of unmatched) byState[u.state] = (byState[u.state] ?? 0) + 1;
console.log('worst unmatched states:',
  Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 8));

mkdirSync('.data-src', { recursive: true });
writeFileSync('.data-src/joined.json', JSON.stringify(matched));
writeFileSync('.data-src/unmatched.json', JSON.stringify(unmatched));
```

- [ ] **Step 4: Run test to verify it passes, then run for real**

Run: `npx vitest run tests/join.test.js`
Expected: PASS (4 tests)

Run: `npm run data:join`
Expected: prints a MATCH RATE. **Report this number before continuing** — it
is the project's biggest open unknown. If it is below 80%, stop and escalate.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: join UDISE flags to coordinates with zero-pad handling"
```

---

### Task 3: Emit per-state GeoJSON under a size budget

**Files:**
- Create: `scripts/build-geo.mjs`, `scripts/lib/budget.mjs`, `scripts/validate.mjs`
- Test: `tests/budget.test.js`

**Interfaces:**
- Consumes: `.data-src/joined.json`.
- Produces: `public/data/index.json`, `public/data/schools-<STATECODE>.geojson`; `assertBudget(path, maxBytes)` from `scripts/lib/budget.mjs`.

- [ ] **Step 1: Write the failing test**

```js
// tests/budget.test.js
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { assertBudget, stateCode } from '../scripts/lib/budget.mjs';

describe('assertBudget', () => {
  it('passes a file under budget', () => {
    mkdirSync('.tmp-test', { recursive: true });
    writeFileSync('.tmp-test/small.json', 'x'.repeat(100));
    expect(() => assertBudget('.tmp-test/small.json', 1000)).not.toThrow();
  });
  it('throws with the actual size when over budget', () => {
    mkdirSync('.tmp-test', { recursive: true });
    writeFileSync('.tmp-test/big.json', 'x'.repeat(2000));
    expect(() => assertBudget('.tmp-test/big.json', 1000)).toThrow(/2000/);
  });
});

describe('stateCode', () => {
  it('slugs a state name to a stable file-safe code', () => {
    expect(stateCode('ANDHRA PRADESH')).toBe('ANDHRA-PRADESH');
    expect(stateCode('JAMMU & KASHMIR')).toBe('JAMMU-KASHMIR');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/budget.test.js`
Expected: FAIL — cannot resolve `../scripts/lib/budget.mjs`

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/lib/budget.mjs
import { statSync } from 'node:fs';

export function assertBudget(path, maxBytes) {
  const size = statSync(path).size;
  if (size > maxBytes) {
    throw new Error(`${path} is ${size} bytes, over budget of ${maxBytes}`);
  }
  return size;
}

export function stateCode(name) {
  return String(name).toUpperCase().replace(/&/g, ' ')
    .replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
}
```

```js
// scripts/build-geo.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assertBudget, stateCode } from './lib/budget.mjs';

const BUDGET = 500 * 1024;
const matched = JSON.parse(readFileSync('.data-src/joined.json', 'utf8'));

const byState = new Map();
for (const s of matched) {
  const code = stateCode(s.state);
  if (!byState.has(code)) byState.set(code, []);
  byState.get(code).push(s);
}

mkdirSync('public/data', { recursive: true });
const index = { states: [] };

for (const [code, schools] of byState) {
  const gj = {
    type: 'FeatureCollection',
    features: schools.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(s.lng.toFixed(5)), Number(s.lat.toFixed(5))] },
      properties: {
        udise: s.udise, name: s.name, state: s.state,
        district: s.district, block: s.block, indicator: s.indicator,
      },
    })),
  };
  const file = `schools-${code}.geojson`;
  writeFileSync(`public/data/${file}`, JSON.stringify(gj));
  const size = assertBudget(`public/data/${file}`, BUDGET);
  index.states.push({ code, name: schools[0].state, count: schools.length, file, bytes: size });
}

index.states.sort((a, b) => a.name.localeCompare(b.name));
index.total = matched.length;
// The methodology page renders this as a disclosed limitation. It must be
// written here or that page silently claims 100% coverage.
const unmatched = JSON.parse(readFileSync('.data-src/unmatched.json', 'utf8'));
index.matchRate = matched.length / (matched.length + unmatched.length);
index.unmatched = unmatched.length;
writeFileSync('public/data/index.json', JSON.stringify(index, null, 2));
console.log(`wrote ${index.states.length} states, ${index.total.toLocaleString()} schools`);
```

```js
// scripts/validate.mjs
import { readFileSync, existsSync } from 'node:fs';

if (!existsSync('public/data/index.json')) {
  console.log('no built data yet — skipping validation');
  process.exit(0);
}
const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
let errors = 0;
for (const st of index.states) {
  const gj = JSON.parse(readFileSync(`public/data/${st.file}`, 'utf8'));
  for (const f of gj.features) {
    const p = f.properties;
    if (String(p.udise).length !== 11) { console.error(`bad udise length: ${p.udise}`); errors++; }
    if (!['no_girls_toilet', 'girls_toilet_nonfunctional'].includes(p.indicator)) {
      console.error(`bad indicator: ${p.indicator}`); errors++;
    }
    const [lng, lat] = f.geometry.coordinates;
    if (!(lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5)) {
      console.error(`coord outside India: ${p.udise} ${lat},${lng}`); errors++;
    }
  }
}
if (errors) { console.error(`VALIDATION FAILED: ${errors} errors`); process.exit(1); }
console.log(`validation passed: ${index.total.toLocaleString()} schools`);
```

- [ ] **Step 4: Run test to verify it passes, then build**

Run: `npx vitest run tests/budget.test.js`
Expected: PASS (3 tests)

Run: `npm run data:build && npm run validate`
Expected: per-state files written, validation passes. If any state exceeds
500KB, split that state by district and record the change here.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: emit per-state GeoJSON with size budget and validation"
```

---

### Task 4: Replace the schools.js stub with the real loader

**Files:**
- Modify: `src/lib/schools.js` (replaces the Plan 0 stub entirely)
- Test: `tests/schools.test.js`

**Interfaces:**
- Produces: `loadIndex()`, `loadState(stateCode)`, `getSchool(udiseCode)`, `searchSchools(query)`, `nearestSchools(lat, lng, n)`. Signatures for the first three are FROZEN by Plan 0 — Agent B calls them.

- [ ] **Step 1: Write the failing test**

```js
// tests/schools.test.js
import { describe, it, expect } from 'vitest';
import { getSchool, searchSchools, nearestSchools } from '../src/lib/schools.js';

describe('getSchool', () => {
  it('finds a school by exact 11-char code', async () => {
    const s = await getSchool('28133390196');
    expect(s.name).toBe('ST.PETERS HS ANKP');
    expect(s.sourceYear).toBe('UDISE+ 2024-25');
  });
  it('finds a school given a code that lost its leading zero', async () => {
    const s = await getSchool('2813339019');
    expect(s === null || s.udise.length === 11).toBe(true);
  });
  it('returns null for unknown codes', async () => {
    expect(await getSchool('99999999999')).toBeNull();
  });
});

describe('searchSchools', () => {
  it('matches on school name, case-insensitively', async () => {
    const r = await searchSchools('peters');
    expect(r.some((s) => s.udise === '28133390196')).toBe(true);
  });
  it('returns an empty array for no match, never null', async () => {
    expect(await searchSchools('zzzzznotathing')).toEqual([]);
  });
});

describe('nearestSchools', () => {
  it('orders by distance from the given point', async () => {
    const r = await nearestSchools(17.6903, 83.0418, 2);
    expect(r[0].udise).toBe('28133390196');
    expect(r[0].distanceM).toBeLessThan(r[1].distanceM);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/schools.test.js`
Expected: FAIL — `searchSchools is not a function`

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/schools.js
import { SOURCE_YEAR } from '../config.js';
import { haversineMeters } from './geo.js';

let _index = null;
const _states = new Map();
let _all = null;

function pad(code) { return String(code).trim().padStart(11, '0'); }

function toSchool(f) {
  return {
    udise: f.properties.udise,
    name: f.properties.name,
    state: f.properties.state,
    district: f.properties.district,
    block: f.properties.block ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    indicator: f.properties.indicator,
    sourceYear: SOURCE_YEAR,
  };
}

export async function loadIndex() {
  if (_index) return _index;
  const res = await fetch('/data/index.json');
  _index = await res.json();
  return _index;
}

export async function loadState(stateCode) {
  if (_states.has(stateCode)) return _states.get(stateCode);
  const idx = await loadIndex();
  const st = idx.states.find((s) => s.code === stateCode);
  if (!st) return { type: 'FeatureCollection', features: [] };
  const res = await fetch(`/data/${st.file}`);
  const gj = await res.json();
  _states.set(stateCode, gj);
  return gj;
}

async function loadAll() {
  if (_all) return _all;
  const idx = await loadIndex();
  const parts = await Promise.all(idx.states.map((s) => loadState(s.code)));
  _all = parts.flatMap((gj) => gj.features.map(toSchool));
  return _all;
}

export async function getSchool(udiseCode) {
  const all = await loadAll();
  const want = pad(udiseCode);
  return all.find((s) => s.udise === want) ?? null;
}

export async function searchSchools(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const all = await loadAll();
  if (/^\d{10,11}$/.test(q)) {
    const hit = all.find((s) => s.udise === pad(q));
    return hit ? [hit] : [];
  }
  return all.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.district.toLowerCase().includes(q)).slice(0, 50);
}

export async function nearestSchools(lat, lng, n = 10) {
  const all = await loadAll();
  return all
    .map((s) => ({ ...s, distanceM: haversineMeters(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, n);
}
```

**Note:** `loadAll()` fetching every state is acceptable for search only.
Do NOT call it on first paint — the map loads one state at a time.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/schools.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: implement real school loader with search and nearest"
```

---

### Task 5: Render the map with clustered, coloured pins

**Files:**
- Create: `src/map/map.js`, `src/map/pins.js`
- Modify: `src/main.js` (Agent A owns the map and methodology route registrations; do not touch the `/admin` route)
- Modify: `src/map/style-map.css`

**Interfaces:**
- Consumes: `loadIndex`, `loadState` from `src/lib/schools.js`.
- Produces: `initMap(containerId): Promise<maplibregl.Map>`, `showState(map, stateCode)` from `src/map/map.js`.

- [ ] **Step 1: Write the map module**

```js
// src/map/map.js
import maplibregl from 'maplibre-gl';
import { loadIndex, loadState } from '../lib/schools.js';
import { addPinLayers, setPinData } from './pins.js';

const DARK_RASTER = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

export async function initMap(containerId = 'map') {
  const map = new maplibregl.Map({
    container: containerId,
    style: DARK_RASTER,
    center: [78.9629, 22.5937],
    zoom: 3.8,
  });
  await new Promise((r) => map.on('load', r));
  addPinLayers(map);
  return map;
}

export async function showState(map, stateCode) {
  const gj = await loadState(stateCode);
  setPinData(map, gj);
  return gj.features.length;
}

export async function stateList() {
  const idx = await loadIndex();
  return idx.states;
}
```

```js
// src/map/pins.js
export const PIN_COLORS = {
  no_girls_toilet: '#e0473e',
  girls_toilet_nonfunctional: '#f0932b',
};

export function addPinLayers(map) {
  map.addSource('schools', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterRadius: 50,
    clusterMaxZoom: 11,
  });

  map.addLayer({
    id: 'clusters', type: 'circle', source: 'schools',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': '#e0473e',
      'circle-opacity': 0.75,
      'circle-radius': ['step', ['get', 'point_count'], 14, 50, 20, 500, 28],
    },
  });

  map.addLayer({
    id: 'cluster-count', type: 'symbol', source: 'schools',
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' },
  });

  map.addLayer({
    id: 'pins', type: 'circle', source: 'schools',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': 6,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(0,0,0,0.5)',
      'circle-color': [
        'match', ['get', 'indicator'],
        'no_girls_toilet', PIN_COLORS.no_girls_toilet,
        'girls_toilet_nonfunctional', PIN_COLORS.girls_toilet_nonfunctional,
        '#7c766d',
      ],
    },
  });
}

export function setPinData(map, geojson) {
  map.getSource('schools').setData(geojson);
}
```

Add to `src/main.js` (the single permitted edit — insert above `startRouter()`):

```js
import { initMap, showState } from './map/map.js';
import { openSheet } from './map/sheet.js';

onRoute(/^\/(?:$|state\/)/, async () => {
  const map = await initMap('map');
  const code = (window.location.hash.match(/state\/([A-Z-]+)/) || [])[1];
  if (code) await showState(map, code);
  map.on('click', 'pins', (e) => openSheet(e.features[0]));
  map.on('mouseenter', 'pins', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'pins', () => (map.getCanvas().style.cursor = ''));
});
```

`src/map/style-map.css`:
```css
#topbar { position:fixed; top:0; left:0; right:0; z-index:5; padding:10px 14px;
  background:rgba(13,13,15,0.82); backdrop-filter:blur(10px);
  border-bottom:1px solid var(--line); display:flex; gap:12px; align-items:center; }
```

- [ ] **Step 2: Verify in the browser**

Run: `npm run dev`
Expected: dark India map, clustered red/orange pins, clicking a pin opens the sheet (Task 6). Confirm no console errors.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: render clustered school pins on a dark India map"
```

---

### Task 6: Pin detail sheet with structural attribution

This is the task that enforces spec requirement 3. The attribution is not
decorative copy — the test asserts it cannot be omitted.

**Files:**
- Create: `src/map/sheet.js`
- Test: `tests/sheet.test.js`

**Interfaces:**
- Consumes: `openSubmitFlow(school)` from `src/submit/submit.js` (Agent B's stub until B lands).
- Produces: `renderSheetHTML(school): string`, `openSheet(props): void`.

- [ ] **Step 1: Write the failing test**

```js
// tests/sheet.test.js
import { describe, it, expect } from 'vitest';
import { renderSheetHTML, schoolFromFeature } from '../src/map/sheet.js';

const school = {
  udise: '28133390196', name: 'ST.PETERS HS ANKP',
  state: 'ANDHRA PRADESH', district: 'ANAKAPALLI', block: 'ANAKAPALLI',
  indicator: 'girls_toilet_nonfunctional',
};

describe('renderSheetHTML', () => {
  it('always names the source and year', () => {
    expect(renderSheetHTML(school)).toContain('UDISE+ 2024-25');
  });
  it('attributes the claim to the school, never asserting it as fact', () => {
    const html = renderSheetHTML(school);
    expect(html).toMatch(/as reported by this school/i);
  });
  it('shows the UDISE code so the claim is checkable', () => {
    expect(renderSheetHTML(school)).toContain('28133390196');
  });
  it('renders the human-readable indicator', () => {
    expect(renderSheetHTML(school)).toMatch(/not function/i);
  });
  it('escapes school names so a quote in a name cannot break out', () => {
    const evil = { ...school, name: '<img src=x onerror=alert(1)>' };
    expect(renderSheetHTML(evil)).not.toContain('<img');
  });
});

describe('schoolFromFeature', () => {
  it('lifts coordinates out of the geometry so the submit flow can use them', () => {
    const s = schoolFromFeature({
      properties: { udise: '28133390196', name: 'X', indicator: 'no_girls_toilet' },
      geometry: { coordinates: [83.0418, 17.6903] },
    });
    expect(s.lat).toBeCloseTo(17.6903);
    expect(s.lng).toBeCloseTo(83.0418);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sheet.test.js`
Expected: FAIL — cannot resolve `../src/map/sheet.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/map/sheet.js
import { SOURCE_YEAR } from '../config.js';
import { openSubmitFlow } from '../submit/submit.js';

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderSheetHTML(school) {
  return `
    <h2>${esc(school.name)}</h2>
    <p class="meta">${esc(school.district)}, ${esc(school.state)}</p>
    <p class="udise">UDISE ${esc(school.udise)}</p>
    <div class="claim">
      <p class="claim-label">As reported by this school to ${esc(SOURCE_YEAR)}:</p>
      <p class="claim-value">${esc(INDICATOR_TEXT[school.indicator] ?? 'Unknown')}</p>
    </div>
    <button id="sheet-report" type="button">Report what you found</button>
  `;
}

/** MapLibre feature.properties carries NO coordinates. The submit flow needs
 *  school.lat/lng to compute the distance tier, so merge the geometry in here.
 *  Passing bare `properties` is a bug: it yields NaN distances downstream. */
export function schoolFromFeature(feature) {
  return {
    ...feature.properties,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
    sourceYear: SOURCE_YEAR,
  };
}

export function openSheet(feature) {
  const school = schoolFromFeature(feature);
  const el = document.getElementById('sheet');
  el.innerHTML = renderSheetHTML(school);
  el.hidden = false;
  el.querySelector('#sheet-report')
    .addEventListener('click', () => openSubmitFlow(school));
}
```

Append to `src/map/style-map.css`:
```css
#sheet { position:fixed; right:0; bottom:0; left:0; z-index:6; max-height:60vh;
  overflow:auto; padding:16px; background:var(--panel);
  border-top:1px solid var(--line); }
#sheet .claim { margin:12px 0; padding:12px; background:var(--panel-2);
  border-left:3px solid var(--admitted); }
#sheet .claim-label { margin:0 0 4px; font-size:13px; color:var(--muted); }
#sheet .claim-value { margin:0; font-weight:600; }
#sheet .udise { font-size:12px; color:var(--muted); }
@media (min-width:800px) { #sheet { left:auto; top:0; width:380px; max-height:100vh; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sheet.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add pin sheet with structural source attribution"
```

---

### Task 7: Search, UDISE lookup, and near-me

**Files:**
- Create: `src/map/search.js`
- Test: `tests/search-ui.test.js`

**Interfaces:**
- Consumes: `searchSchools`, `nearestSchools` from `src/lib/schools.js`.
- Produces: `renderResultsHTML(results): string`, `mountSearch(el, onPick): void`.

- [ ] **Step 1: Write the failing test**

```js
// tests/search-ui.test.js
import { describe, it, expect } from 'vitest';
import { renderResultsHTML } from '../src/map/search.js';

describe('renderResultsHTML', () => {
  it('renders one row per result with its UDISE code', () => {
    const html = renderResultsHTML([
      { udise: '28133390196', name: 'ST.PETERS HS ANKP', district: 'ANAKAPALLI', state: 'ANDHRA PRADESH' },
    ]);
    expect(html).toContain('28133390196');
    expect(html).toContain('ST.PETERS HS ANKP');
  });
  it('shows an explicit empty state rather than blank markup', () => {
    expect(renderResultsHTML([])).toMatch(/no schools found/i);
  });
  it('escapes result names', () => {
    const html = renderResultsHTML([{ udise: '1', name: '<b>x</b>', district: 'd', state: 's' }]);
    expect(html).not.toContain('<b>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/search-ui.test.js`
Expected: FAIL — cannot resolve `../src/map/search.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/map/search.js
import { searchSchools, nearestSchools } from '../lib/schools.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderResultsHTML(results) {
  if (!results.length) return '<p class="empty">No schools found.</p>';
  return `<ul class="results">${results.map((s) => `
    <li data-udise="${esc(s.udise)}">
      <span class="r-name">${esc(s.name)}</span>
      <span class="r-meta">${esc(s.district)}, ${esc(s.state)} · ${esc(s.udise)}</span>
    </li>`).join('')}</ul>`;
}

export function mountSearch(el, onPick) {
  el.innerHTML = `
    <input id="q" type="search" placeholder="School name, district, or UDISE code" />
    <button id="near" type="button">Schools near me</button>
    <div id="results"></div>`;
  const results = el.querySelector('#results');

  const show = (list) => {
    results.innerHTML = renderResultsHTML(list);
    results.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => onPick(li.dataset.udise)));
  };

  let t;
  el.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(async () => show(await searchSchools(e.target.value)), 250);
  });

  el.querySelector('#near').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => show(await nearestSchools(pos.coords.latitude, pos.coords.longitude, 10)),
      () => { results.innerHTML = '<p class="empty">Location unavailable.</p>'; },
      { enableHighAccuracy: true, timeout: 10000 });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/search-ui.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add school search, UDISE lookup, and near-me"
```

---

### Task 8: Methodology page

Spec requires this ships in v1, not later. It is where the 97.3% arithmetic
is shown — the project's central argument.

**Files:**
- Create: `src/map/methodology.js`
- Test: `tests/methodology.test.js`

**Interfaces:**
- Produces: `renderMethodologyHTML(stats): string` where `stats = {total, noToilet, nonFunctional, matchRate}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/methodology.test.js
import { describe, it, expect } from 'vitest';
import { renderMethodologyHTML } from '../src/map/methodology.js';

const stats = { total: 1460759, noToilet: 39558, nonFunctional: 48324, matchRate: 0.9 };

describe('renderMethodologyHTML', () => {
  it('shows the official headline percentage it is challenging', () => {
    expect(renderMethodologyHTML(stats)).toContain('97.3');
  });
  it('states the combined problem count', () => {
    expect(renderMethodologyHTML(stats)).toContain('87,882');
  });
  it('discloses the coordinate match rate as a known limitation', () => {
    expect(renderMethodologyHTML(stats)).toMatch(/90(\.0)?%/);
  });
  it('names both data sources', () => {
    const html = renderMethodologyHTML(stats);
    expect(html).toMatch(/UDISE/);
    expect(html).toMatch(/2021/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/methodology.test.js`
Expected: FAIL — cannot resolve `../src/map/methodology.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/map/methodology.js
const fmt = (n) => n.toLocaleString('en-IN');

export function renderMethodologyHTML(stats) {
  const have = stats.total - stats.noToilet;
  const pct = ((have / stats.total) * 100).toFixed(1);
  const problem = stats.noToilet + stats.nonFunctional;
  return `
    <h1>How this map works</h1>

    <h2>The number we are testing</h2>
    <p>UDISE+ 2024-25 reports that <strong>${pct}%</strong> of India’s
       ${fmt(stats.total)} girls’ and co-educational schools have a
       girls’ toilet.</p>
    <p>That figure is
       (${fmt(stats.total)} − ${fmt(stats.noToilet)}) ÷ ${fmt(stats.total)}.
       It counts a toilet that does not work as a toilet.</p>
    <p>The same data also records <strong>${fmt(stats.nonFunctional)}</strong>
       schools whose girls’ toilet does not function. Counted honestly,
       <strong>${fmt(problem)}</strong> schools have a problem.</p>

    <h2>Where the data comes from</h2>
    <ul>
      <li><strong>Which schools are flagged:</strong> the UDISE+ Know Your
          School public API, 2024-25. This is the government’s own record
          of what each school reported about itself.</li>
      <li><strong>Where schools are on the map:</strong> an open 2021 dataset
          of school coordinates.</li>
    </ul>

    <h2>What we know is imperfect</h2>
    <ul>
      <li>School records are <em>self-reported</em>. We publish them as the
          school’s own claim, never as our finding.</li>
      <li>Coordinates are from 2021 while flags are from 2024-25.
          <strong>${(stats.matchRate * 100).toFixed(1)}%</strong> of flagged
          schools could be matched to a location; the rest are not on the map.</li>
      <li>Some schools have already fixed the problem since reporting it.
          If that is your school, use the fix flow and we will update the pin.</li>
    </ul>

    <h2>What we do not do</h2>
    <p>We do not name individual staff. We do not publish photographs of
       children. We do not bypass any access control on government systems.</p>
  `;
}
```

Register the route in `src/main.js` alongside the map route:
```js
onRoute(/^\/methodology/, async () => {
  const { renderMethodologyHTML } = await import('./map/methodology.js');
  const idx = await (await fetch('/data/index.json')).json();
  const el = document.getElementById('sheet');
  el.innerHTML = renderMethodologyHTML({
    total: 1460759, noToilet: 39558, nonFunctional: 48324,
    matchRate: idx.matchRate ?? 1,
  });
  el.hidden = false;
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/methodology.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add methodology page showing the 97.3% arithmetic"
```

---

## Definition of done for Agent A

- [ ] `npm test` green
- [ ] `npm run validate` passes
- [ ] `npm run dev` shows a national map with working clusters
- [ ] Clicking any pin opens a sheet naming `UDISE+ 2024-25`
- [ ] Search by name, district, and UDISE code all work
- [ ] Near-me returns ordered results
- [ ] **The coordinate match rate is reported to the human**
