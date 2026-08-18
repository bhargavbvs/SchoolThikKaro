import { describe, it, expect } from 'vitest';
import { parseTotals, alreadyDone } from '../scripts/lib/kys.mjs';

describe('parseTotals', () => {
  const ok = {
    httpStatus: 200, status: true, message: 'success',
    data: { yearId: 11, regionId: 3826, totSch: 1955, totSchGirlsCoed: 1947,
            totSchNotHaveGirlsToilet: 4, totSchHaveGirlsToiletButNotFunc: 12 },
  };

  it('extracts the four counts we need', () => {
    expect(parseTotals(ok)).toEqual({
      total: 1955, girlsCoed: 1947, noToilet: 4, nonFunctional: 12,
    });
  });
  it('returns null for an error payload rather than throwing', () => {
    expect(parseTotals({ status: false, error: { message: 'nope' } })).toBeNull();
  });
  it('returns null when the data block is missing', () => {
    expect(parseTotals({ status: true })).toBeNull();
  });
});

describe('alreadyDone', () => {
  it('collects region ids from previously written NDJSON lines', () => {
    const lines = [
      JSON.stringify({ level: 'district', regionId: 3826 }),
      JSON.stringify({ level: 'block', regionId: 38105 }),
    ];
    const done = alreadyDone(lines);
    expect(done.has(3826)).toBe(true);
    expect(done.has(38105)).toBe(true);
    expect(done.has(999)).toBe(false);
  });
  it('ignores malformed lines instead of crashing the resume', () => {
    const done = alreadyDone(['not json', JSON.stringify({ regionId: 7 })]);
    expect(done.has(7)).toBe(true);
    expect(done.size).toBe(1);
  });
});
