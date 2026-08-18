import { describe, it, expect } from 'vitest';
import { esc, fmtRate, renderBlockPage, renderStatePage, renderIndexPage }
  from '../scripts/lib/render.mjs';
import { extractAssetTags } from '../scripts/lib/assets.mjs';

// A real-shaped hashed asset-tag pair, of the kind Vite's own build writes
// into dist/index.html. Used explicitly instead of relying on any default —
// renderIndexPage has no default any more (see scripts/lib/render.mjs):
// the old default was itself the dead dev-time path that shipped as a real
// production bug once already.
const assetTags = {
  script: '<script type="module" crossorigin src="/assets/index-DEADBEEF.js"></script>',
  style: '/assets/index-DEADBEEF.css',
};

const block = { slug: 'mylliem', name: 'MYLLIEM', flagged: 7, total: 196, rate: 3.571,
  noToilet: 4, nonFunctional: 3,
  schools: [{ udise: '17040300201', name: 'GOVT LP MYLLIEM', indicator: 'no_girls_toilet' }] };
const district = { slug: 'east-khasi-hills', name: 'EAST KHASI HILLS', flagged: 312,
  total: 1204, rate: 25.9, noToilet: 200, nonFunctional: 112, blocks: [block] };
const state = { slug: 'meghalaya', name: 'MEGHALAYA', flagged: 4326, total: 14555,
  rate: 29.7, noToilet: 2601, nonFunctional: 1725, districts: [district] };
const tree = { national: { flagged: 78744, total: 1460759, rate: 5.39,
  noToilet: 39558, nonFunctional: 48324 }, states: [state] };

describe('esc', () => {
  it('escapes HTML so a school name cannot inject markup', () => {
    expect(esc('<img onerror=x>')).not.toContain('<img');
  });
  it('escapes quotes, which matter inside attributes', () => {
    expect(esc('a"b')).toBe('a&quot;b');
  });
});

describe('fmtRate', () => {
  it('formats a percentage to one decimal', () => {
    expect(fmtRate(3.571)).toBe('3.6%');
  });
  it('renders an explicit dash when the rate is unknown', () => {
    expect(fmtRate(null)).toBe('—');
  });
});

describe('renderBlockPage', () => {
  const html = renderBlockPage(state, district, block);

  it('names the source and year, per the parent spec', () => {
    expect(html).toContain('UDISE+ 2024-25');
  });
  it('lists the block\'s schools with their UDISE codes', () => {
    expect(html).toContain('GOVT LP MYLLIEM');
    expect(html).toContain('17040300201');
  });
  it('compares the block rate to its district and state, so the page is not a bare template', () => {
    expect(html).toMatch(/EAST KHASI HILLS/);
    expect(html).toMatch(/MEGHALAYA/);
    expect(html).toContain('25.9%');
  });
  it('renders a breadcrumb back up the hierarchy', () => {
    expect(html).toContain('/state/meghalaya');
    expect(html).toContain('/state/meghalaya/east-khasi-hills');
  });
  it('does NOT load the SPA bundle', () => {
    expect(html).not.toContain('main.js');
  });
  it('sets a canonical URL', () => {
    expect(html).toContain('rel="canonical"');
  });
  it('sets Open Graph tags for rich link previews (e.g. WhatsApp)', () => {
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
  });
  it('wraps each school row in a link, since there is no per-school page yet', () => {
    // #/school/<udise> deep linking is real future work (Phase 3, per the
    // spec's "Deferred, explicitly" section) — the interim link goes to
    // the existing, working map route for the school's state.
    expect(html).toMatch(/<a href="\/#\/state\/meghalaya">GOVT LP MYLLIEM<\/a>/);
  });
});

describe('renderStatePage', () => {
  it('lists districts with their rates', () => {
    const html = renderStatePage(state);
    expect(html).toContain('EAST KHASI HILLS');
    expect(html).toContain('25.9%');
  });
  it('sets Open Graph tags for rich link previews', () => {
    const html = renderStatePage(state);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
  });
});

describe('renderIndexPage', () => {
  const html = renderIndexPage(tree, assetTags);
  it('shows the national headline figure', () => {
    expect(html).toContain('78,744');
  });
  it('lists states', () => {
    expect(html).toContain('MEGHALAYA');
  });
  it('DOES load the SPA bundle, for the map section below the fold — the real ' +
    'built tag it was given, not a literal "main.js" (there is no dev-time default any more)', () => {
    expect(html).toContain(assetTags.script);
  });
  it('carries a body class browse.css can use to clear the SPA\'s fixed topbar', () => {
    expect(html).toContain('class="browse has-spa"');
  });
  it('requires assetTags.script — there is no dev-time fallback', () => {
    expect(() => renderIndexPage(tree)).toThrow(/assetTags\.script is required/);
    expect(() => renderIndexPage(tree, {})).toThrow(/assetTags\.script is required/);
  });
});

describe('extractAssetTags', () => {
  it('finds a real hashed <script type="module" crossorigin src="..."> tag', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="/assets/index-DQVWydt9.css" />
      </head><body>
      <script type="module" crossorigin src="/assets/index-CjijMEpu.js"></script>
      </body></html>`;
    const tags = extractAssetTags(html);
    expect(tags.script).toBe('<script type="module" crossorigin src="/assets/index-CjijMEpu.js"></script>');
  });

  it('throws a clear error when no script tag exists in the input HTML', () => {
    expect(() => extractAssetTags('<html><head></head><body>no script here</body></html>'))
      .toThrow(/no built <script/);
  });

  it('still finds the stylesheet href when href appears before rel="stylesheet" ' +
    '(the exact attribute-order case the earlier hardening fix was for)', () => {
    const html = `<html><head>
      <link crossorigin href="/assets/index-DQVWydt9.css" rel="stylesheet" />
      </head><body>
      <script type="module" crossorigin src="/assets/index-CjijMEpu.js"></script>
      </body></html>`;
    const tags = extractAssetTags(html);
    expect(tags.style).toBe('/assets/index-DQVWydt9.css');
  });
});
