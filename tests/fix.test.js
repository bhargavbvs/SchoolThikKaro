// tests/fix.test.js
import { describe, it, expect } from 'vitest';
import { renderFixHTML, renderDisputeHTML, buildFixPayload, buildDisputePayload }
  from '../src/submit/fix.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP' };

describe('renderFixHTML', () => {
  it('invites evidence that the problem is resolved', () => {
    expect(renderFixHTML(school)).toMatch(/fixed/i);
  });
  it('names the school being cleared', () => {
    expect(renderFixHTML(school)).toContain('ST.PETERS HS ANKP');
  });
});

describe('renderDisputeHTML', () => {
  it('lets a school contest the record without naming any individual', () => {
    const html = renderDisputeHTML(school);
    expect(html).toMatch(/record is wrong/i);
    expect(html).not.toMatch(/headmaster|principal|teacher/i);
  });
});

describe('payloads', () => {
  it('builds a fix payload without a review_status', () => {
    const p = buildFixPayload(school, { note: 'rebuilt in June' });
    expect(p.udise_code).toBe('28133390196');
    expect(p.review_status).toBeUndefined();
  });
  it('requires a reason on a dispute', () => {
    expect(buildDisputePayload(school, { reason: 'toilet was rebuilt' }).reason)
      .toBe('toilet was rebuilt');
  });
});
