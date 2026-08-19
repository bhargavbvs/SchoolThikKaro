// tests/submit.test.js
import { describe, it, expect } from 'vitest';
import { CATEGORIES, FINDINGS, renderFormHTML, validateSubmission } from '../src/submit/submit.js';

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
  const ok = { category: 'girls_toilet', finding: 'locked', severity: 'barely_usable', hasPhoto: true,
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

describe('reporting beyond girls’ toilets', () => {
  it('offers categories a toilet-only form could never carry', () => {
    const values = CATEGORIES.map((c) => c.value);
    expect(values).toContain('drinking_water');
    expect(values).toContain('electricity');
    expect(values).toContain('classroom');
    expect(values).toContain('ramp');
  });

  it('still leads with girls’ toilets, which is what the published figures measure', () => {
    expect(CATEGORIES[0].value).toBe('girls_toilet');
  });

  it('always leaves room for a problem we did not think of', () => {
    expect(CATEGORIES.at(-1).value).toBe('other');
  });

  it('uses one condition vocabulary for every category', () => {
    // "There is none at all" means the same about a ramp as about a
    // toilet; a reporter should not learn a new vocabulary per facility.
    const values = FINDINGS.map((f) => f.value);
    expect(values).toEqual(['absent', 'broken', 'locked', 'no_water', 'inadequate', 'working']);
    expect(values.join(' ')).not.toMatch(/toilet/);
  });

  it('keeps every finding label free of the word toilet', () => {
    for (const f of FINDINGS) expect(f.label.toLowerCase()).not.toContain('toilet');
  });

  it('refuses a submission that does not say what the problem is with', () => {
    const { valid, errors } = validateSubmission({
      category: null, finding: 'absent', hasPhoto: true, gate: { canSubmit: true },
    });
    expect(valid).toBe(false);
    expect(errors.join(' ')).toMatch(/what the problem is with/i);
  });
});
