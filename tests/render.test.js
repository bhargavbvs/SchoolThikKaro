import { describe, it, expect } from 'vitest';
import { esc, fmtRate, renderBlockPage, renderStatePage, renderIndexPage }
  from '../scripts/lib/render.mjs';
import { officialClaimRate } from '../scripts/lib/format.mjs';

// State outlines, shaped like data/india-states.json but with two toy
// shapes — renderIndexPage needs geometry, not the real 104KB of it.
const geo = {
  viewBox: '0 0 100 100',
  shapes: [
    { key: 'MEGHALAYA', label: 'Meghalaya', d: 'M0 0L10 0L10 10Z' },
    { key: 'KERALA', label: 'Kerala', d: 'M20 20L30 20L30 30Z' },
  ],
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
  it('compares the block rate to its district, so the page is not a bare template', () => {
    // Place names render title-cased, not as the raw all-caps UDISE values.
    expect(html).toMatch(/East Khasi Hills/);
    expect(html).toMatch(/Meghalaya/);
    expect(html).toContain('1 in 4');
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
  it('links each school straight into the report form for that exact school', () => {
    // Until /report/<udise> existed, the best a row could do was open the
    // state map and leave the reader to hunt for the pin.
    expect(html).toMatch(/<a href="\/app\/#\/report\/17040300201">GOVT LP MYLLIEM<\/a>/);
  });
});

describe('renderStatePage', () => {
  it('lists districts with their rates', () => {
    const html = renderStatePage(state);
    expect(html).toContain('East Khasi Hills');
    expect(html).toContain('1 in 4');
  });
  it('sets Open Graph tags for rich link previews', () => {
    const html = renderStatePage(state);
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url"');
  });

  it('leads with the rate as a hero figure, not buried in a paragraph', () => {
    const html = renderStatePage(state, 5.63);
    expect(html).toMatch(/class="hero-rate"[\s\S]*?1 in 3/);
  });

  it('places the rate against the national average, since a bare % means nothing alone', () => {
    const html = renderStatePage(state, 5.63);
    // 29.7 / 5.63 = 5.3x
    expect(html).toMatch(/5\.3× the national average/);
  });

  it('omits the comparison line entirely when no baseline was supplied', () => {
    expect(renderStatePage(state)).not.toContain('class="cmp');
  });

  it('gives each row a rate bar scaled to the largest rate in this table', () => {
    const html = renderStatePage(state, 5.63);
    // Only one district in the fixture, so it is the max and gets a full bar.
    expect(html).toMatch(/class="bar [^"]*" style="--w:100%"/);
  });

  it('colours the bar by absolute severity, so pages stay comparable to each other', () => {
    // The fixture district is 25.9% against a 5.63% national rate — 4.6x,
    // so it must read as high even though it fills its own table's bar.
    expect(renderStatePage(state, 5.63)).toMatch(/class="bar is-high"/);
  });

  it('offers a filter box for long lists, carrying a searchable name on each row', () => {
    const html = renderStatePage(state, 5.63);
    expect(html).toContain('id="filter"');
    expect(html).toContain('data-name="east khasi hills"');
  });

  it('ships the filter input hidden so it never appears without the JS that drives it', () => {
    // Rows are pre-rendered and all visible with JS off; the script unhides
    // the input only once it has wired up the listener.
    expect(renderStatePage(state, 5.63)).toMatch(/<input id="filter"[^>]*\shidden\b/);
  });
});

describe('renderIndexPage', () => {
  const html = renderIndexPage(tree, geo);
  it('shows the national headline figure', () => {
    expect(html).toContain('78,744');
  });
  it('lists states, title-cased rather than as raw all-caps data', () => {
    expect(html).toContain('Meghalaya');
    expect(html).not.toContain('>MEGHALAYA<');
  });
  it('ships NO SPA bundle — the whole point of the static map', () => {
    // The router matches an empty hash, so merely including the bundle
    // booted MapLibre (~960KB) for every visitor who wanted to read a
    // table. If a module script ever reappears here, that cost is back.
    expect(html).not.toMatch(/<script[^>]+type="module"/);
    expect(html).not.toMatch(/\/assets\/index-[^"]*\.js/);
  });
  it('draws the state map inline, with no map library and no tile requests', () => {
    expect(html).toContain('class="india"');
    expect(html).toContain('class="legend"');
    expect(html).not.toMatch(/maplibre|basemaps\.cartocdn|id="map"/);
  });
  it('forwards legacy SPA links so QR codes already in the field keep working', () => {
    // src/submit/qr.js prints /#/report/<udise> onto physical school walls.
    expect(html).toContain("location.replace('/app/'+h)");
  });
  it('links each state on the map to its own browse page', () => {
    expect(html).toContain('href="/state/meghalaya"');
  });
  it('requires the state geometry — a homepage with no map is a build error, not a style bug', () => {
    expect(() => renderIndexPage(tree)).toThrow(/geo\.shapes is required/);
    expect(() => renderIndexPage(tree, { shapes: [] })).toThrow(/geo\.shapes is required/);
  });
});


describe('the homepage is about schools, not only about toilets', () => {
  const html = renderIndexPage(tree, geo);

  it('leads with the record being wrong, not with a toilet', () => {
    // The site is School Thik Karo — get the school fixed. A headline
    // about one fixture argued the whole project down to its narrowest
    // possible claim.
    const h1 = html.match(/<h1>[\s\S]*?<\/h1>/)[0];
    expect(h1.toLowerCase()).not.toContain('toilet');
  });

  it('still states the toilet finding exactly, because that is the evidence', () => {
    // Broader framing must not cost the precision the argument rests on.
    // Derived from the fixture with the same helpers the page uses, so this
    // asserts the wiring rather than a number copied from production.
    expect(html).toContain(fmtRate(officialClaimRate(tree.national)));
    expect(html).toContain(tree.national.nonFunctional.toLocaleString('en-IN'));
  });

  it('says plainly that the figures cover one thing only', () => {
    expect(html).toMatch(/one thing, in one year’s data|that is what this release\s+measures/);
  });

  it('invites reports on everything the form now accepts', () => {
    for (const thing of ['drinking water', 'electricity', 'classroom', 'ramp']) {
      expect(html.toLowerCase()).toContain(thing);
    }
  });

  it('offers reporting as a first-class action, not a footnote', () => {
    const actions = html.match(/<div class="actions">[\s\S]*?<\/div>/)[0];
    expect(actions).toContain('Report what you find');
  });
});

describe('the page uses the reader’s words, not ours', () => {
  const index = renderIndexPage(tree, geo);
  const statePage = renderStatePage(state, 5.63);

  it('never labels a column "Flagged" or "Rate"', () => {
    // Both are this project's internal vocabulary. A visitor should be able
    // to read a column heading and know what the number under it counts.
    const thead = index.match(/<thead>[\s\S]*?<\/thead>/)[0];
    expect(thead).not.toMatch(/Flagged|Rate<\/th>/);
    expect(thead).toContain('Schools with issues');
    expect(thead).toContain('All schools');
  });

  it('names the column for what it actually lists on each page', () => {
    expect(index).toMatch(/<th>State<\/th>/);
    expect(statePage).toMatch(/<th>District<\/th>/);
  });

  it('says what the headline figure counts instead of saying "flagged"', () => {
    expect(statePage).toContain('has an issue in the government’s record');
    expect(statePage).not.toContain('of schools flagged');
  });

  it('gives every headline figure a heading in ordinary words', () => {
    // A bare number with a trailing sentence makes the reader meet the
    // figure before learning what it counts.
    const heads = [...index.matchAll(/<h2 class="stat-head">([^<]*)<\/h2>/g)].map((m) => m[1]);
    expect(heads).toHaveLength(3);
    for (const h of heads) expect(h).not.toMatch(/flagged|rate|indicator/i);
  });

  it('carries the project name in the wordmark and the page title', () => {
    expect(index).toContain('>SchoolThikKaro<');
    expect(index).toMatch(/<title>SchoolThikKaro/);
    expect(statePage).toMatch(/<title>[^<]*SchoolThikKaro<\/title>/);
  });
});

describe('filtering works on a phone, where most rows start hidden', () => {
  const html = renderIndexPage(tree, geo);

  it('shows a match with an explicit display value, not by clearing the style', () => {
    // browse.css hides rows 11+ on narrow screens until "Show all" is
    // tapped. Clearing the inline style hands the row straight back to
    // that rule, so searching for a state outside the top ten returned an
    // empty table. Only an inline value outranks the stylesheet.
    expect(html).toContain("'table-row'");
    expect(html).not.toMatch(/indexOf\(q\)>-1\?'':'none'/);
  });

  it('restores the ten-row view when the query is cleared', () => {
    expect(html).toContain("!q?''");
  });
});

describe('percentages', () => {
  it('appear nowhere except the government’s own headline claim', () => {
    // Percentages were removed in favour of "1 in N", which a reader can
    // picture. The one exception is the official "has a girls' toilet"
    // figure: that is the government's number, stated the way they state
    // it, and it is the thing the page exists to challenge.
    const pages = [renderIndexPage(tree, geo), renderStatePage(state, 5.63),
      renderBlockPage(state, district, block, 5.63)];
    const official = fmtRate(officialClaimRate(tree.national));
    for (const page of pages) {
      const text = page.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]*>/g, ' ');
      const found = (text.match(/\d[\d,]*\.?\d*\s?%/g) ?? []).filter((m) => m.trim() !== official);
      expect(found, `unexpected percentage(s): ${found.join(', ')}`).toEqual([]);
    }
  });

  it('states how common a problem is as a count of schools', () => {
    const html = renderStatePage(state, 5.63);
    expect(html).toMatch(/1 in \d/);
  });
});
