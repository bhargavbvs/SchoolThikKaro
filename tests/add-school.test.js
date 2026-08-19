import { describe, it, expect } from 'vitest';
import { renderAddSchoolHTML, validateIdentity } from '../src/submit/addSchool.js';

describe('validateIdentity', () => {
  // Name and area are what make a submission actionable: a moderator has to
  // be able to find a place that exists in no government record.
  it('requires a name', () => {
    expect(validateIdentity({ name: '', area: 'Nongrim Hills' }).valid).toBe(false);
  });
  it('requires an area, because there is no code or record to locate it by', () => {
    expect(validateIdentity({ name: 'Govt UPS', area: '' }).valid).toBe(false);
  });
  it('accepts a name and an area alone — everything else is optional', () => {
    expect(validateIdentity({ name: 'Govt UPS', area: 'Nongrim Hills' }).valid).toBe(true);
  });
  it('says what is missing rather than failing silently', () => {
    const { errors } = validateIdentity({ name: '', area: '' });
    expect(errors).toHaveLength(2);
    expect(errors.join(' ')).toMatch(/name/i);
    expect(errors.join(' ')).toMatch(/village or area/i);
  });
});

describe('renderAddSchoolHTML', () => {
  const html = renderAddSchoolHTML();

  it('tells the reporter their report stays outside the official figures', () => {
    // The site's whole claim is that its numbers are the government's own
    // record. Anyone adding to it must be told their submission is not
    // joining those numbers.
    expect(html).toMatch(/never inside the official figures/i);
    expect(html).toMatch(/reported by a\s+citizen/i);
  });
  it('warns against photographing students, as the listed-school form does', () => {
    expect(html).toMatch(/Do not photograph students/);
  });
  it('carries the anonymity wording verbatim', () => {
    expect(html).toContain('Anonymous — we never record who you are. We do record where the photo was taken, to verify it.');
  });
  it('asks for a UDISE code only as optional, since an unlisted school has none', () => {
    expect(html).toMatch(/UDISE code, if the board shows one/);
    expect(html).not.toMatch(/UDISE code <span class="req">/);
  });
  it('offers the same findings as a report on a listed school', () => {
    expect(html).toContain('value="absent"');
    expect(html).toContain('value="working"');
  });
});
