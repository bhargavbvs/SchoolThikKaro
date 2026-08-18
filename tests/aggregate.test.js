import { describe, it, expect } from 'vitest';
import { buildTree, rate } from '../scripts/lib/aggregate.mjs';

const schools = [
  { udise: '11111111111', name: 'A', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', indicator: 'no_girls_toilet' },
  { udise: '22222222222', name: 'B', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', indicator: 'girls_toilet_nonfunctional' },
  { udise: '33333333333', name: 'C', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'SHELLA', indicator: 'no_girls_toilet' },
  { udise: '44444444444', name: 'D', state: 'ASSAM', district: 'KAMRUP', block: 'RANI', indicator: 'no_girls_toilet' },
];

const totals = [
  { level: 'district', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', girlsCoed: 300 },
  { level: 'block', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'MYLLIEM', girlsCoed: 100 },
  { level: 'block', state: 'MEGHALAYA', district: 'EAST KHASI HILLS', block: 'SHELLA', girlsCoed: 50 },
  { level: 'district', state: 'ASSAM', district: 'KAMRUP', girlsCoed: 200 },
  { level: 'block', state: 'ASSAM', district: 'KAMRUP', block: 'RANI', girlsCoed: 80 },
];

describe('rate', () => {
  it('computes a percentage', () => {
    expect(rate(16, 1947)).toBeCloseTo(0.82, 2);
  });
  it('returns null rather than Infinity when the denominator is missing', () => {
    expect(rate(5, 0)).toBeNull();
    expect(rate(5, null)).toBeNull();
  });
});

describe('buildTree', () => {
  const tree = buildTree(schools, totals);

  it('rolls block counts up into their district', () => {
    const ekh = tree.states.find((s) => s.name === 'MEGHALAYA').districts[0];
    const blockSum = ekh.blocks.reduce((n, b) => n + b.flagged, 0);
    expect(blockSum).toBe(ekh.flagged);
    expect(ekh.flagged).toBe(3);
  });

  it('rolls district counts up into their state', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    const distSum = meg.districts.reduce((n, d) => n + d.flagged, 0);
    expect(distSum).toBe(meg.flagged);
  });

  it('rolls state counts up into the national total', () => {
    const stateSum = tree.states.reduce((n, s) => n + s.flagged, 0);
    expect(stateSum).toBe(tree.national.flagged);
    expect(tree.national.flagged).toBe(4);
  });

  it('splits the two indicators and they sum to flagged', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    expect(meg.noToilet + meg.nonFunctional).toBe(meg.flagged);
    expect(meg.noToilet).toBe(2);
    expect(meg.nonFunctional).toBe(1);
  });

  it('uses the girls/co-ed denominator for rate, not total schools', () => {
    const mylliem = tree.states.find((s) => s.name === 'MEGHALAYA')
      .districts[0].blocks.find((b) => b.name === 'MYLLIEM');
    expect(mylliem.rate).toBeCloseTo(2.0, 5); // 2 of 100
  });

  it('sorts states by rate descending', () => {
    const rates = tree.states.map((s) => s.rate);
    expect(rates[0]).toBeGreaterThanOrEqual(rates[1]);
  });

  it('slugs every level', () => {
    const meg = tree.states.find((s) => s.name === 'MEGHALAYA');
    expect(meg.slug).toBe('meghalaya');
    expect(meg.districts[0].slug).toBe('east-khasi-hills');
  });

  it('leaves rate null when a region had no totals row, rather than guessing', () => {
    const orphan = buildTree(
      [{ udise: '5', name: 'E', state: 'X', district: 'Y', block: 'Z', indicator: 'no_girls_toilet' }],
      []);
    expect(orphan.states[0].rate).toBeNull();
    expect(orphan.states[0].flagged).toBe(1);
  });
});
