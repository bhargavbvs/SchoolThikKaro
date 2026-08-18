/** Every URL the prerenderer will write, in stable order. Derived from the
 *  same tree prerender walks, so the sitemap cannot drift from the pages. */
export function collectUrls(tree) {
  const urls = ['/'];
  for (const s of tree.states) {
    urls.push(`/state/${s.slug}`);
    for (const d of s.districts) {
      urls.push(`/state/${s.slug}/${d.slug}`);
      for (const b of d.blocks) urls.push(`/state/${s.slug}/${d.slug}/${b.slug}`);
    }
  }
  return urls;
}

const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderSitemap(urls, site) {
  const body = urls.map((u) => `  <url><loc>${xmlEsc(site + u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;
}
