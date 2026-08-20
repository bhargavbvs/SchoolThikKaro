import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderIndexPage, renderStatePage, renderDistrictPage, renderBlockPage, SITE } from './lib/render.mjs';
import { collectUrls, renderSitemap } from './lib/sitemap.mjs';
import { indexRepresentatives } from './lib/accountable.mjs';

const tree = JSON.parse(readFileSync('data/aggregates.json', 'utf8'));
// State outlines for the homepage map, built once by
// scripts/build-india-svg.mjs and committed. Not derived at build time: its
// input is a ~74MB boundary file that is deliberately not in this repo.
const geo = JSON.parse(readFileSync('data/india-states.json', 'utf8'));
// Sitting members, for the "who answers for these schools" panel. Only the
// states we have collected appear; a block elsewhere simply renders no
// panel, which says nothing either way about its representatives.
const repIndex = indexRepresentatives(
  JSON.parse(readFileSync('data/representatives.json', 'utf8')));

// This script runs AFTER `vite build` (see the package.json change below),
// writing directly into dist/ — never into public/. See the "Why dist/, not
// public/" note above the Interfaces block for the collision this avoids.
//
// vite build empties dist/ by default, so this rmSync is only load-bearing
// when re-running `npm run data:pages` alone (iterating on this script
// without a full rebuild) — kept as a defensive guard either way, so a
// region removed from the aggregate tree cannot linger as a stale page the
// sitemap no longer lists.
rmSync('dist/state', { recursive: true, force: true });

const write = (urlPath, html) => {
  const file = urlPath === '/' ? 'dist/index.html' : `dist${urlPath}/index.html`;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
};

// The SPA moves to /app/. Vite built it at dist/index.html, but the root
// now belongs to the static homepage: the router matches an empty hash, so
// merely serving the bundle at `/` booted MapLibre — ~960KB of JavaScript —
// for every visitor who only wanted to read a table.
//
// Vite emits absolute /assets/… URLs, so the page works unchanged from a
// subdirectory. Legacy /#/… links (including QR codes already printed on
// school walls) are forwarded by a redirect in the homepage's <head>; see
// headExtra in renderIndexPage.
const viteIndex = readFileSync('dist/index.html', 'utf8');
if (!/<script[^>]+src="\/assets\//.test(viteIndex)) {
  throw new Error(
    'dist/index.html has no hashed /assets/ script tag — did `vite build` run before this script? ' +
      'Moving it to /app/ would publish a dead SPA.',
  );
}
mkdirSync('dist/app', { recursive: true });
writeFileSync('dist/app/index.html', viteIndex);

write('/', renderIndexPage(tree, geo));
let n = 1;
for (const s of tree.states) {
  write(`/state/${s.slug}`, renderStatePage(s, tree.national.rate)); n++;
  for (const d of s.districts) {
    write(`/state/${s.slug}/${d.slug}`, renderDistrictPage(s, d, tree.national.rate)); n++;
    for (const b of d.blocks) {
      write(`/state/${s.slug}/${d.slug}/${b.slug}`, renderBlockPage(s, d, b, tree.national.rate, repIndex)); n++;
    }
  }
}

const urls = collectUrls(tree);
if (urls.length !== n) throw new Error(`sitemap/page mismatch: ${urls.length} urls vs ${n} pages`);

writeFileSync('dist/sitemap.xml', renderSitemap(urls, SITE));
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`wrote ${n.toLocaleString()} pages + sitemap.xml`);
