import { describe, it, expect } from 'vitest';
import { collectUrls, renderSitemap } from '../scripts/lib/sitemap.mjs';

const tree = { national: {}, states: [{
  slug: 'meghalaya', name: 'MEGHALAYA', districts: [{
    slug: 'east-khasi-hills', name: 'EAST KHASI HILLS',
    blocks: [{ slug: 'mylliem', name: 'MYLLIEM' }, { slug: 'shella', name: 'SHELLA' }],
  }],
}] };

describe('collectUrls', () => {
  const urls = collectUrls(tree);

  it('includes the root, every state, district, and block exactly once', () => {
    expect(urls).toEqual([
      '/',
      '/state/meghalaya',
      '/state/meghalaya/east-khasi-hills',
      '/state/meghalaya/east-khasi-hills/mylliem',
      '/state/meghalaya/east-khasi-hills/shella',
    ]);
  });
  it('produces no duplicates', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe('renderSitemap', () => {
  const xml = renderSitemap(['/', '/state/meghalaya'], 'https://example.org');

  it('emits absolute URLs', () => {
    expect(xml).toContain('<loc>https://example.org/</loc>');
    expect(xml).toContain('<loc>https://example.org/state/meghalaya</loc>');
  });
  it('emits a valid urlset envelope', () => {
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trim().endsWith('</urlset>')).toBe(true);
  });
  it('escapes ampersands, which would otherwise be invalid XML', () => {
    expect(renderSitemap(['/a&b'], 'https://x.org')).toContain('/a&amp;b');
  });
});
