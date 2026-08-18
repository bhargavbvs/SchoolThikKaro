import { describe, it, expect } from 'vitest';
import { slugify, assertNoCollisions } from '../scripts/lib/slug.mjs';

describe('slugify', () => {
  it('lowercases and hyphenates a plain name', () => {
    expect(slugify('EAST KHASI HILLS')).toBe('east-khasi-hills');
  });
  it('collapses runs of punctuation into a single hyphen', () => {
    expect(slugify('JAMMU  &  KASHMIR')).toBe('jammu-kashmir');
  });
  it('trims leading and trailing hyphens', () => {
    expect(slugify('  (MYLLIEM)  ')).toBe('mylliem');
  });
  it('keeps digits, which appear in real block names', () => {
    expect(slugify('BLOCK 24 PARGANAS')).toBe('block-24-parganas');
  });
  it('handles a name that slugs to empty by falling back to a marker', () => {
    expect(slugify('!!!')).toBe('unnamed');
  });
});

describe('assertNoCollisions', () => {
  it('returns a name->slug map when all slugs are unique', () => {
    const m = assertNoCollisions(['MYLLIEM', 'SHELLA'], 'block');
    expect(m.get('MYLLIEM')).toBe('mylliem');
    expect(m.size).toBe(2);
  });
  it('THROWS when two different names produce the same slug', () => {
    expect(() => assertNoCollisions(['EAST KHASI', 'east  khasi'], 'district'))
      .toThrow(/collision/i);
  });
  it('names both colliding values in the error, so it is debuggable', () => {
    expect(() => assertNoCollisions(['A B', 'a-b'], 'district'))
      .toThrow(/A B|a-b/);
  });
  it('does not treat the same name appearing twice as a collision', () => {
    const m = assertNoCollisions(['MYLLIEM', 'MYLLIEM'], 'block');
    expect(m.size).toBe(1);
  });
});
