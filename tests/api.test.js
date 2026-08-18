// tests/api.test.js
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../src/submit/api.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP', lat: 17.69, lng: 83.04 };

describe('buildPayload', () => {
  const base = {
    finding: 'locked', severity: 'barely_usable', blurApplied: true,
    fix: { lat: 17.6901, lng: 83.0401, accuracyM: 12 },
    tier: { tier: 'verified', distanceM: 15 },
  };

  it('snapshots the school name so later renames cannot rewrite history', () => {
    expect(buildPayload(school, base).school_name_snapshot).toBe('ST.PETERS HS ANKP');
  });
  it('sends the computed tier and distance', () => {
    const p = buildPayload(school, base);
    expect(p.tier).toBe('verified');
    expect(p.distance_m).toBe(15);
  });
  it('always reports whether blur was applied', () => {
    expect(buildPayload(school, base).blur_applied).toBe(true);
  });
  it('sends the face count so the server can refuse an unblurred photo', () => {
    expect(buildPayload(school, { ...base, facesFound: 3 }).faces_found).toBe(3);
  });
  it('never sends a review_status — the server decides that', () => {
    expect(buildPayload(school, base).review_status).toBeUndefined();
  });
  it('omits coordinates entirely when there was no fix', () => {
    const p = buildPayload(school, { ...base, fix: null, tier: { tier: 'unverified', distanceM: null } });
    expect(p.lat).toBeNull();
    expect(p.distance_m).toBeNull();
  });
});
