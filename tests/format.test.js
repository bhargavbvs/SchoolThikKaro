import { describe, it, expect } from 'vitest';
import { titleCase, compareToBaseline, barWidth, severityOf } from '../scripts/lib/format.mjs';

describe('titleCase', () => {
  it('title-cases a plain uppercase place name', () => {
    expect(titleCase('SOUTH WEST GARO HILLS')).toBe('South West Garo Hills');
  });
  it('keeps an ampersand intact', () => {
    expect(titleCase('JAMMU & KASHMIR')).toBe('Jammu & Kashmir');
  });
  it('capitalises inside parentheses, which real district names contain', () => {
    expect(titleCase('HAPUR (PANCHSHEEL NAGAR)')).toBe('Hapur (Panchsheel Nagar)');
  });
  it('leaves leading digits alone', () => {
    expect(titleCase('24 PARGANAS')).toBe('24 Parganas');
  });
  it('capitalises after a hyphen', () => {
    expect(titleCase('KAMRUP-RURAL')).toBe('Kamrup-Rural');
  });
  it('handles an empty or missing name without throwing', () => {
    expect(titleCase('')).toBe('');
    expect(titleCase(null)).toBe('');
  });
});

describe('compareToBaseline', () => {
  // Real national rate is 5.63%; real state spread runs 29.7% down to 0.1%.
  it('states a multiple when clearly above the baseline', () => {
    const s = compareToBaseline(29.7, 5.63, 'national average');
    expect(s).toMatch(/5\.3×/);
    expect(s).toMatch(/national average/);
    expect(s).toMatch(/5\.6%/);
  });
  it('says "about" when close to the baseline, rather than a noisy 1.1x', () => {
    expect(compareToBaseline(5.9, 5.63, 'national average')).toMatch(/about the national average/i);
  });
  it('says "below" rather than an awkward 0.02x for the very best performers', () => {
    const s = compareToBaseline(0.1, 5.63, 'national average');
    expect(s).toMatch(/below the national average/i);
    expect(s).not.toMatch(/×/);
  });
  it('returns null when either side is unknown, so callers can omit the line', () => {
    expect(compareToBaseline(null, 5.63, 'national average')).toBeNull();
    expect(compareToBaseline(5, null, 'national average')).toBeNull();
  });
});

describe('barWidth', () => {
  // Bars scale to the largest rate in their own table, not 0-100%: with a
  // 29.7% max and a 4.7% median, a 0-100% scale renders almost every bar as
  // an invisible sliver.
  it('gives the largest rate in the table a full bar', () => {
    expect(barWidth(29.7, 29.7)).toBe(100);
  });
  it('scales the rest proportionally against that maximum', () => {
    expect(barWidth(14.85, 29.7)).toBe(50);
  });
  it('keeps a tiny non-zero rate visible rather than rendering nothing', () => {
    expect(barWidth(0.01, 29.7)).toBeGreaterThan(0);
  });
  it('returns 0 for an unknown rate', () => {
    expect(barWidth(null, 29.7)).toBe(0);
  });
  it('returns 0 when the table max is missing or zero, instead of dividing by zero', () => {
    expect(barWidth(5, 0)).toBe(0);
    expect(barWidth(5, null)).toBe(0);
  });
});

describe('severityOf', () => {
  // Bar LENGTH is relative to the table's own max, so a page can be scanned.
  // Bar COLOUR is absolute, against the national rate, so the same visual
  // weight never means two different things on two different pages:
  // Kerala's worst district (0.8%) fills its bar exactly like Meghalaya's
  // worst (46.5%) fills its own — only colour keeps that honest.
  it('marks a rate well above the national baseline as high', () => {
    expect(severityOf(46.5, 5.63)).toBe('is-high');
  });
  it('marks a rate near the baseline as mid', () => {
    expect(severityOf(5.9, 5.63)).toBe('is-mid');
  });
  it('marks a rate well below the baseline as low', () => {
    expect(severityOf(0.8, 5.63)).toBe('is-low');
  });
  it('falls back to mid when the baseline is unknown, rather than implying a judgement', () => {
    expect(severityOf(20, null)).toBe('is-mid');
  });
});
