// tests/gps.test.js
import { describe, it, expect } from 'vitest';
import { computeTier, permissionHelpHTML } from '../src/submit/gps.js';

const school = { schoolLat: 17.6903, schoolLng: 83.0418 };

describe('computeTier', () => {
  it('marks a camera capture within 200m as verified', () => {
    const r = computeTier({ ...school, fixLat: 17.6910, fixLng: 83.0418, accuracyM: 15, source: 'camera' });
    expect(r.tier).toBe('verified');
    expect(r.distanceM).toBeLessThan(200);
  });
  it('marks a camera capture beyond 200m as unverified', () => {
    const r = computeTier({ ...school, fixLat: 17.7100, fixLng: 83.0418, accuracyM: 15, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/too far/i);
  });
  it('marks a gallery upload as unverified even when the location matches', () => {
    const r = computeTier({ ...school, fixLat: 17.6903, fixLng: 83.0418, accuracyM: 5, source: 'gallery' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/gallery/i);
  });
  it('marks a capture with no location fix as unverified', () => {
    const r = computeTier({ ...school, fixLat: null, fixLng: null, accuracyM: null, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.distanceM).toBeNull();
  });
  it('refuses to verify when GPS accuracy is worse than the radius', () => {
    const r = computeTier({ ...school, fixLat: 17.6903, fixLng: 83.0418, accuracyM: 500, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/accurate/i);
  });
});

describe('permissionHelpHTML', () => {
  it('gives iOS-specific recovery steps', () => {
    expect(permissionHelpHTML('ios')).toMatch(/Settings/);
  });
  it('gives Android-specific recovery steps', () => {
    expect(permissionHelpHTML('android')).toMatch(/Permissions/i);
  });
});
