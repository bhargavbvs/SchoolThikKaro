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
