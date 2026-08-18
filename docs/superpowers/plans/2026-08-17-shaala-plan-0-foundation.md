# shaala Plan 0 — Foundation (RUN FIRST, SINGLE AGENT)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Create the frozen shared contract both parallel agents build against, so Agent A and Agent B never touch the same file.

**Architecture:** Scaffold + config + Supabase schema + cross-boundary stubs + sample data. Every function one agent calls across the boundary exists here as a working stub, so each agent runs standalone from minute one.

**Tech Stack:** Vite 5, vanilla JS (ES modules), MapLibre GL 4, Supabase (Postgres + Storage + Edge Functions), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-17-shaala-design.md`

## Global Constraints

- Repo root: `/Users/bhargavbvs/shaala`. App name constant `shaala` lives ONLY in `src/config.js` — renaming is a one-line change.
- No framework. Vanilla ES modules, hash router, matching Andolan.
- Node >= 20. `"type": "module"`.
- Every user-facing claim about a school MUST carry source and year. No exceptions.
- Anonymity copy is fixed verbatim: `Anonymous — we never record who you are. We do record where the photo was taken, to verify it.`
- Verification copy is fixed verbatim: `Verified on-site` means passed checks, never "proven".
- Tier threshold: `VERIFIED_RADIUS_M = 200`.
- Source year string is fixed verbatim: `UDISE+ 2024-25`.

---

### Task 1: Scaffold and config

**Files:**
- Create: `package.json`, `vite.config.js`, `.gitignore`, `.env.local.example`
- Create: `src/config.js`
- Test: `tests/config.test.js`

**Interfaces:**
- Produces: `src/config.js` exporting `APP_NAME`, `SOURCE_YEAR`, `VERIFIED_RADIUS_M`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MAX_IMAGE_PX`, `MAX_IMAGE_BYTES`.

- [ ] **Step 1: Write the failing test**

```js
// tests/config.test.js
import { describe, it, expect } from 'vitest';
import * as cfg from '../src/config.js';

describe('config', () => {
  it('fixes the verification radius at 200m', () => {
    expect(cfg.VERIFIED_RADIUS_M).toBe(200);
  });
  it('fixes the source year string used in every attribution', () => {
    expect(cfg.SOURCE_YEAR).toBe('UDISE+ 2024-25');
  });
  it('caps uploaded image dimensions and bytes', () => {
    expect(cfg.MAX_IMAGE_PX).toBe(1600);
    expect(cfg.MAX_IMAGE_BYTES).toBe(3 * 1024 * 1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.js`
Expected: FAIL — cannot resolve `../src/config.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/config.js
export const APP_NAME = 'shaala';
export const SOURCE_YEAR = 'UDISE+ 2024-25';
export const VERIFIED_RADIUS_M = 200;
export const MAX_IMAGE_PX = 1600;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const SUPABASE_URL = import.meta.env?.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
```

```json
// package.json
{
  "name": "shaala",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "npm run validate && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "data:join": "node scripts/join-coords.mjs",
    "data:build": "node scripts/build-geo.mjs",
    "validate": "node scripts/validate.mjs"
  },
  "dependencies": { "maplibre-gl": "^4.7.1" },
  "devDependencies": { "vite": "^5.4.8", "vitest": "^3.2.7" }
}
```

`.gitignore`:
```
node_modules
dist
.env.local
.data-src
```

`.env.local.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`vite.config.js`:
```js
import { defineConfig } from 'vite';
export default defineConfig({ build: { outDir: 'dist' } });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm install && npx vitest run tests/config.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: scaffold shaala with frozen config constants"
```

---

### Task 2: Shared libs — geo and router

**Files:**
- Create: `src/lib/geo.js`, `src/lib/router.js`
- Test: `tests/geo.test.js`

**Interfaces:**
- Produces: `haversineMeters(lat1, lng1, lat2, lng2): number`, `isVerifiedDistance(meters): boolean` from `src/lib/geo.js`; `onRoute(pattern, handler)`, `navigate(hash)`, `startRouter()` from `src/lib/router.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/geo.test.js
import { describe, it, expect } from 'vitest';
import { haversineMeters, isVerifiedDistance } from '../src/lib/geo.js';

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(17.69, 83.04, 17.69, 83.04)).toBe(0);
  });
  it('measures a known short distance within 1%', () => {
    // 0.001 deg latitude ~ 111.19m
    const d = haversineMeters(17.690, 83.040, 17.691, 83.040);
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(113);
  });
});

describe('isVerifiedDistance', () => {
  it('accepts at and below 200m', () => {
    expect(isVerifiedDistance(0)).toBe(true);
    expect(isVerifiedDistance(200)).toBe(true);
  });
  it('rejects beyond 200m', () => {
    expect(isVerifiedDistance(200.1)).toBe(false);
  });
  it('rejects a null or NaN distance rather than passing it', () => {
    expect(isVerifiedDistance(null)).toBe(false);
    expect(isVerifiedDistance(NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/geo.test.js`
Expected: FAIL — cannot resolve `../src/lib/geo.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/geo.js
import { VERIFIED_RADIUS_M } from '../config.js';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isVerifiedDistance(meters) {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return false;
  return meters <= VERIFIED_RADIUS_M;
}
```

```js
// src/lib/router.js
const routes = [];
export function onRoute(pattern, handler) { routes.push({ pattern, handler }); }
export function navigate(hash) { window.location.hash = hash; }
export function startRouter() {
  const run = () => {
    const hash = window.location.hash.replace(/^#/, '') || '/';
    for (const { pattern, handler } of routes) {
      const m = hash.match(pattern);
      if (m) return handler(m);
    }
  };
  window.addEventListener('hashchange', run);
  run();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/geo.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add haversine distance and hash router"
```

---

### Task 3: Supabase schema (the frozen data contract)

**Files:**
- Create: `supabase/schema.sql`

**Interfaces:**
- Produces: tables `schools`, `reports`, `fixes`, `disputes`, `moderators`, `audit_log`; storage bucket `shaala-photos`. Both agents code against these exact column names.

- [ ] **Step 1: Write the schema**

```sql
-- supabase/schema.sql  — idempotent, safe to re-run.

create table if not exists schools (
  udise_code text primary key,
  name text not null,
  state text not null,
  district text not null,
  block text,
  lat double precision,
  lng double precision,
  indicator text not null check (indicator in ('no_girls_toilet','girls_toilet_nonfunctional')),
  source_year text not null default 'UDISE+ 2024-25',
  category text,
  management text
);
create index if not exists schools_state_idx on schools (state);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  school_name_snapshot text not null,
  finding text not null check (finding in
    ('no_toilet','locked','no_water','unusable','working')),
  severity text check (severity in ('usable','barely_usable','unusable','absent')),
  tier text not null default 'unverified' check (tier in ('verified','unverified')),
  lat double precision,
  lng double precision,
  distance_m double precision,
  gps_accuracy_m double precision,
  captured_at timestamptz,
  image_path text not null,
  blur_applied boolean not null default false,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists reports_school_idx on reports (udise_code, review_status);

create table if not exists fixes (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  note text,
  image_path text,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists disputes (
  id uuid primary key default gen_random_uuid(),
  udise_code text not null,
  reason text not null,
  contact text,
  review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists moderators (
  email text primary key,
  role text not null default 'moderator' check (role in ('moderator','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  target_table text not null,
  target_id text not null,
  note text,
  created_at timestamptz not null default now()
);

alter table schools   enable row level security;
alter table reports   enable row level security;
alter table fixes     enable row level security;
alter table disputes  enable row level security;
alter table moderators enable row level security;
alter table audit_log enable row level security;

drop policy if exists schools_public_read on schools;
create policy schools_public_read on schools for select to anon using (true);

-- anon may READ approved only. anon may NOT insert: submissions go through
-- the submit-report Edge Function, which writes with the service key.
drop policy if exists reports_public_read_approved on reports;
create policy reports_public_read_approved on reports
  for select to anon using (review_status = 'approved');

drop policy if exists fixes_public_read_approved on fixes;
create policy fixes_public_read_approved on fixes
  for select to anon using (review_status = 'approved');

drop policy if exists disputes_public_read_approved on disputes;
create policy disputes_public_read_approved on disputes
  for select to anon using (review_status = 'approved');

-- moderators and audit_log: no anon policy at all => denied by default.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shaala-photos','shaala-photos', true, 3145728,
        array['image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Public may READ photos. Public may NOT write: the Edge Function uploads.
drop policy if exists shaala_photos_public_read on storage.objects;
create policy shaala_photos_public_read on storage.objects
  for select to anon using (bucket_id = 'shaala-photos');
```

- [ ] **Step 2: Apply and verify**

Run the file in the Supabase SQL editor. Then verify anon cannot insert:

```bash
curl -s -X POST "$VITE_SUPABASE_URL/rest/v1/reports" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"udise_code":"1","school_name_snapshot":"x","finding":"locked","image_path":"x"}'
```
Expected: a row-level security error, NOT a created row. If a row is created, the policy is wrong — stop and fix before either agent starts.

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql && git commit -m "feat: add frozen supabase schema and RLS policies"
```

---

### Task 4: Cross-boundary stubs and sample data

This is the task that makes parallel work possible. Every function one agent
calls across the boundary exists here as a working stub.

**Files:**
- Create: `index.html`, `src/main.js`, `src/style.css`
- Create: `src/lib/supabase.js`, `src/lib/schools.js`
- Create: `src/submit/submit.js` (stub), `src/admin/admin.js` (stub)
- Create: `public/data/index.json`, `public/data/schools-SAMPLE.geojson`
- Test: `tests/stubs.test.js`

**Interfaces:**
- Produces (Agent A implements the real version): `loadIndex()`, `loadState(stateCode)`, `getSchool(udiseCode)` from `src/lib/schools.js`.
- Produces (Agent B implements the real version): `openSubmitFlow(school)` from `src/submit/submit.js`; `mountAdmin(el)` from `src/admin/admin.js`.
- Produces: `sbGet(path)`, `sbPost(path, body)` from `src/lib/supabase.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/stubs.test.js
import { describe, it, expect } from 'vitest';
import { getSchool, loadIndex } from '../src/lib/schools.js';

describe('schools data contract', () => {
  it('returns a school with every field the submit form needs', async () => {
    const s = await getSchool('28133390196');
    expect(s).toMatchObject({
      udise: '28133390196',
      name: expect.any(String),
      state: expect.any(String),
      district: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
      indicator: expect.stringMatching(/^(no_girls_toilet|girls_toilet_nonfunctional)$/),
      sourceYear: 'UDISE+ 2024-25',
    });
  });
  it('returns null for an unknown code rather than throwing', async () => {
    expect(await getSchool('00000000000')).toBeNull();
  });
  it('exposes an index of states', async () => {
    const idx = await loadIndex();
    expect(Array.isArray(idx.states)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stubs.test.js`
Expected: FAIL — cannot resolve `../src/lib/schools.js`

- [ ] **Step 3: Write the stubs**

```js
// src/lib/supabase.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

const headers = () => ({
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
});

export async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`supabase GET ${path} failed: ${res.status}`);
  return res.json();
}

export async function sbPost(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`supabase POST ${path} failed: ${res.status}`);
  return res.json();
}
```

```js
// src/lib/schools.js
// STUB until Agent A implements the real pipeline-backed version.
// The signatures below are frozen — Agent B codes against them.
import { SOURCE_YEAR } from '../config.js';

let _cache = null;

async function loadSample() {
  if (_cache) return _cache;
  const res = await fetch('/data/schools-SAMPLE.geojson');
  const gj = await res.json();
  _cache = gj.features.map((f) => ({
    udise: f.properties.udise,
    name: f.properties.name,
    state: f.properties.state,
    district: f.properties.district,
    block: f.properties.block ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    indicator: f.properties.indicator,
    sourceYear: SOURCE_YEAR,
  }));
  return _cache;
}

export async function loadIndex() {
  const res = await fetch('/data/index.json');
  return res.json();
}

export async function loadState(_stateCode) {
  const res = await fetch('/data/schools-SAMPLE.geojson');
  return res.json();
}

export async function getSchool(udiseCode) {
  const all = await loadSample();
  return all.find((s) => s.udise === String(udiseCode).padStart(11, '0')) ?? null;
}
```

```js
// src/submit/submit.js
// STUB until Agent B implements it. Agent A calls this from the pin sheet.
export function openSubmitFlow(school) {
  console.warn('[stub] openSubmitFlow', school?.udise);
  alert('Reporting is not wired up yet.');
}
```

```js
// src/admin/admin.js
// STUB until Agent B implements it.
export function mountAdmin(el) {
  el.innerHTML = '<p>Moderation console not built yet.</p>';
}
```

`index.html` — every mount point both agents need, so neither has to edit it:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>shaala</title>
  <link rel="stylesheet" href="/src/style.css" />
</head>
<body>
  <div id="map"></div>
  <header id="topbar"></header>
  <aside id="sheet" hidden></aside>
  <div id="submit-root" hidden></div>
  <div id="admin-root" hidden></div>
  <div id="toast" hidden></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

```js
// src/main.js
import { onRoute, startRouter } from './lib/router.js';
import { mountAdmin } from './admin/admin.js';

onRoute(/^\/admin/, () => {
  const el = document.getElementById('admin-root');
  el.hidden = false;
  document.getElementById('map').style.display = 'none';
  mountAdmin(el);
});

// Agent A registers the map routes here.
startRouter();
```

`src/style.css` — tokens only. Each agent adds its own stylesheet file and
imports it here, so nobody edits anybody else's CSS.

```css
:root {
  --bg:#0d0d0f; --panel:#17171a; --panel-2:#1f1f24;
  --ink:#f4efe9; --body:#b9b2a8; --muted:#7c766d;
  --line:rgba(244,239,233,0.12);
  --admitted:#e0473e; --found:#f0932b; --fixed:#2a9d8f; --disputed:#7c766d;
}
* { box-sizing:border-box; }
html,body { margin:0; height:100%; background:var(--bg); color:var(--ink);
  font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }
#map { position:fixed; inset:0; }
@import './map/style-map.css';
@import './submit/style-submit.css';
@import './admin/style-admin.css';
```

Create empty placeholder files `src/map/style-map.css`, `src/submit/style-submit.css`,
`src/admin/style-admin.css` so the imports resolve.

`public/data/index.json`:
```json
{ "states": [{ "code": "SAMPLE", "name": "Sample", "count": 3, "file": "schools-SAMPLE.geojson" }] }
```

`public/data/schools-SAMPLE.geojson` — 3 real schools so Agent B can build
against real shapes before Agent A's pipeline finishes:
```json
{ "type":"FeatureCollection","features":[
 {"type":"Feature","geometry":{"type":"Point","coordinates":[83.0418999999466,17.6903999997509]},
  "properties":{"udise":"28133390196","name":"ST.PETERS HS ANKP","state":"ANDHRA PRADESH","district":"ANAKAPALLI","block":"ANAKAPALLI","indicator":"girls_toilet_nonfunctional"}},
 {"type":"Feature","geometry":{"type":"Point","coordinates":[78.7512,25.2086]},
  "properties":{"udise":"23070100101","name":"SAMPLE GHS TWO","state":"MADHYA PRADESH","district":"AGAR MALWA","block":"AGAR","indicator":"no_girls_toilet"}},
 {"type":"Feature","geometry":{"type":"Point","coordinates":[76.2999,9.9816]},
  "properties":{"udise":"32080200301","name":"SAMPLE GHS THREE","state":"KERALA","district":"ERNAKULAM","block":"KOCHI","indicator":"girls_toilet_nonfunctional"}}
]}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run`
Expected: PASS — all suites green (config, geo, stubs)

Note: `tests/stubs.test.js` uses `fetch` against `/data/...`. Configure Vitest
with `environment: 'jsdom'` and a fetch shim reading from `public/`, or mark
these tests to run under `vite dev`. Add to `vite.config.js`:

```js
test: { environment: 'node', setupFiles: ['tests/setup.js'] }
```

```js
// tests/setup.js — serve public/ files to fetch() during tests
import { readFile } from 'node:fs/promises';
globalThis.fetch = async (url) => {
  const p = new URL(`../public${String(url)}`, import.meta.url);
  const body = await readFile(p, 'utf8');
  return { ok: true, json: async () => JSON.parse(body) };
};
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add cross-boundary stubs and sample data"
```

---

## Handoff

After Task 4 is committed and `npm test` is green, both agents start
simultaneously. Their file sets are disjoint:

| Agent A owns | Agent B owns |
|---|---|
| `scripts/**` | `supabase/functions/**` |
| `src/map/**` | `src/submit/**` |
| `src/lib/schools.js` (replaces stub) | `src/admin/**` |
| `public/data/**` | — |
| `tests/join.test.js` | `tests/blur.test.js`, `tests/submit.test.js` |

Neither agent edits `index.html`, `src/main.js` (except A's one route
registration line), `src/config.js`, `src/lib/geo.js`, `src/lib/supabase.js`,
or `supabase/schema.sql`. Those are frozen.
