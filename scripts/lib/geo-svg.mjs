// Turning lon/lat rings into SVG path data. Pure and side-effect free: the
// one-time build script (scripts/build-india-svg.mjs) is the only caller,
// but the awkward cases — antimeridian-free but wildly varying ring sizes,
// slivers that survive simplification as visual noise — are worth pinning
// down in tests rather than eyeballing a rendered map.

/** Spherical Mercator, returned in degree-equivalent units so x and y stay
 *  on comparable scales and a single uniform scale factor can fit the whole
 *  projection into a viewBox without distorting it.
 *
 *  Mercator rather than equirectangular because India spans 8°N to 37°N:
 *  unprojected, the north is stretched ~15% wide relative to the south and
 *  the subcontinent reads as visibly the wrong shape. */
export function mercator([lon, lat]) {
  const clamped = Math.max(-85, Math.min(85, lat));
  const y = (Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * 180) / Math.PI;
  return [lon, y];
}

/** Bounding box over already-projected rings: [minX, minY, maxX, maxY]. */
export function boundsOf(rings) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

/** Builds a projected-space → viewBox-space transform.
 *
 *  One uniform scale for both axes (so the shape is never stretched) and a
 *  y flip, because SVG's y axis grows downward while latitude grows up. */
export function makeScaler(bounds, width, height, pad = 0) {
  const [minX, minY, maxX, maxY] = bounds;
  const scale = Math.min((width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxY - minY));
  const offX = pad + (width - 2 * pad - (maxX - minX) * scale) / 2;
  const offY = pad + (height - 2 * pad - (maxY - minY) * scale) / 2;
  return ([x, y]) => [offX + (x - minX) * scale, offY + (maxY - y) * scale];
}

/** Perpendicular distance from p to the segment ab, used by simplifyRing. */
function perpDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + clamped * dx), p[1] - (a[1] + clamped * dy));
}

/** Douglas-Peucker, with tolerance in the ring's own units.
 *
 *  Callers simplify AFTER scaling to viewBox pixels, so the tolerance is a
 *  visual one — "collapse anything that could not be seen" — rather than a
 *  distance in degrees that means something different in Kerala than in
 *  Ladakh. */
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 2) return ring.slice();
  let maxDist = -1;
  let index = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    const d = perpDistance(ring[i], ring[0], ring[ring.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [ring[0], ring[ring.length - 1]];
  const left = simplifyRing(ring.slice(0, index + 1), tolerance);
  const right = simplifyRing(ring.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
}

/** Twice the signed area of a ring — sign gives winding, magnitude gives
 *  size. Used only to compare ring sizes, so the factor of two is left in. */
export function ringArea2(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return sum;
}

/** Ring → SVG path data, coordinates rounded to `precision` decimals.
 *
 *  Rounding is most of the file-size win: at viewBox scale, two decimals is
 *  finer than a pixel, and the raw floats are ~17 characters each. */
export function ringToPath(ring, precision = 1) {
  if (ring.length < 3) return '';
  const n = (v) => Number(v.toFixed(precision));
  const parts = ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${n(x)} ${n(y)}`);
  return `${parts.join('')}Z`;
}
