import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { renderIndexPage, renderStatePage, renderDistrictPage, renderBlockPage, SITE } from './lib/render.mjs';
import { collectUrls, renderSitemap } from './lib/sitemap.mjs';

const tree = JSON.parse(readFileSync('.data-src/aggregates.json', 'utf8'));

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

write('/', renderIndexPage(tree));
let n = 1;
for (const s of tree.states) {
  write(`/state/${s.slug}`, renderStatePage(s)); n++;
  for (const d of s.districts) {
    write(`/state/${s.slug}/${d.slug}`, renderDistrictPage(s, d)); n++;
    for (const b of d.blocks) {
      write(`/state/${s.slug}/${d.slug}/${b.slug}`, renderBlockPage(s, d, b)); n++;
    }
  }
}

const urls = collectUrls(tree);
if (urls.length !== n) throw new Error(`sitemap/page mismatch: ${urls.length} urls vs ${n} pages`);

writeFileSync('dist/sitemap.xml', renderSitemap(urls, SITE));
writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
console.log(`wrote ${n.toLocaleString()} pages + sitemap.xml`);
