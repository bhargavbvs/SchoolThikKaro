// Import rather than re-declare: the spec requires the source year to be
// structurally impossible to omit or drift. src/config.js imports cleanly
// under plain Node (its import.meta.env access is optional-chained).
import { SOURCE_YEAR } from '../../src/config.js';

export const SITE = 'https://shaala-flax.vercel.app';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const fmtRate = (r) => (r === null || r === undefined ? '—' : `${r.toFixed(1)}%`);
const fmtNum = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'));

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

export function renderPage({ title, description, canonical, breadcrumb, headline, table, extra = '', spa = false, scriptTag = '', extraStyle = '', bodyClass = 'browse' }) {
  // scriptTag and extraStyle are pre-built HTML tag markup (sourced by
  // prerender.mjs from Vite's own build output), not text content — unlike
  // every other interpolated value below, they are deliberately NOT esc()'d.
  // Escaping them would turn real <script>/<link> tags into inert text.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<script>(function(){var t=localStorage.getItem('shaala.theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;})();</script>
<link rel="stylesheet" href="/browse.css" />${extraStyle ? `
<link rel="stylesheet" href="${extraStyle}" />` : ''}
</head>
<body class="${esc(bodyClass)}">
<nav class="crumb">${breadcrumb}</nav>
<header class="head">${headline}</header>
${table}
${extra}
<footer class="foot">
  <p>Figures as reported by schools to ${esc(SOURCE_YEAR)}. We publish them as
     the school’s own record, not as our finding.</p>
  <p><a href="/#/methodology">How this works</a></p>
</footer>
${spa ? scriptTag : ''}
</body>
</html>`;
}

const crumb = (parts) =>
  parts.map((p, i) => (p.href && i < parts.length - 1
    ? `<a href="${esc(p.href)}">${esc(p.label)}</a>`
    : `<span>${esc(p.label)}</span>`)).join(' › ');

const statRow = (label, href, flagged, total, rate) => `
  <tr>
    <td><a href="${esc(href)}">${esc(label)}</a></td>
    <td class="num">${fmtNum(flagged)}</td>
    <td class="num">${fmtNum(total)}</td>
    <td class="num rate">${fmtRate(rate)}</td>
  </tr>`;

const statTable = (rows) => `
<table class="stats">
  <thead><tr><th>Name</th><th class="num">Flagged</th><th class="num">Schools</th><th class="num">Rate</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;

// assetTags is deliberately required, with no default: a default here once
// meant "dev-time /src/main.js path", which is a dead 404 in a prerendered
// production page — a real regression that shipped once already. Callers
// (prerender.mjs) must pass the real hashed tags Vite's own build produced;
// see scripts/lib/assets.mjs's extractAssetTags.
export function renderIndexPage(tree, assetTags) {
  if (!assetTags?.script) {
    throw new Error(
      'renderIndexPage: assetTags.script is required — pass the real built <script> tag ' +
        '(see extractAssetTags in scripts/lib/assets.mjs); there is no dev-time fallback',
    );
  }
  return renderPage({
    spa: true,
    // The generated homepage embeds the SPA's own mount points below the
    // fold (#map, #topbar, etc. — see `extra` below) so a real browser
    // visiting `/` boots the fixed, position:fixed topbar from
    // src/map/style-map.css over the top of this content. `has-spa` gives
    // browse.css a hook to push the breadcrumb/h1 down below that fixed
    // band — every other generated page never loads the SPA and doesn't
    // need it.
    bodyClass: 'browse has-spa',
    scriptTag: assetTags.script,
    extraStyle: assetTags.style,
    title: `${fmtNum(tree.national.flagged)} Indian government schools flagged for girls’ toilets`,
    description: `${fmtNum(tree.national.flagged)} schools are recorded in ${SOURCE_YEAR} as having no girls’ toilet or one that does not function. Browse by state and district.`,
    canonical: `${SITE}/`,
    breadcrumb: crumb([{ label: 'India' }]),
    headline: `<h1>${fmtNum(tree.national.flagged)} schools flagged</h1>
      <p class="sub">${fmtNum(tree.national.noToilet)} have no girls’ toilet ·
        ${fmtNum(tree.national.nonFunctional)} have one that does not function</p>`,
    table: statTable(tree.states.map((s) =>
      statRow(s.name, `/state/${s.slug}`, s.flagged, s.total, s.rate)).join('')),
    extra: `<section class="map-section"><h2>Where reports are</h2><div id="map"></div>
      <header id="topbar"></header><aside id="sheet" hidden></aside>
      <div id="submit-root" hidden></div><div id="admin-root" hidden></div>
      <div id="toast" hidden></div></section>`,
  });
}

export function renderStatePage(state) {
  return renderPage({
    title: `${state.name} — ${fmtNum(state.flagged)} schools flagged for girls’ toilets`,
    description: `${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools in ${state.name} (${fmtRate(state.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' }, { label: state.name }]),
    headline: `<h1>${esc(state.name)}</h1>
      <p class="sub">${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools flagged
        (<strong>${fmtRate(state.rate)}</strong>)</p>`,
    table: statTable(state.districts.map((d) =>
      statRow(d.name, `/state/${state.slug}/${d.slug}`, d.flagged, d.total, d.rate)).join('')),
  });
}

export function renderDistrictPage(state, district) {
  return renderPage({
    title: `${district.name}, ${state.name} — ${fmtNum(district.flagged)} schools flagged`,
    description: `${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools in ${district.name} district (${fmtRate(district.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` }, { label: district.name }]),
    headline: `<h1>${esc(district.name)}</h1>
      <p class="sub">${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools flagged
        (<strong>${fmtRate(district.rate)}</strong>) · ${esc(state.name)} average ${fmtRate(state.rate)}</p>`,
    table: statTable(district.blocks.map((b) =>
      statRow(b.name, `/state/${state.slug}/${district.slug}/${b.slug}`, b.flagged, b.total, b.rate)).join('')),
  });
}

export function renderBlockPage(state, district, block) {
  const cmp = block.rate === null || district.rate === null ? ''
    : ` — ${block.rate > district.rate ? 'above' : 'below'} the ${esc(district.name)}
        average of ${fmtRate(district.rate)}, and the ${esc(state.name)} average of ${fmtRate(state.rate)}`;

  // No per-school route exists yet (#/school/<udise> is real future work,
  // not built here — see "Deferred, explicitly" in the design spec), so
  // each school row links to the one already-working place a citizen can
  // see it on the map: the interactive map for its state. A real
  // improvement over a dead end without inventing new SPA routing.
  const stateHref = `/#/state/${esc(state.slug)}`;
  const rows = block.schools.map((s) => `
    <tr>
      <td><a href="${stateHref}">${esc(s.name)}</a></td>
      <td class="udise">${esc(s.udise)}</td>
      <td>${esc(INDICATOR_TEXT[s.indicator] ?? 'Unknown')}</td>
    </tr>`).join('');

  return renderPage({
    title: `${block.name}, ${district.name} — ${fmtNum(block.flagged)} schools flagged`,
    description: `${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools in ${block.name}, ${district.name} (${fmtRate(block.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}/${block.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` },
      { label: district.name, href: `/state/${state.slug}/${district.slug}` },
      { label: block.name }]),
    headline: `<h1>${esc(block.name)}</h1>
      <p class="sub">${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools flagged
        (<strong>${fmtRate(block.rate)}</strong>)${cmp}</p>`,
    table: `<table class="stats schools">
      <thead><tr><th>School</th><th>UDISE</th><th>Reported issue</th></tr></thead>
      <tbody>${rows}</tbody></table>`,
  });
}
