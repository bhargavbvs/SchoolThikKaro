import { describe, it, expect } from 'vitest';
import { getSchool, loadIndex } from '../src/lib/schools.js';

describe('schools data contract', () => {
  it('returns a school with every field the submit form needs', async () => {
    const s = await getSchool('28133390196');
    expect(s).toMatchObject({
      udise: '28133390196',
      name: expect.any(String),
      state: expect.any(String),
      district: expect.any(String),
      lat: expect.any(Number),
      lng: expect.any(Number),
      indicator: expect.stringMatching(/^(no_girls_toilet|girls_toilet_nonfunctional)$/),
      sourceYear: 'UDISE+ 2024-25',
    });
  });
  it('returns null for an unknown code rather than throwing', async () => {
    expect(await getSchool('00000000000')).toBeNull();
  });
  it('exposes an index of states', async () => {
    const idx = await loadIndex();
    expect(Array.isArray(idx.states)).toBe(true);
  });
});
