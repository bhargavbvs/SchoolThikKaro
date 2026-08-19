// Import rather than re-declare: the spec requires the source year to be
// structurally impossible to omit or drift. src/config.js imports cleanly
// under plain Node (its import.meta.env access is optional-chained).
import { SOURCE_YEAR } from '../../src/config.js';
import { titleCase, compareToBaseline, barWidth, severityOf, officialClaimRate } from './format.mjs';

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
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&display=swap" />
<link rel="stylesheet" href="/browse.css" />${extraStyle ? `
<link rel="stylesheet" href="${extraStyle}" />` : ''}
</head>
<body class="${esc(bodyClass)}">
<header class="masthead">
  <a class="wordmark" href="/">shaala<span>.in</span></a>
  <span class="tag">${esc(SOURCE_YEAR)} · Government’s own record</span>
</header>
${breadcrumb ? `<nav class="crumb">${breadcrumb}</nav>` : ''}
<header class="head">${headline}</header>
${table}
${extra}
<footer class="foot">
  <p>Figures as reported by each school to ${esc(SOURCE_YEAR)}. We publish them as
     the school’s own record, not as our finding.</p>
  <p><a href="/#/methodology">How this works</a></p>
</footer>
${spa ? scriptTag : ''}
</body>
</html>`;
}

const crumb = (parts) =>
  parts.map((p, i) => (p.href && i < parts.length - 1
    ? `<a href="${esc(p.href)}">${esc(titleCase(p.label))}</a>`
    : `<span>${esc(titleCase(p.label))}</span>`)).join(' › ');

/** The number the page is actually about, given room to be read, with the
 *  counts behind it and one honest sentence of comparison. */
const hero = (name, { flagged, total, rate }, comparison, baseline) => {
  // The headline figure carries the same severity colour as its comparison
  // pill and its table bars. Without this, Kerala renders an alarming red
  // "0.4%" directly above a green "below the national average" — the page
  // contradicting itself. Pages with no baseline to judge against (the
  // national index) keep the default emphasis colour.
  const sev = baseline === undefined ? '' : severityOf(rate, baseline);
  return `
  <h1>${esc(titleCase(name))}</h1>
  <p class="hero-rate"><strong class="${sev}">${fmtRate(rate)}</strong> <span>of schools flagged</span></p>
  <p class="sub">${fmtNum(flagged)} of ${fmtNum(total)} girls’ and co-ed schools</p>
  ${comparison ? `<p class="cmp ${comparison.startsWith('below') ? 'is-low' : ''}">${esc(comparison)}</p>` : ''}`;
};

const statRow = (label, href, flagged, total, rate, maxRate, nationalRate) => `
  <tr data-name="${esc(titleCase(label).toLowerCase())}">
    <td class="name"><a href="${esc(href)}">${esc(titleCase(label))}</a></td>
    <td class="num">${fmtNum(flagged)}</td>
    <td class="num">${fmtNum(total)}</td>
    <td class="num rate"><span class="rate-wrap"><span class="bar ${severityOf(rate, nationalRate)}" style="--w:${barWidth(rate, maxRate)}%" aria-hidden="true"></span><span class="rate-val ${severityOf(rate, nationalRate)}">${fmtRate(rate)}</span></span></td>
  </tr>`;

/** Rows are pre-rendered and visible with JavaScript off; this only hides
 *  non-matching ones. Kept inline and tiny so browse pages stay free of any
 *  bundle — the whole point of them being static. */
const FILTER_SCRIPT = `<script>
(function(){var i=document.getElementById('filter');if(!i)return;var r=document.querySelectorAll('tbody tr[data-name]');
i.hidden=false;i.addEventListener('input',function(){var q=i.value.trim().toLowerCase();
for(var n=0;n<r.length;n++){r[n].style.display=!q||r[n].dataset.name.indexOf(q)>-1?'':'none';}});})();
</script>`;

const statTable = (rows, filterLabel) => `
${filterLabel ? `<input id="filter" type="search" hidden placeholder="${esc(filterLabel)}" aria-label="${esc(filterLabel)}" />` : ''}
<table class="stats" id="data">
  <thead><tr><th>Name</th><th class="num">Flagged</th><th class="num">Schools</th><th class="num">Rate</th></tr></thead>
  <tbody>${rows}</tbody>
</table>${filterLabel ? FILTER_SCRIPT : ''}`;

const maxRateOf = (nodes) => Math.max(0, ...nodes.map((n) => n.rate ?? 0));

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
    breadcrumb: '',
    // The official headline figure counts a toilet that does not work as a
    // toilet. That single sentence is the whole argument, so it is the page.
    headline: `<div class="hero">
      <p class="kicker"><span class="dot"></span><span class="label">Live · ${fmtNum(tree.national.flagged)} schools across India</span></p>
      <h1>A toilet that<br /><mark>doesn’t work</mark><br />is still counted.</h1>
      <p class="standfirst"><strong>${fmtNum(tree.national.nonFunctional)}</strong> government schools have a
        girls’ toilet that does not function. The official
        ${fmtRate(officialClaimRate(tree.national))} “has a girls’ toilet” figure counts every
        one of them as compliant.</p>
      <div class="actions">
        <a class="btn btn-primary" href="#data">Browse the record →</a>
        <a class="btn btn-ghost" href="/#/methodology">How this works</a>
      </div>
    </div>

    <div class="stat-grid">
      <div>
        <span class="label">Counted honestly</span>
        <div class="figure"><mark>${fmtNum(tree.national.flagged)}</mark></div>
        <p class="note">schools with no girls’ toilet <b>or</b> one that does not
          function — <b>${fmtRate(tree.national.rate)}</b> of all girls’ and co-ed schools.</p>
      </div>
      <div>
        <span class="label">Hidden by the official figure</span>
        <div class="figure">${fmtNum(tree.national.nonFunctional)}</div>
        <p class="note">have a toilet that exists but does not work. Every one is
          counted as <b>compliant</b>.</p>
      </div>
      <div>
        <span class="label">Worst affected state</span>
        <div class="figure">${fmtRate(tree.states[0]?.rate)}</div>
        <p class="note"><b>${esc(titleCase(tree.states[0]?.name ?? ''))}</b> —
          ${fmtNum(tree.states[0]?.flagged)} of ${fmtNum(tree.states[0]?.total)} schools.</p>
      </div>
    </div>`,
    table: statTable(
      (() => { const m = maxRateOf(tree.states); const nat = tree.national.rate;
        return tree.states.map((s) =>
          statRow(s.name, `/state/${s.slug}`, s.flagged, s.total, s.rate, m, nat)).join(''); })(),
      'Filter states…'),
    // #topbar is emitted BEFORE #map and un-fixed by browse.css: the SPA
    // styles it position:fixed for the full-screen map app, where it is the
    // whole chrome. On this page it would float over the masthead as a
    // second, differently-styled wordmark. It belongs with the map.
    extra: `<section class="map-section"><h2>Where reports are</h2>
      <header id="topbar"></header><div id="map"></div>
      <aside id="sheet" hidden></aside>
      <div id="submit-root" hidden></div><div id="admin-root" hidden></div>
      <div id="toast" hidden></div></section>`,
  });
}

export function renderStatePage(state, nationalRate) {
  const m = maxRateOf(state.districts);
  return renderPage({
    title: `${titleCase(state.name)} — ${fmtNum(state.flagged)} schools flagged for girls’ toilets`,
    description: `${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools in ${titleCase(state.name)} (${fmtRate(state.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' }, { label: state.name }]),
    headline: hero(state.name, state, compareToBaseline(state.rate, nationalRate, 'national average'), nationalRate),
    table: statTable(state.districts.map((d) =>
      statRow(d.name, `/state/${state.slug}/${d.slug}`, d.flagged, d.total, d.rate, m, nationalRate)).join(''),
      'Filter districts…'),
  });
}

export function renderDistrictPage(state, district, nationalRate) {
  const m = maxRateOf(district.blocks);
  return renderPage({
    title: `${titleCase(district.name)}, ${titleCase(state.name)} — ${fmtNum(district.flagged)} schools flagged`,
    description: `${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools in ${titleCase(district.name)} district (${fmtRate(district.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` }, { label: district.name }]),
    headline: hero(district.name, district,
      compareToBaseline(district.rate, state.rate, `${titleCase(state.name)} average`), nationalRate),
    table: statTable(district.blocks.map((b) =>
      statRow(b.name, `/state/${state.slug}/${district.slug}/${b.slug}`, b.flagged, b.total, b.rate, m, nationalRate)).join(''),
      'Filter blocks…'),
  });
}

export function renderBlockPage(state, district, block, nationalRate) {
  // No per-school route exists yet (#/school/<udise> is real future work,
  // not built here — see "Deferred, explicitly" in the design spec), so
  // each school row links to the one already-working place a citizen can
  // see it on the map: the interactive map for its state. A real
  // improvement over a dead end without inventing new SPA routing.
  const stateHref = `/#/state/${esc(state.slug)}`;
  // School names render verbatim, NOT title-cased: ~30% carry abbreviations
  // (LPS, UPS, SSA, GOVT.) that title-casing corrupts — "AGGONGITIM LPS"
  // would become "Aggongitim Lps", and LPS means Lower Primary School.
  const rows = block.schools.map((s) => `
    <tr data-name="${esc(s.name.toLowerCase())}">
      <td class="name"><a href="${stateHref}">${esc(s.name)}</a></td>
      <td class="udise">${esc(s.udise)}</td>
      <td><span class="tag ${s.indicator === 'no_girls_toilet' ? 'tag-none' : 'tag-broken'}">${esc(INDICATOR_TEXT[s.indicator] ?? 'Unknown')}</span></td>
    </tr>`).join('');

  return renderPage({
    title: `${titleCase(block.name)}, ${titleCase(district.name)} — ${fmtNum(block.flagged)} schools flagged`,
    description: `${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools in ${titleCase(block.name)}, ${titleCase(district.name)} (${fmtRate(block.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}/${block.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` },
      { label: district.name, href: `/state/${state.slug}/${district.slug}` },
      { label: block.name }]),
    headline: hero(block.name, block,
      compareToBaseline(block.rate, district.rate, `${titleCase(district.name)} average`), nationalRate),
    table: `
<input id="filter" type="search" hidden placeholder="Filter schools…" aria-label="Filter schools…" />
<table class="stats schools">
      <thead><tr><th>School</th><th>UDISE</th><th>Reported issue</th></tr></thead>
      <tbody>${rows}</tbody></table>${FILTER_SCRIPT}`,
  });
}
