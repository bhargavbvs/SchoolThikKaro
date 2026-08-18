import { describe, it, expect } from 'vitest';
import { renderSheetHTML, schoolFromFeature } from '../src/map/sheet.js';

const school = {
  udise: '28133390196', name: 'ST.PETERS HS ANKP',
  state: 'ANDHRA PRADESH', district: 'ANAKAPALLI', block: 'ANAKAPALLI',
  indicator: 'girls_toilet_nonfunctional',
};

describe('renderSheetHTML', () => {
  it('always names the source and year', () => {
    expect(renderSheetHTML(school)).toContain('UDISE+ 2024-25');
  });
  it('attributes the claim to the school, never asserting it as fact', () => {
    const html = renderSheetHTML(school);
    expect(html).toMatch(/as reported by this school/i);
  });
  it('shows the UDISE code so the claim is checkable', () => {
    expect(renderSheetHTML(school)).toContain('28133390196');
  });
  it('renders the human-readable indicator', () => {
    expect(renderSheetHTML(school)).toMatch(/not function/i);
  });
  it('escapes school names so a quote in a name cannot break out', () => {
    const evil = { ...school, name: '<img src=x onerror=alert(1)>' };
    expect(renderSheetHTML(evil)).not.toContain('<img');
  });
  it('offers the fix and dispute flows, not just the report flow', () => {
    const html = renderSheetHTML(school);
    expect(html).toContain('id="sheet-fix"');
    expect(html).toContain('id="sheet-dispute"');
  });
});

describe('schoolFromFeature', () => {
  it('lifts coordinates out of the geometry so the submit flow can use them', () => {
    const s = schoolFromFeature({
      properties: { udise: '28133390196', name: 'X', indicator: 'no_girls_toilet' },
      geometry: { coordinates: [83.0418, 17.6903] },
    });
    expect(s.lat).toBeCloseTo(17.6903);
    expect(s.lng).toBeCloseTo(83.0418);
  });
});
