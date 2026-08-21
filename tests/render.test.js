import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { esc, fmtRate, renderBlockPage, renderStatePage, renderDistrictPage, renderIndexPage }
  from '../scripts/lib/render.mjs';
import { officialClaimRate } from '../scripts/lib/format.mjs';
import { indexRepresentatives } from '../scripts/lib/accountable.mjs';

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
  // Carries a constituency as UDISE+ spells it, so the accountability
  // panel is exercised rather than skipped.
  schools: [{ udise: '17040300201', name: 'GOVT LP MYLLIEM', indicator: 'no_girls_toilet',
    constituency: 'Paderu(ST)' }] };
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

  it('still states the count the official figure hides', () => {
    // The standfirst that carried the official percentage was removed. The
    // argument now rests entirely on the second stat card, so that card's
    // figure and its framing are what must not drift.
    // It now sits in the third headline box, beside the figure it
    // qualifies, rather than in a card of its own.
    expect(html).toContain(tree.national.nonFunctional.toLocaleString('en-IN'));
    expect(html).toMatch(/toilet that does not work, counted as fine/i);
    // And says whose finding it is. The schools were found short by the
    // government's own report, not by us — the footer says so, and now
    // the figure itself does too.
    expect(html).toMatch(/found short of a working girls’ toilet by the/i);
  });

  it('says plainly that the figures cover one thing only', () => {
    expect(html).toMatch(/that is all this release counts|only issue in this release/);
  });

  it('invites reports on everything the form now accepts', () => {
    // Named in the reader's words rather than ours — "the wiring", not
    // "electricity" — but the point is that it is plainly more than a toilet.
    for (const thing of ['water', 'wiring', 'classroom', 'ramp']) {
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
    expect(thead).toContain('How common');
    // The denominator column is gone: "1 in 3" already carries the ratio,
    // and four columns wrapped the headings onto three lines on a phone.
    // The full count still leads every region page's hero.
    expect(thead).not.toContain('All schools');
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
    const heads = [...index.matchAll(/<span class="stat-label">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(heads).toHaveLength(3);
    for (const h of heads) expect(h).not.toMatch(/flagged|rate|indicator/i);
  });

  it('carries the project name in the wordmark and the page title', () => {
    expect(index).toContain('>SchoolThikKaro<');
    expect(index).toMatch(/<title>SchoolThikKaro/);
    expect(statePage).toMatch(/<title>[^<]*SchoolThikKaro<\/title>/);
  });
});

describe('long lists are paged, not dumped', () => {
  const html = renderIndexPage(tree, geo);

  it('ships a pager, hidden until the script reveals it', () => {
    // Without JavaScript the reader gets the whole list, which is the
    // better fallback than controls that do nothing.
    expect(html).toMatch(/<nav class="pager" id="pager" hidden/);
    // It is revealed only when there is more than one page — the script
    // decides, so a short list never shows dead controls either.
    expect(html).toContain('pager.hidden=pages<=1');
  });

  it('pages the FILTERED set, not the whole table', () => {
    // Paging the full table means searching for a district can land you
    // on page 4 of results that no longer exist.
    expect(html).toMatch(/q=input\.value[\s\S]*?page=0/);
  });

  it('keeps every row in the DOM, so crawlers still see the whole list', () => {
    const bodyRows = (html.match(/<tr data-name=/g) ?? []).length;
    expect(bodyRows).toBe(tree.states.length);
  });

  it('hides the pager when everything fits on one page', () => {
    expect(html).toContain('pager.hidden=pages<=1');
  });

  it('numbers rows by their position on screen, not by a fixed rank', () => {
    // A row is 03 because it is third in what you are looking at. Sorting
    // by a different column renumbers them.
    expect(html).toContain("c.textContent=String(k+1)");
  });

  it('makes the whole row a target without removing the link', () => {
    // The anchor is what a crawler follows and what a keyboard reaches;
    // the row click only widens the target around it.
    expect(html).toMatch(/td\.name a/);
    expect(html).toMatch(/if\(e\.target\.closest\('a'\)\) return;/);
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

describe('theme', () => {
  const html = renderIndexPage(tree, geo);

  it('defaults to light regardless of the device setting', () => {
    // The page is a printed public record. A visitor arriving from a phone
    // in night mode was silently getting a different document from
    // everyone else, with no way to say otherwise.
    const css = readFileSync('public/browse.css', 'utf8');
    // The words may still appear in a comment explaining the decision;
    // what must not exist is a media query acting on them.
    expect(css).not.toMatch(/@media[^{]*prefers-color-scheme/);
    expect(css).toContain(':root[data-theme="dark"]');
  });

  it('offers a toggle, so dark is a choice rather than an accident', () => {
    expect(html).toContain('id="theme-toggle"');
  });

  it('ships the toggle hidden, so a reader without JavaScript never sees a dead control', () => {
    expect(html).toMatch(/id="theme-toggle" hidden/);
    expect(html).toContain("b.hidden=false");
  });

  it('applies a stored choice before first paint, so there is no flash of the wrong theme', () => {
    const head = html.slice(0, html.indexOf('</head>'));
    expect(head).toContain("localStorage.getItem('shaala.theme')");
  });

  it('stores the choice under the key the reporting flow already uses', () => {
    // Switching theme on a browse page must carry into /app/ and back.
    expect(html).toContain("localStorage.setItem('shaala.theme'");
  });
});

describe('table headers', () => {
  it('style every column heading the same, numeric or not', () => {
    // th.num once inherited td.num's 14px body-coloured font, so "SCHOOLS
    // WITH ISSUES" rendered larger and darker than "DISTRICT" beside it.
    // A numeric header takes the alignment and nothing else.
    const css = readFileSync('public/browse.css', 'utf8');
    const thNum = css.match(/table\.stats th\.num \{[^}]*\}/)[0];
    expect(thNum).toContain('text-align:right');
    expect(thNum).not.toMatch(/font:|color:/);
  });

  it('still right-aligns the numbers in the body', () => {
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css).toMatch(/table\.stats td\.num \{[^}]*text-align:right/);
  });
});

describe('horizontal rules line up', () => {
  const css = readFileSync('public/browse.css', 'utf8');

  it('does not draw a second rule under the one .head already draws', () => {
    // .atlas breaks out to 1320px while the page is 1060px, so a rule of
    // its own stacked directly under .head's as two lines of two lengths.
    // EVERY .atlas rule, not the first one. A later block re-added the
    // border once and this test passed anyway, because it only looked at
    // the top of the file.
    for (const rule of css.match(/\.atlas \{[^}]*\}/g) ?? []) {
      expect(rule, rule).not.toMatch(/border-top/);
    }
  });

  it('keeps every remaining rule at the page width, so they align', () => {
    // Anything that draws a full-width rule must not also break out.
    for (const sel of ['.findmine', '.head']) {
      const rule = css.match(new RegExp(`\\${sel} \\{[^}]*\\}`))[0];
      expect(rule).not.toMatch(/--atlas-w|100vw/);
    }
  });

  it('wraps the table note to its column beside the map', () => {
    // 70ch inside the 420px column ran the note off the side of the page.
    expect(css).toMatch(/\.atlas-table \.table-note \{[^}]*max-width:100%/);
  });
});

describe('the headline is the reader\'s path through the site', () => {
  const html = renderIndexPage(tree, geo);
  const h1 = html.match(/<h1>[\s\S]*?<\/h1>/)[0];

  it('runs three steps that escalate rather than repeat', () => {
    // find (easy) -> see (look) -> make (act). Three of the same verb is
    // a formula; three of the same weight is a list.
    expect((h1.match(/<br \/>/g) ?? []).length).toBe(2);
    // "a", not "your": most readers arriving from the campaign have no
    // school of their own, and the ask is to audit schools in your area.
    // The key word on each line carries a highlight, so match around it.
    expect(h1).toMatch(/Find a <mark>school<\/mark>\./);
    expect(h1).toMatch(/See what’s <mark>missing<\/mark>\./);
    expect(h1).toMatch(/Make someone <mark>answer<\/mark>\./);
  });

  it('each step is something the site actually supports', () => {
    // Browse to a block, read the faults off each school's record, and
    // see the sitting member for the seat it sits in.
    expect(html).toContain('href="#data"');
    expect(html).toMatch(/Report what you find/);
  });

  it('stays about the school, not one fixture in it', () => {
    expect(h1.toLowerCase()).not.toContain('toilet');
  });

  it('asks the reader to do something in the line underneath', () => {
    const line = html.match(/<p class="standfirst">[\s\S]*?<\/p>/)[0];
    expect(line).toMatch(/send a photo/i);
    expect(line).toMatch(/anonymous/i);
    expect(line).not.toMatch(/government|record|UDISE/i);
    // And it does not simply repeat the headline's first line.
    expect(line).not.toMatch(/Find (a|your) school/i);
  });

  it('credits the campaign rather than claiming to be it', () => {
    const line = html.match(/<p class="standfirst">[\s\S]*?<\/p>/)[0];
    expect(line).toContain('#SchoolThikKaro');
    expect(line).not.toMatch(/\bour campaign\b|\bwe are\b|official/i);
  });
});

describe('the page keeps one width', () => {
  const css = readFileSync('public/browse.css', 'utf8');

  it('has no section that breaks out of the text column', () => {
    // The atlas used to sit at 1320px while everything else sat at 1060,
    // so no two left edges lined up and the rules were different lengths.
    expect(css).not.toContain('--atlas-w');
    expect(css.match(/\.atlas \{[^}]*\}/)[0]).not.toMatch(/width:|100vw/);
  });

  it('sends the reader straight to the picker, not the old map', () => {
    const html = renderIndexPage(tree, geo);
    const section = html.match(/<section class="findmine">[\s\S]*?<\/section>/)[0];
    expect(section).toContain('href="/app/#/add"');
    expect(section).not.toContain('href="/app/#/"');
  });

  it('makes one ask instead of two competing ones', () => {
    const html = renderIndexPage(tree, geo);
    const section = html.match(/<section class="findmine">[\s\S]*?<\/section>/)[0];
    expect((section.match(/class="btn/g) ?? []).length).toBe(1);
    // And it no longer explains the unlisted path in prose: the picker
    // handles that itself, so the reader never has to choose a route.
    expect(section).not.toMatch(/published separately|marked as reported by a citizen/);
  });
});

describe('the questions section', () => {
  const html = renderIndexPage(tree, geo);

  it('opens without JavaScript, because <details> does', () => {
    expect(html).toMatch(/<details class="faq-item">/);
    expect((html.match(/<summary>/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('answers the objection that actually stops people', () => {
    expect(html).toMatch(/never record who you are/i);
    expect(html).toMatch(/IP is hashed|hashed with a secret/i);
  });

  it('is straight about how little of India this site holds', () => {
    // Roughly one school in eighteen. A visitor whose school is missing
    // should learn why here rather than conclude the site is broken.
    expect(html).toMatch(/Most are not/);
    expect(html).toMatch(/never counted inside the official figures/i);
  });

  it('still credits the campaign without claiming to be it', () => {
    // The FAQ entry answering "Is this CJP's site?" was removed. The
    // standfirst is now the only place the campaign is named, so it is
    // the only thing keeping the site from reading as CJP's own.
    const line = html.match(/<p class="standfirst">[\s\S]*?<\/p>/)[0];
    expect(line).toContain('#SchoolThikKaro');
    expect(html).not.toMatch(/\bour campaign\b|an official|on behalf of CJP/i);
  });

  it('derives its figures rather than hardcoding them', () => {
    expect(html).toContain(tree.national.flagged.toLocaleString('en-IN'));
  });
});

describe('the closing band', () => {
  const html = renderIndexPage(tree, geo);

  it('ends the page on the ask, not on a footnote', () => {
    const closer = html.match(/<section class="closer">[\s\S]*?<\/section>/)[0];
    expect(closer).toContain('href="/app/#/add"');
  });

  it('claims a minute, not a promise about what happens next', () => {
    const closer = html.match(/<section class="closer">[\s\S]*?<\/section>/)[0];
    expect(closer).toMatch(/A minute on your phone/);
    expect(closer).toMatch(/once a moderator has checked it/);
    // Never "it will be fixed" — nothing on this site can promise that.
    expect(closer).not.toMatch(/will be fixed|guarantee/i);
  });
});

describe('the ledger panel', () => {
  const html = renderIndexPage(tree, geo);

  it('offers both readings of the data instead of picking one', () => {
    // Ranking by count is a population map; ranking by rate hides where
    // the largest numbers of children are. The reader can have either.
    expect(html).toContain('data-sort="rate"');
    expect(html).toContain('data-sort="count"');
  });

  it('defaults to the honest ranking', () => {
    expect(html).toMatch(/data-sort="rate" class="is-on"/);
  });

  it('carries the sort keys on every row', () => {
    expect(html).toMatch(/<tr data-name="[^"]*" data-key="[A-Z]+" data-rate="[\d.]+" data-count="\d+"/);
  });

  it('ships the sort control hidden, like every other enhancement here', () => {
    expect(html).toMatch(/<div class="sortby" id="sortby" hidden>/);
  });
});

describe('the live reports band', () => {
  const html = renderIndexPage(tree, geo);

  it('starts hidden and is revealed only when reports exist', () => {
    // An empty "no reports yet" panel on the front page advertises that
    // nobody has used this, which is worse than not mentioning it.
    expect(html).toMatch(/<section class="live" id="live" hidden>/);
    expect(html).toContain('if(!rows.length) return;');
    expect(html).toContain('sec.hidden=false;');
  });

  it('asks only for approved reports', () => {
    // Pending submissions are unreviewed claims; RLS refuses them anyway,
    // but the query should not be asking.
    expect(html).toContain('review_status=eq.approved');
  });

  it('never requests where the reporter was standing', () => {
    // lat/lng on a report is where the PHOTO was taken, which is where
    // the person was. Naming the risk beats whitelisting fields: a
    // whitelist blocks the next useful column and teaches nobody why.
    const q = html.match(/reports\?select=([^&']*)/)[1].split(',');
    for (const forbidden of ['lat', 'lng', 'gps_accuracy_m', 'ip_hash', 'distance_m']) {
      expect(q, `query asks for ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('asks only for what the three panels render', () => {
    const q = html.match(/reports\?select=([^&']*)/)[1].split(',').sort();
    // udise_code resolves the school's page; id fetches the photo.
    expect(q).toEqual(['category', 'created_at', 'finding', 'id', 'note',
      'school_name_snapshot', 'tier', 'udise_code']);
  });

  it('fails silently rather than breaking the page', () => {
    // The band is an extra. A dead network must not take the record with it.
    expect(html).toContain('.catch(function(){});');
  });
});

describe('the accountability panel reaches districts', () => {
  it('names members on a district page, not only a block', () => {
    // A block is often one seat; a district is the level at which a
    // reader recognises their own representative.
    const html = renderDistrictPage(state, district, 5.63,
      indexRepresentatives(JSON.parse(readFileSync('data/representatives.json', 'utf8'))));
    expect(html).toMatch(/class="accountable"/);
  });

  it('renders nothing where we hold no representatives', () => {
    // Silence must not read as "this district has no MLA".
    const html = renderDistrictPage(state, district, 5.63, null);
    expect(html).not.toMatch(/class="accountable"/);
  });
});

describe('buttons', () => {
  it('use small sentence-case type, not shouted mono', () => {
    // Uppercase mono with wide letterspacing made a two-word label
    // occupy the width of a sentence, so the button read as large and
    // the words inside it as shouted.
    const css = readFileSync('public/browse.css', 'utf8');
    const btn = css.match(/\.btn \{[^}]*\}/)[0];
    expect(btn).toMatch(/var\(--sans\)/);
    expect(btn).toMatch(/text-transform:none/);
    expect(btn).toMatch(/letter-spacing:0/);
  });

  it('sit in a box with room around the words', () => {
    const css = readFileSync('public/browse.css', 'utf8');
    const btn = css.match(/\.btn \{[^}]*\}/)[0];
    expect(btn).toMatch(/min-width:200px/);
    expect(btn).toMatch(/padding:18px 34px/);
  });
});

describe('the accent colour', () => {
  const css = readFileSync('public/browse.css', 'utf8');
  const lum = (h) => {
    const v = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const ratio = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it('is CJP’s orange, not a highlighter yellow', () => {
    expect(css).toMatch(/--accent:#e0651e/);
  });

  it('never carries white text, which fails on it', () => {
    // Ink on this orange is 5.4:1 and passes; white is 3.5:1 and does
    // not. Every solid use must set the dark ink explicitly.
    for (const rule of css.match(/[^{}]*\{[^}]*background:var\(--accent\)[^}]*\}/g) ?? []) {
      expect(rule, rule).not.toMatch(/color:\s*(#fff|#ffffff|var\(--bg\))/i);
    }
    expect(ratio('#111214', '#e0651e')).toBeGreaterThan(4.5);
  });

  it('hovers on the soft tint, so a hovered row stays readable', () => {
    // A full row of solid orange under dark text is legible but shouts;
    // the tint reads as a highlight rather than a block of colour.
    expect(css).toMatch(/tr:hover \{ background:var\(--accent-soft\)/);
    expect(ratio('#111214', '#fbe4d5')).toBeGreaterThan(7);
  });
});

describe('the masthead', () => {
  it('spans the window because body does, not by reaching out of a column', () => {
    // The first attempt gave the bar width:100vw and a negative margin
    // against a centred body. Moving the measure onto .page means the bar
    // is simply as wide as its parent, which cannot fight anything.
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css.match(/\.mast-bar \{[^}]*\}/)[0]).not.toMatch(/100vw|margin-left/);
    expect(css).toMatch(/\.mast-bar \.masthead \{[^}]*max-width:1200px/);
  });
});

describe('headline weight', () => {
  it('is not set in the heaviest cut available', () => {
    // Playfair at 900 across three lines that size read as shouting.
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css).toMatch(/\.hero h1 \{ margin:0; font:700 /);
  });
});

describe('the accent is defined once, consistently', () => {
  it('has no theme block still carrying the old yellow', () => {
    // The first edit changed the dark block and missed the light one,
    // which is the default — so the live site kept the yellow while the
    // tests passed on a value nobody saw.
    const css = readFileSync('public/browse.css', 'utf8');
    const accents = [...new Set(css.match(/--accent:#[0-9a-f]{6}/g) ?? [])];
    expect(accents).toEqual(['--accent:#e0651e']);
  });
});

describe('page structure closes what it opens', () => {
  // The full-width masthead shipped with its <div> never closed, because
  // the edit that should have added it matched nothing and failed
  // silently. The bar then wrapped the whole page, and since it carries
  // width:100vw with a negative margin, it dragged every section
  // full-bleed and left. Nothing else caught it.
  const pages = () => ({
    index: renderIndexPage(tree, geo),
    state: renderStatePage(state, 5.63),
    district: renderDistrictPage(state, district, 5.63),
    block: renderBlockPage(state, district, block, 5.63),
  });

  it('balances every div on every page type', () => {
    for (const [name, html] of Object.entries(pages())) {
      const open = (html.match(/<div[\s>]/g) ?? []).length;
      const close = (html.match(/<\/div>/g) ?? []).length;
      expect(close, `${name}: ${open} open, ${close} close`).toBe(open);
    }
  });

  it('closes the masthead bar before the page content begins', () => {
    for (const [name, html] of Object.entries(pages())) {
      expect(html, name).toMatch(/<\/header><\/div>\s*<script/);
      expect(html, name).toContain('<div class="page">');
    }
  });

  it('keeps the page measure off body, so a full-width bar needs no trick', () => {
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css).toMatch(/\.page \{ max-width:1200px/);
    expect(css.match(/body\.browse \{[^}]*\}/)[0]).not.toMatch(/max-width/);
    // And the bar itself no longer reaches out with a negative margin.
    expect(css.match(/\.mast-bar \{[^}]*\}/)[0]).not.toMatch(/100vw|margin-left/);
  });
});

describe('the headline highlight', () => {
  it('marks one word on each of the three lines', () => {
    const h1 = renderIndexPage(tree, geo).match(/<h1>[\s\S]*?<\/h1>/)[0];
    expect((h1.match(/<mark>/g) ?? []).length).toBe(3);
    expect(h1).toContain('<mark>school</mark>');
    expect(h1).toContain('<mark>missing</mark>');
    expect(h1).toContain('<mark>answer</mark>');
  });
});

describe('the live band goes somewhere', () => {
  const html = renderIndexPage(tree, geo);

  it('resolves each report to its school’s page', () => {
    // The row named the school and could not be clicked, so a reader
    // learned a report existed and could not reach the school.
    // Keyed on the code, not the name: a stored name is a snapshot and
    // can drift from the index.
    expect(html).toContain("'/state/'+hit[1]");
    expect(html).toMatch(/'\/data\/su\/'\+String\(r\.udise_code\)/);
  });

  it('renders unlinked first and upgrades once the school resolves', () => {
    // A row that becomes a link under the finger is worse than one that
    // was never clickable.
    expect(html).toMatch(/card\(r,null\)/);
  });

  it('shows the photo through the approval-checking endpoint', () => {
    // Never a storage URL: the bucket is private, and approval is checked
    // on every request so a report taken down disappears at once.
    expect(html).toContain('/functions/v1/report-photo?id=');
    expect(html).not.toMatch(/storage\/v1\/object\/public/);
  });

  it('says the photos are moderated and not our finding', () => {
    expect(html).toMatch(/only after a moderator has\s+approved/);
    expect(html).toMatch(/Nothing here is our finding/);
  });

  it('drops the state names from the map', () => {
    // The worst states are the small north-eastern ones; their names sat
    // in a knot over the busiest corner. The ledger names them in order.
    expect(html).not.toMatch(/class="india-label"/);
  });
});

describe('inline scripts are valid JavaScript', () => {
  // Every enhancement on these pages — filter, pager, sort, theme, the
  // live band, the school search — is an inline script inside a template
  // literal. A stray escape kills the whole script silently: the page
  // still renders, the figures just sit at their placeholders forever.
  // That is exactly how "Reports filed: 0" survived ten approved reports.
  const parse = (html, label) => {
    for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      expect(() => new Function(code), `${label}: ${code.slice(0, 80)}`).not.toThrow();
    }
  };

  it('parses on the homepage, which carries the most of them', () => {
    parse(renderIndexPage(tree, geo), 'index');
  });

  it('parses on every region page', () => {
    parse(renderStatePage(state, 5.63), 'state');
    parse(renderDistrictPage(state, district, 5.63), 'district');
    parse(renderBlockPage(state, district, block, 5.63), 'block');
  });

  it('has no regex literal carrying an unescaped closing tag', () => {
    // `<\/li>` inside a template literal collapses to `</li>`, which ends
    // the regex early. Building the markup directly avoids the trap.
    expect(renderIndexPage(tree, geo)).not.toMatch(/\/\^?<li>\|<\/li>/);
  });
});

describe('reports render as cards', () => {
  const html = renderIndexPage(tree, geo);

  it('lays them out two up rather than as a list of one-liners', () => {
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css).toMatch(/\.live-list \{[^}]*repeat\(2, minmax\(0,1fr\)\)/);
  });

  it('leads each card with what and where, and marks the finding', () => {
    expect(html).toContain('class="r-head"');
    expect(html).toContain('class="r-finding"');
    expect(html).toContain('r.school_name_snapshot');
  });

  it('shows the photo through the approval-checking endpoint, never storage', () => {
    expect(html).toContain('/functions/v1/report-photo?id=');
    expect(html).not.toMatch(/storage\/v1\/object\/public/);
  });

  it('quotes the reporter’s own words', () => {
    expect(html).toContain('class="r-note"');
  });

  it('says whether it was verified on-site, without claiming it is proven', () => {
    // "Verified" here means the submission passed our GPS and blur checks,
    // never that the finding is true.
    expect(html).toMatch(/Verified on-site/);
    expect(html).toMatch(/Unverified/);
  });
});
