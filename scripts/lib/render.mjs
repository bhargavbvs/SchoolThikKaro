// Import rather than re-declare: the spec requires the source year to be
// structurally impossible to omit or drift. src/config.js imports cleanly
// under plain Node (its import.meta.env access is optional-chained).
import { SOURCE_YEAR } from '../../src/config.js';
import { titleCase, compareToBaseline, barWidth, severityOf, officialClaimRate, oneInN } from './format.mjs';
import { esc } from './render-escape.mjs';
import { renderChoropleth, renderLegend, stateKey } from './choropleth.mjs';

export const SITE = 'https://shaala-flax.vercel.app';

export { esc } from './render-escape.mjs';

export const fmtRate = (r) => (r === null || r === undefined ? '—' : `${r.toFixed(1)}%`);
const fmtNum = (n) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'));

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

export function renderPage({ title, description, canonical, breadcrumb, headline, table, extra = '', spa = false, scriptTag = '', extraStyle = '', bodyClass = 'browse', headExtra = '' }) {
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700;1,900&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600&display=swap" />
<link rel="stylesheet" href="/browse.css" />${headExtra}${extraStyle ? `
<link rel="stylesheet" href="${extraStyle}" />` : ''}
</head>
<body class="${esc(bodyClass)}">
<header class="masthead">
  <a class="wordmark" href="/">SchoolThikKaro</a>
  <span class="tag">${esc(SOURCE_YEAR)} · Government’s own record</span>
</header>
${breadcrumb ? `<nav class="crumb">${breadcrumb}</nav>` : ''}
<header class="head">${headline}</header>
${table}
${extra}
<footer class="foot">
  <p>Figures as reported by each school to ${esc(SOURCE_YEAR)}. We publish them as
     the school’s own record, not as our finding.</p>
  <p><a href="/app/#/methodology">How this works</a></p>
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
  <p class="hero-rate"><strong class="${sev}">${fmtRate(rate)}</strong> <span>of schools have no working girls’ toilet</span></p>
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

const statTable = (rows, filterLabel, nameLabel = 'Name') => `
${filterLabel ? `<input id="filter" type="search" hidden placeholder="${esc(filterLabel)}" aria-label="${esc(filterLabel)}" />` : ''}
<table class="stats" id="data">
  <thead><tr><th>${esc(nameLabel)}</th><th class="num">No working toilet</th><th class="num">All schools</th><th class="num">Share</th></tr></thead>
  <tbody>${rows}</tbody>
</table>${filterLabel ? FILTER_SCRIPT : ''}`;

const maxRateOf = (nodes) => Math.max(0, ...nodes.map((n) => n.rate ?? 0));

// `geo` is the state outline data built once by scripts/build-india-svg.mjs
// and committed as data/india-states.json. Required, with no default: a
// homepage that silently renders without its map would look like a styling
// bug rather than a missing build input, and the map is the first thing on
// the page.
export function renderIndexPage(tree, geo) {
  if (!geo?.shapes?.length) {
    throw new Error(
      'renderIndexPage: geo.shapes is required — pass the parsed data/india-states.json ' +
        '(built by scripts/build-india-svg.mjs)',
    );
  }
  // Join the figures onto the outlines through stateKey, because the two
  // sources spell states differently; anything unmatched renders as
  // no-data rather than as a state with nothing wrong.
  const byKey = new Map(tree.states.map((s) => [stateKey(s.name), {
    slug: s.slug,
    rate: s.rate,
    label: `${titleCase(s.name)} — ${fmtRate(s.rate)} of schools have no working girls’ toilet`,
  }]));
  const map = `<figure class="atlas-map">
      ${renderChoropleth({
        shapes: geo.shapes, viewBox: geo.viewBox, byKey, nationalRate: tree.national.rate,
        title: 'Share of government schools with no working girls\u2019 toilet, by state',
      })}
      ${renderLegend()}
      <figcaption>Shading is the share of a state\u2019s girls\u2019 and co-ed government
        schools with no working girls\u2019 toilet, cut at multiples of the national
        rate (${fmtRate(tree.national.rate)}). Unshaded states are not in this release.
        Figures are in the table beside it.</figcaption>
    </figure>`;
  return renderPage({
    bodyClass: 'browse',
    // Forwards a legacy SPA link — including QR codes already printed and
    // stuck on school walls, which encode /#/report/<udise> (src/submit/qr.js)
    // — to the same route under /app/. Runs before paint so the redirect is
    // never visible. Without it, moving the SPA silently breaks every code
    // already in the field.
    headExtra: `
<script>(function(){var h=location.hash;if(h.slice(0,2)==='#/')location.replace('/app/'+h);})();</script>`,
    title: `SchoolThikKaro — ${fmtNum(tree.national.flagged)} Indian government schools with no working girls’ toilet`,
    description: `${fmtNum(tree.national.flagged)} schools are recorded in ${SOURCE_YEAR} as having no girls’ toilet or one that does not function. Browse by state and district.`,
    canonical: `${SITE}/`,
    breadcrumb: '',
    // The official headline figure counts a toilet that does not work as a
    // toilet. That single sentence is the whole argument, so it is the page.
    headline: `<div class="hero">
      <p class="kicker"><span class="dot"></span><span class="label">School Thik Karo · the government’s own record, block by block</span></p>
      <h1>The record says<br />the school is <mark>fine</mark>.<br />Go and look.</h1>
      <p class="standfirst">The official ${fmtRate(officialClaimRate(tree.national))}
        “has a girls’ toilet” figure counts every one of the
        <strong>${fmtNum(tree.national.nonFunctional)}</strong> schools whose toilet does not
        work. That is one thing, in one year’s data. Find your block below — then go and
        tell us what you actually see: the toilet, the water, the wiring, the classroom.</p>
      <div class="actions">
        <a class="btn btn-primary" href="#data">Find your school →</a>
        <a class="btn btn-ghost" href="/app/#/">Report what you find</a>
      </div>
    </div>

    <div class="stat-grid">
      <div>
        <h2 class="stat-head">Schools with no working toilet for girls</h2>
        <div class="figure"><mark>${fmtNum(tree.national.flagged)}</mark></div>
        <p class="note">That is <b>1 in ${oneInN(tree.national.rate)}</b> of every government
          school girls attend.</p>
      </div>
      <div>
        <h2 class="stat-head">Of those, counted as if they were fine</h2>
        <div class="figure">${fmtNum(tree.national.nonFunctional)}</div>
        <p class="note">The toilet is there. It does not work. The official figure
          counts it anyway.</p>
      </div>
      <div>
        <h2 class="stat-head">Worst state: ${esc(titleCase(tree.states[0]?.name ?? ''))}</h2>
        <div class="figure">${fmtRate(tree.states[0]?.rate)}</div>
        <p class="note">of its schools — ${fmtNum(tree.states[0]?.flagged)} out of
          ${fmtNum(tree.states[0]?.total)}.</p>
      </div>
    </div>`,
    // Map and table are one unit: the map answers "where", the table
    // answers "how many", and neither is trustworthy without the other in
    // view. The map carries no figures precisely because the table is
    // right beside it.
    table: `<section class="atlas">${map}<div class="atlas-table">
      <input id="showall" type="checkbox" hidden />${statTable(
      (() => { const m = maxRateOf(tree.states); const nat = tree.national.rate;
        return tree.states.map((s) =>
          statRow(s.name, `/state/${s.slug}`, s.flagged, s.total, s.rate, m, nat)).join(''); })(),
      'Filter states…', 'State')}<label class="showall" for="showall">Show all ${tree.states.length} states</label></div></section>`,
    extra: `<section class="findmine">
      <h2>Whatever is broken, report it</h2>
      <p>The figures above are girls’ toilets, because that is what this release
         measures. What you can report is wider: the toilet, the drinking water,
         the electricity, the classroom, the boundary wall, the ramp — or something
         we have not thought of. Send a photo from the spot; we need your location
         to confirm you are there.</p>
      <p>If the school you are at is <b>not</b> in the government’s record, you can
         still report it. Those are published separately, marked as reported by a
         citizen, and never counted inside the official figures.</p>
      <p class="actions">
        <a class="btn btn-primary" href="/app/#/">Open the reporting map \u2192</a>
        <a class="btn btn-ghost" href="/app/#/add">Report an unlisted school</a>
      </p>
    </section>`,
  });
}

export function renderStatePage(state, nationalRate) {
  const m = maxRateOf(state.districts);
  return renderPage({
    title: `${titleCase(state.name)} — ${fmtNum(state.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
    description: `${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools in ${titleCase(state.name)} (${fmtRate(state.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' }, { label: state.name }]),
    headline: hero(state.name, state, compareToBaseline(state.rate, nationalRate, 'national average'), nationalRate),
    table: statTable(state.districts.map((d) =>
      statRow(d.name, `/state/${state.slug}/${d.slug}`, d.flagged, d.total, d.rate, m, nationalRate)).join(''),
      'Filter districts…', 'District'),
  });
}

export function renderDistrictPage(state, district, nationalRate) {
  const m = maxRateOf(district.blocks);
  return renderPage({
    title: `${titleCase(district.name)}, ${titleCase(state.name)} — ${fmtNum(district.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
    description: `${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools in ${titleCase(district.name)} district (${fmtRate(district.rate)}) are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` }, { label: district.name }]),
    headline: hero(district.name, district,
      compareToBaseline(district.rate, state.rate, `${titleCase(state.name)} average`), nationalRate),
    table: statTable(district.blocks.map((b) =>
      statRow(b.name, `/state/${state.slug}/${district.slug}/${b.slug}`, b.flagged, b.total, b.rate, m, nationalRate)).join(''),
      'Filter blocks…', 'Block'),
  });
}

export function renderBlockPage(state, district, block, nationalRate) {
  // Straight into the report form for this exact school. Until the
  // /report/<udise> route existed, the best a row could do was open the
  // state map and leave the reader to find the pin themselves.
  const reportHref = (udise) => `/app/#/report/${esc(udise)}`;
  // School names render verbatim, NOT title-cased: ~30% carry abbreviations
  // (LPS, UPS, SSA, GOVT.) that title-casing corrupts — "AGGONGITIM LPS"
  // would become "Aggongitim Lps", and LPS means Lower Primary School.
  const rows = block.schools.map((s) => `
    <tr data-name="${esc(s.name.toLowerCase())}">
      <td class="name"><a href="${reportHref(s.udise)}">${esc(s.name)}</a></td>
      <td class="udise">${esc(s.udise)}</td>
      <td><span class="tag ${s.indicator === 'no_girls_toilet' ? 'tag-none' : 'tag-broken'}">${esc(INDICATOR_TEXT[s.indicator] ?? 'Unknown')}</span></td>
    </tr>`).join('');

  return renderPage({
    title: `${titleCase(block.name)}, ${titleCase(district.name)} — ${fmtNum(block.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
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
