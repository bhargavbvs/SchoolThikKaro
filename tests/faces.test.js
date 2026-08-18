// tests/faces.test.js
import { describe, it, expect } from 'vitest';
import { blurGate } from '../src/submit/faces.js';

describe('blurGate', () => {
  it('allows submission when the detector ran and blur was applied', () => {
    expect(blurGate({ detectorLoaded: true, facesFound: 2, blurApplied: true }))
      .toEqual({ canSubmit: true, reason: null });
  });
  it('allows submission when the detector ran and found no faces', () => {
    expect(blurGate({ detectorLoaded: true, facesFound: 0, blurApplied: false }))
      .toEqual({ canSubmit: true, reason: null });
  });
  it('BLOCKS submission when faces were found but not blurred', () => {
    const g = blurGate({ detectorLoaded: true, facesFound: 1, blurApplied: false });
    expect(g.canSubmit).toBe(false);
    expect(g.reason).toMatch(/blur/i);
  });
  it('BLOCKS submission when the detector failed to load and nothing was blurred', () => {
    const g = blurGate({ detectorLoaded: false, facesFound: 0, blurApplied: false });
    expect(g.canSubmit).toBe(false);
    expect(g.reason).toMatch(/manually/i);
  });
  it('allows submission when the detector failed but the user blurred manually', () => {
    expect(blurGate({ detectorLoaded: false, facesFound: 0, blurApplied: true }))
      .toEqual({ canSubmit: true, reason: null });
  });
});
