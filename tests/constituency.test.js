import { describe, it, expect } from 'vitest';
import { normalizeConstituency, editDistance, buildIndex, matchConstituency }
  from '../scripts/lib/constituency.mjs';

// Real names from both sides: UDISE+ school records and our AP files.
const reps = [
  { constituency: { number: 29, name: 'Paderu' }, representative: { name: 'A' } },
  { constituency: { number: 81, name: 'Vijayawada East' }, representative: { name: 'B' } },
  { constituency: { number: 79, name: 'Vijayawada West' }, representative: { name: 'C' } },
  { constituency: { number: 80, name: 'Vijayawada Central' }, representative: { name: 'D' } },
  { constituency: { number: 129, name: 'Pulivendla' }, representative: { name: 'E' } },
  { constituency: { number: 152, name: 'Singanamala' }, representative: { name: 'F' } },
  { constituency: { number: 102, name: 'Yerragondapalem' }, representative: { name: 'G' } },
];
const index = buildIndex(reps);

describe('normalizeConstituency', () => {
  it('drops a reservation marker, which is metadata about the seat', () => {
    expect(normalizeConstituency('Paderu(ST)')).toBe(normalizeConstituency('Paderu'));
    expect(normalizeConstituency('Signamala(SC)')).toBe('SIGNAMALA');
  });
  it('KEEPS a bracketed direction, which is part of the name', () => {
    // Three Vijayawada seats, three different MLAs. Stripping "(East)"
    // collapses them into one and hands two-thirds of the city the wrong
    // representative.
    expect(normalizeConstituency('Vijayawada(East)'))
      .not.toBe(normalizeConstituency('Vijayawada(West)'));
    expect(normalizeConstituency('Vijayawada(East)'))
      .toBe(normalizeConstituency('Vijayawada East'));
  });
  it('drops a leading constituency number', () => {
    expect(normalizeConstituency('55-SALMANPARA (ST)')).toBe('SALMANPARA');
  });
  it('handles a missing name without throwing', () => {
    expect(normalizeConstituency(null)).toBe('');
  });
});

describe('editDistance', () => {
  it('is zero for identical strings', () => {
    expect(editDistance('ABC', 'ABC')).toBe(0);
  });
  it('measures the real transliteration gap', () => {
    expect(editDistance('PULIVENDULA', 'PULIVENDLA')).toBe(1);
  });
  it('gives up cheaply once past the cap', () => {
    expect(editDistance('AAAA', 'ZZZZZZZZZZZZ', 3)).toBeGreaterThan(3);
  });
});

describe('matchConstituency', () => {
  it('matches exactly once the reservation marker is gone', () => {
    const m = matchConstituency('Paderu(ST)', index);
    expect(m.exact).toBe(true);
    expect(m.rep.constituency.number).toBe(29);
  });

  it('picks the right one of three same-named city seats', () => {
    expect(matchConstituency('Vijayawada(East)', index).rep.constituency.number).toBe(81);
    expect(matchConstituency('Vijayawada(West)', index).rep.constituency.number).toBe(79);
  });

  it('bridges a transliteration difference', () => {
    const m = matchConstituency('Pulivendula', index);
    expect(m.rep.constituency.name).toBe('Pulivendla');
    expect(m.exact).toBe(false);
  });

  it('bridges the other real spelling variants', () => {
    expect(matchConstituency('Signamala(SC)', index).rep.constituency.number).toBe(152);
    expect(matchConstituency('Yerragondpalem(SC)', index).rep.constituency.number).toBe(102);
  });

  it('refuses to guess when two constituencies are equally close', () => {
    // A bare "Vijayawada" is one edit from East, West and Central. Naming
    // any of them would be a coin flip printed as a fact.
    expect(matchConstituency('Vijayawadaa', index)).toBeNull();
  });

  it('returns null for a constituency we simply do not hold', () => {
    // Puttaparthi is genuinely absent from our 174 AP files.
    expect(matchConstituency('Puttaparthi', index)).toBeNull();
  });

  it('returns null rather than throwing on a missing name', () => {
    expect(matchConstituency(null, index)).toBeNull();
  });
});
