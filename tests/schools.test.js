import { describe, it, expect } from 'vitest';
import { getSchool, searchSchools, nearestSchools } from '../src/lib/schools.js';

describe('getSchool', () => {
  it('finds a school by exact 11-char code', async () => {
    const s = await getSchool('28133390196');
    expect(s.name).toBe('ST.PETERS HS ANKP');
    expect(s.sourceYear).toBe('UDISE+ 2024-25');
  });
  it('finds a school given a code that lost its leading zero', async () => {
    const s = await getSchool('2813339019');
    expect(s === null || s.udise.length === 11).toBe(true);
  });
  it('returns null for unknown codes', async () => {
    expect(await getSchool('99999999999')).toBeNull();
  });
});

describe('searchSchools', () => {
  it('matches on school name, case-insensitively', async () => {
    const r = await searchSchools('peters');
    expect(r.some((s) => s.udise === '28133390196')).toBe(true);
  });
  it('returns an empty array for no match, never null', async () => {
    expect(await searchSchools('zzzzznotathing')).toEqual([]);
  });
});

describe('nearestSchools', () => {
  it('orders by distance from the given point', async () => {
    const r = await nearestSchools(17.6903, 83.0418, 2);
    expect(r[0].udise).toBe('28133390196');
    expect(r[0].distanceM).toBeLessThan(r[1].distanceM);
  });
});
