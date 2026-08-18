import { describe, it, expect } from 'vitest';
import { joinSchools, parseCsvLine } from '../scripts/lib/coords.mjs';

describe('parseCsvLine', () => {
  it('splits a plain comma-separated line', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a comma inside a quoted field from shifting later columns', () => {
    // Real row from udise_schools.csv — this exact school name broke a naive
    // split(',') and corrupted every field after it, including lat/lng.
    const line = '1260399,1260399,12160404001,"GOVT. UPPER PRIMARY SCHOOL, QUIBANG",2,Primary';
    const f = parseCsvLine(line);
    expect(f[3]).toBe('GOVT. UPPER PRIMARY SCHOOL, QUIBANG');
    expect(f).toHaveLength(6);
  });

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(parseCsvLine('a,"He said ""hi""",c')).toEqual(['a', 'He said "hi"', 'c']);
  });
});

describe('joinSchools', () => {
  const coords = new Map([
    ['28133390196', { lat: 17.6903, lng: 83.0418 }],
    ['02813339019', { lat: 10.0, lng: 77.0 }],
  ]);

  it('attaches coordinates when the code matches', () => {
    const [out] = joinSchools([{ udise: '28133390196', name: 'A' }], coords).matched;
    expect(out.lat).toBeCloseTo(17.6903);
  });

  it('matches a school whose coordinate row lost its leading zero', () => {
    const r = joinSchools([{ udise: '02813339019', name: 'B' }], coords);
    expect(r.matched).toHaveLength(1);
    expect(r.unmatched).toHaveLength(0);
  });

  it('reports unmatched schools rather than dropping them silently', () => {
    const r = joinSchools([{ udise: '99999999999', name: 'C' }], coords);
    expect(r.matched).toHaveLength(0);
    expect(r.unmatched).toHaveLength(1);
    expect(r.matchRate).toBe(0);
  });

  it('computes a match rate across a mixed batch', () => {
    const r = joinSchools(
      [{ udise: '28133390196' }, { udise: '99999999999' }], coords);
    expect(r.matchRate).toBeCloseTo(0.5);
  });
});
