// tests/api.test.js
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../src/submit/api.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP', lat: 17.69, lng: 83.04 };

describe('buildPayload', () => {
  const base = {
    category: 'girls_toilet', finding: 'locked', severity: 'barely_usable', blurApplied: true,
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

describe('payload carries what the report is about', () => {
  it('sends the category, so a water report is not filed as a toilet report', () => {
    const p = buildPayload({ udise: '1', name: 'x' }, {
      category: 'drinking_water', finding: 'absent', severity: 'absent',
      note: 'The handpump has been dry since June.',
      blurApplied: true, facesFound: 0, fix: { lat: 1, lng: 2, accuracyM: 3 },
      tier: { tier: 'unverified', distanceM: null },
    });
    expect(p.category).toBe('drinking_water');
    expect(p.note).toBe('The handpump has been dry since June.');
  });

  it('sends a null note rather than an empty string when none was written', () => {
    const p = buildPayload({ udise: '1', name: 'x' }, {
      category: 'ramp', finding: 'absent', blurApplied: true, facesFound: 0,
      fix: null, tier: null,
    });
    expect(p.note).toBeNull();
  });

  it('carries the category on an unlisted-school report too', () => {
    const p = buildPayload(
      { kind: 'unlisted', name: 'Govt UPS', area: 'Nongrim', district: '', state: '', udise: '' },
      { category: 'electricity', finding: 'broken', note: null,
        blurApplied: true, facesFound: 0, fix: null },
    );
    expect(p.category).toBe('electricity');
    expect(p.udise_code).toBeNull();
  });
});
