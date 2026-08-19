// ONE-TIME build step. Dissolves a district-level India boundary file into
// state outlines, projects them, and writes the small SVG path data that
// the homepage map is drawn from.
//
// This is NOT part of `npm run build`. Its input is a ~74MB boundary file
// that is not in this repo, and its output (data/india-states.json, ~100KB)
// IS committed — so a fresh clone, CI and Vercel can all build the site
// without it. Re-run it only if the boundaries themselves change:
//
//   node scripts/build-india-svg.mjs <path-to-india-districts.geojson>
//
// Boundaries here are a base map, not a statement about any border.

import { readFileSync, writeFileSync } from 'node:fs';
import * as pc from 'polygon-clipping';
import { mercator, boundsOf, makeScaler, simplifyRing, ringArea2, ringToPath } from './lib/geo-svg.mjs';
import { stateKey } from './lib/choropleth.mjs';
import { titleCase } from './lib/format.mjs';

const SRC = process.argv[2] ?? '/Users/bhargavbvs/ssupwithstates/.geo-src/india-districts.geojson';
const OUT = 'data/india-states.json';
const WIDTH = 1000;
const HEIGHT = 1100;      // India is taller than it is wide once projected
const PAD = 8;
const TOLERANCE = 0.6;    // px — below what any screen resolves
const MIN_AREA = 1.5;     // px² — a ring smaller than this is visual noise

const union = pc.default?.union ?? pc.union;

// Snap to a ~11m grid before dissolving. Neighbouring districts in this
// file describe their shared border with coordinates that agree to about
// twelve decimals but not exactly; polygon-clipping's sweep line treats
// those as distinct near-parallel segments and fails outright on six
// states. Snapping makes a shared border bit-identical on both sides. The
// grid is ~150x finer than the 0.6px simplification applied later, so it
// costs nothing that can be seen.
// Two states still defeat the finest grid, so the snap is a ladder rather
// than a constant: each rung is coarser, and the first one that dissolves
// wins. Even the coarsest rung (~1.1km) is under the ~2km that one pixel of
// the finished map covers.
const SNAP_LADDER = [1e4, 1e3, 1e2];
const snapRing = (ring, snap) => {
  const out = [];
  for (const [lon, lat] of ring) {
    const p = [Math.round(lon * snap) / snap, Math.round(lat * snap) / snap];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) out.push(p);
  }
  // Snapping can collapse a ring below the three points a polygon needs.
  return out.length >= 4 ? out : null;
};
const snapPolys = (raw, snap) => raw
  .map((poly) => poly.map((r) => snapRing(r, snap)).filter(Boolean))
  .filter((poly) => poly.length > 0);

const gj = JSON.parse(readFileSync(SRC, 'utf8'));

// Group districts by state, dropping the file's 28 unattributed features
// (statecode 0, no district name — water bodies and unassigned areas).
const byState = new Map();
for (const f of gj.features) {
  const name = f.properties?.state;
  if (!name || !f.geometry) continue;
  const raw = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  if (!byState.has(name)) byState.set(name, []);
  byState.get(name).push(raw);
}
console.log(`grouped ${gj.features.length} districts into ${byState.size} states`);

// Dissolve: districts of one state become one shape, so the map shows state
// borders and nothing else. Without this the fill is identical but every
// internal district boundary still draws, and it reads as a district map of
// data we are not presenting at district level here.
const dissolved = new Map();
for (const [name, polys] of byState) {
  let merged = null;
  let lastErr = null;
  for (const snap of SNAP_LADDER) {
    const snapped = polys.map((p) => snapPolys(p, snap)).filter((p) => p.length > 0);
    if (!snapped.length) continue;
    try {
      merged = union(snapped[0], ...snapped.slice(1));
      break;
    } catch (err) { lastErr = err; }
  }
  if (!merged) {
    // A self-intersecting district must not cost us the whole state: fall
    // back to drawing it undissolved, which looks busier but is never wrong.
    console.warn(`  union failed for ${name} at every grid (${lastErr?.message}) — keeping districts undissolved`);
    merged = polys.map((p) => snapPolys(p, SNAP_LADDER[0])).flat();
  }
  dissolved.set(name, merged);
}

// Project every ring first, so the scale is fitted to the real projected
// extent of the country rather than to raw degrees.
const projected = new Map();
const all = [];
for (const [name, polys] of dissolved) {
  const rings = [];
  for (const poly of polys) for (const ring of poly) {
    const p = ring.map(mercator);
    rings.push(p);
    all.push(p);
  }
  projected.set(name, rings);
}

const toView = makeScaler(boundsOf(all), WIDTH, HEIGHT, PAD);

const shapes = [];
let keptRings = 0, droppedRings = 0;
for (const [name, rings] of projected) {
  const scaled = rings
    .map((r) => simplifyRing(r.map(toView), TOLERANCE))
    .filter((r) => r.length >= 3);
  // Keep the largest ring unconditionally: a small state must never vanish
  // just because MIN_AREA was tuned for slivers.
  const withArea = scaled.map((r) => ({ r, a: Math.abs(ringArea2(r)) / 2 }));
  withArea.sort((x, y) => y.a - x.a);
  const kept = withArea.filter((x, i) => i === 0 || x.a >= MIN_AREA);
  keptRings += kept.length;
  droppedRings += withArea.length - kept.length;
  const d = kept.map((x) => ringToPath(x.r, 1)).join('');
  if (!d) { console.warn(`  ${name} produced no drawable path — skipped`); continue; }
  shapes.push({ key: stateKey(name), label: titleCase(name), d });
}

shapes.sort((a, b) => a.label.localeCompare(b.label));

const out = {
  note: 'Generated by scripts/build-india-svg.mjs. Base map only; boundaries are not a statement about any border.',
  viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
  shapes,
};
writeFileSync(OUT, JSON.stringify(out));
const kb = (Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(0);
console.log(`wrote ${OUT}: ${shapes.length} states, ${keptRings} rings kept, ${droppedRings} slivers dropped, ${kb}KB`);
