import { readFileSync } from 'node:fs';
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

describe('a report can name more than one problem', () => {
  it('sends every category the reporter chose', () => {
    // A school short of a toilet AND of drinking water is one school in
    // one state. Two reports would lose that.
    const p = buildPayload({ udise: '1', name: 'x' }, {
      categories: ['girls_toilet', 'drinking_water'], finding: 'absent',
      blurApplied: true, facesFound: 0, fix: null, tier: null,
    });
    expect(p.categories).toEqual(['girls_toilet', 'drinking_water']);
  });

  it('keeps `category` in step as the first of them', () => {
    // Every existing index and filter reads the single column.
    const p = buildPayload({ udise: '1', name: 'x' }, {
      categories: ['drinking_water', 'ramp'], finding: 'absent',
      blurApplied: true, facesFound: 0, fix: null, tier: null,
    });
    expect(p.category).toBe('drinking_water');
  });

  it('still accepts a single category from the older shape', () => {
    const p = buildPayload({ udise: '1', name: 'x' }, {
      category: 'electricity', finding: 'broken',
      blurApplied: true, facesFound: 0, fix: null, tier: null,
    });
    expect(p.categories).toEqual(['electricity']);
    expect(p.category).toBe('electricity');
  });
});

describe('the Edge Function must be callable from a browser', () => {
  const fn = readFileSync('supabase/functions/submit-report/index.ts', 'utf8');

  it('answers the preflight a browser sends before any POST', () => {
    // It returned 405 with no CORS headers, so every submission from a
    // phone or laptop was blocked before the request left the device.
    // curl sends no preflight, which is why every test here passed.
    expect(fn).toMatch(/req\.method === 'OPTIONS'/);
    expect(fn).toMatch(/status: 204/);
  });

  it('puts CORS headers on every response, not only the happy one', () => {
    // A 400 or 429 the browser cannot read is a request that hangs.
    expect(fn).toMatch(/'Access-Control-Allow-Origin'/);
    expect(fn).toMatch(/'Access-Control-Allow-Headers':[^,]*authorization/);
    const bare = fn.match(/new Response\(JSON\.stringify/g) ?? [];
    expect(bare.length, 'every JSON response should go through json()').toBeLessThanOrEqual(1);
  });

  it('allows the headers supabase-js actually sends', () => {
    for (const h of ['authorization', 'apikey', 'content-type']) {
      expect(fn).toContain(h);
    }
  });
});
