// tests/submit.test.js
import { describe, it, expect } from 'vitest';
import { renderFormHTML, validateSubmission, FINDINGS } from '../src/submit/submit.js';

const school = {
  udise: '28133390196', name: 'ST.PETERS HS ANKP',
  district: 'ANAKAPALLI', state: 'ANDHRA PRADESH',
  indicator: 'girls_toilet_nonfunctional', sourceYear: 'UDISE+ 2024-25',
};

describe('renderFormHTML', () => {
  it('shows the school identity instead of asking for an address', () => {
    const html = renderFormHTML(school);
    expect(html).toContain('ST.PETERS HS ANKP');
    expect(html).not.toMatch(/landmark/i);
  });
  it('shows the government claim being tested, with its source year', () => {
    expect(renderFormHTML(school)).toContain('UDISE+ 2024-25');
  });
  it('carries the capture guidance verbatim', () => {
    expect(renderFormHTML(school))
      .toContain('Photograph the facility only. Do not photograph students.');
  });
  it('carries the precise anonymity copy, not a blanket claim', () => {
    const html = renderFormHTML(school);
    expect(html).toContain('We do record where the photo was taken, to verify it.');
    expect(html).not.toMatch(/all reports are anonymous/i);
  });
  it('offers "working fine" so the form can clear a school, not only accuse it', () => {
    expect(FINDINGS.map((f) => f.value)).toContain('working');
  });
});

describe('validateSubmission', () => {
  const ok = { finding: 'locked', severity: 'barely_usable', hasPhoto: true,
    gate: { canSubmit: true, reason: null } };

  it('accepts a complete submission', () => {
    expect(validateSubmission(ok)).toEqual({ valid: true, errors: [] });
  });
  it('requires a finding', () => {
    expect(validateSubmission({ ...ok, finding: null }).errors)
      .toContain('Choose what you found.');
  });
  it('requires a photo', () => {
    expect(validateSubmission({ ...ok, hasPhoto: false }).errors)
      .toContain('A photo is required.');
  });
  it('refuses when the blur gate is closed, surfacing its reason', () => {
    const r = validateSubmission({ ...ok, gate: { canSubmit: false, reason: 'Faces were detected. Apply blur before submitting.' } });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Faces were detected. Apply blur before submitting.');
  });
});
