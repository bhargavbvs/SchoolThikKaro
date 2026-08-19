import { describe, it, expect } from 'vitest';
import { mercator, boundsOf, makeScaler, simplifyRing, ringArea2, ringToPath }
  from '../scripts/lib/geo-svg.mjs';

describe('mercator', () => {
  it('leaves longitude untouched — only latitude is warped', () => {
    expect(mercator([77.2, 0])[0]).toBe(77.2);
  });
  it('maps the equator to zero', () => {
    expect(mercator([0, 0])[1]).toBeCloseTo(0, 10);
  });
  it('stretches northern latitudes more than southern ones, which is the whole point', () => {
    // India runs 8°N (Kanyakumari) to 37°N (Ladakh). Under Mercator the
    // northern degree must occupy more vertical space than the southern one.
    const south = mercator([77, 9])[1] - mercator([77, 8])[1];
    const north = mercator([77, 37])[1] - mercator([77, 36])[1];
    expect(north).toBeGreaterThan(south);
  });
  it('clamps absurd latitudes instead of returning Infinity', () => {
    expect(Number.isFinite(mercator([0, 90])[1])).toBe(true);
    expect(Number.isFinite(mercator([0, -90])[1])).toBe(true);
  });
});

describe('boundsOf', () => {
  it('spans every ring it is given, not just the first', () => {
    expect(boundsOf([[[0, 0], [1, 1]], [[-5, 2], [3, 9]]])).toEqual([-5, 0, 3, 9]);
  });
});

describe('makeScaler', () => {
  const bounds = [0, 0, 10, 5];
  it('flips the y axis, because SVG y grows downward and latitude grows up', () => {
    const to = makeScaler(bounds, 100, 50, 0);
    expect(to([0, 5])[1]).toBeCloseTo(0);   // northernmost -> top
    expect(to([0, 0])[1]).toBeCloseTo(50);  // southernmost -> bottom
  });
  it('uses one scale for both axes so the country is never stretched', () => {
    // A 2:1 box into a 100x100 viewBox must letterbox, not distort.
    const to = makeScaler(bounds, 100, 100, 0);
    const w = to([10, 0])[0] - to([0, 0])[0];
    const h = to([0, 0])[1] - to([0, 5])[1];
    expect(w / h).toBeCloseTo(2, 6);
  });
  it('centres the shape within the padded box', () => {
    const to = makeScaler(bounds, 100, 100, 0);
    expect(to([0, 5])[1]).toBeCloseTo(25); // 50px tall, centred in 100
  });
  it('honours padding on the axis that constrains the fit', () => {
    // 10x5 into 100x50 with pad 10 leaves an 80x30 inner box: the y axis
    // constrains (30/5 = 6 < 80/10 = 8), so the shape touches the padded
    // top edge exactly, while x picks up extra offset from centring.
    const to = makeScaler(bounds, 100, 50, 10);
    expect(to([0, 5])[1]).toBeCloseTo(10);
    expect(to([0, 5])[0]).toBeCloseTo(20);
  });
});

describe('simplifyRing', () => {
  it('drops a point that sits on the line between its neighbours', () => {
    const out = simplifyRing([[0, 0], [5, 0], [10, 0]], 0.5);
    expect(out).toEqual([[0, 0], [10, 0]]);
  });
  it('keeps a point that deviates by more than the tolerance', () => {
    const out = simplifyRing([[0, 0], [5, 4], [10, 0]], 0.5);
    expect(out).toHaveLength(3);
  });
  it('always keeps the first and last points', () => {
    const ring = [[0, 0], [1, 0.01], [2, 0.01], [3, 0]];
    const out = simplifyRing(ring, 5);
    expect(out[0]).toEqual([0, 0]);
    expect(out[out.length - 1]).toEqual([3, 0]);
  });
  it('leaves a degenerate two-point ring alone rather than throwing', () => {
    expect(simplifyRing([[0, 0], [1, 1]], 0.5)).toEqual([[0, 0], [1, 1]]);
  });
});

describe('ringArea2', () => {
  it('reports a larger magnitude for a larger ring', () => {
    const small = Math.abs(ringArea2([[0, 0], [1, 0], [1, 1], [0, 1]]));
    const big = Math.abs(ringArea2([[0, 0], [10, 0], [10, 10], [0, 10]]));
    expect(big).toBeGreaterThan(small);
  });
  it('flips sign with winding direction, so holes are distinguishable', () => {
    const cw = ringArea2([[0, 0], [1, 0], [1, 1], [0, 1]]);
    const ccw = ringArea2([[0, 1], [1, 1], [1, 0], [0, 0]]);
    expect(Math.sign(cw)).toBe(-Math.sign(ccw));
  });
});

describe('ringToPath', () => {
  it('emits a closed subpath starting with M', () => {
    expect(ringToPath([[0, 0], [1, 0], [1, 1]], 0)).toBe('M0 0L1 0L1 1Z');
  });
  it('rounds coordinates to the requested precision to keep the file small', () => {
    expect(ringToPath([[0.123456, 0], [1, 0], [1, 1]], 1)).toBe('M0.1 0L1 0L1 1Z');
  });
  it('drops trailing zeros rather than padding them', () => {
    expect(ringToPath([[1.0, 2.5], [3, 0], [1, 1]], 2)).toBe('M1 2.5L3 0L1 1Z');
  });
  it('returns empty for a ring too small to be a polygon', () => {
    expect(ringToPath([[0, 0], [1, 1]], 1)).toBe('');
  });
});
