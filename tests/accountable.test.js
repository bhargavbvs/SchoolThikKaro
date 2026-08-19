import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { indexRepresentatives, accountableFor, displayName, askLine }
  from '../scripts/lib/accountable.mjs';

const reps = JSON.parse(readFileSync('data/representatives.json', 'utf8'));
const index = indexRepresentatives(reps);

describe('accountableFor', () => {
  it('names the sitting member for a constituency we hold', () => {
    const [e] = accountableFor([{ constituency: 'Paderu(ST)' }], index);
    expect(e.member).toBeTruthy();
    expect(e.party).toBeTruthy();
    expect(e.exact).toBe(true);
  });

  it('counts how many of the schools each seat actually covers', () => {
    // A block can straddle seats. Saying "this MLA" over a list that is
    // mostly someone else's would be a misreport.
    const out = accountableFor([
      { constituency: 'Paderu(ST)' }, { constituency: 'Paderu(ST)' },
      { constituency: 'Madugula' },
    ], index);
    expect(out[0].schools).toBe(2);
    expect(out[1].schools).toBe(1);
  });

  it('leads with the seat covering the most schools', () => {
    const out = accountableFor([
      { constituency: 'Madugula' },
      { constituency: 'Paderu(ST)' }, { constituency: 'Paderu(ST)' },
    ], index);
    expect(out[0].constituency).toMatch(/Paderu/);
  });

  it('still reports a seat it cannot match, with no name', () => {
    // Puttaparthi is genuinely absent from the 174 files. Dropping it
    // silently would understate how many seats the block spans.
    const [e] = accountableFor([{ constituency: 'Puttaparthi' }], index);
    expect(e.constituency).toMatch(/Puttaparthi/);
    expect(e.member).toBeNull();
  });

  it('marks a near match as inexact, so a guess is never shown as certain', () => {
    const [e] = accountableFor([{ constituency: 'Pulivendula' }], index);
    expect(e.member).toBeTruthy();
    expect(e.exact).toBe(false);
  });

  it('carries a source for every name it prints', () => {
    const [e] = accountableFor([{ constituency: 'Paderu(ST)' }], index);
    expect(e.source).toMatch(/^https?:\/\//);
  });

  it('never carries assets, cases or any other judgement of the person', () => {
    // The projection in build-representatives.mjs leaves these out on
    // purpose; this fails if that ever changes.
    const [e] = accountableFor([{ constituency: 'Paderu(ST)' }], index);
    const keys = Object.keys(e).join(' ');
    expect(keys).not.toMatch(/asset|case|liabilit|education|photo|age/i);
  });

  it('handles an empty or unusable school list', () => {
    expect(accountableFor([], index)).toEqual([]);
    expect(accountableFor(null, index)).toEqual([]);
    expect(accountableFor([{}], index)).toEqual([]);
  });
});

describe('displayName', () => {
  it('keeps the reservation, which is real information about the seat', () => {
    expect(displayName('Paderu(ST)')).toBe('Paderu (ST)');
  });
  it('drops the leading number UDISE prints', () => {
    expect(displayName('55-SALMANPARA (ST)')).toBe('Salmanpara (ST)');
  });
  it('spaces a bracketed direction without lowercasing a correct name', () => {
    expect(displayName('Vijayawada(East)')).toBe('Vijayawada (East)');
  });
});

describe('askLine', () => {
  it('states who holds the seat, and nothing more', () => {
    const [e] = accountableFor([{ constituency: 'Paderu(ST)' }], index);
    const line = askLine(e);
    expect(line).toMatch(/holds Paderu \(ST\)\./);
    // No verb of blame: the record predates most terms.
    expect(line).not.toMatch(/failed|responsible for|caused|neglect/i);
  });
  it('returns null when we have no name, so callers render nothing', () => {
    expect(askLine({ member: null })).toBeNull();
  });
});
