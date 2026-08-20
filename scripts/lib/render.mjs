// Import rather than re-declare: the spec requires the source year to be
// structurally impossible to omit or drift. src/config.js imports cleanly
// under plain Node (its import.meta.env access is optional-chained).
import { SOURCE_YEAR } from '../../src/config.js';
import { titleCase, compareToBaseline, barWidth, severityOf, officialClaimRate, oneInN, oneInLabel } from './format.mjs';
import { esc } from './render-escape.mjs';
import { renderChoropleth, renderLegend, stateKey } from './choropleth.mjs';
import { ISSUE_LABELS } from './school-detail.mjs';
import { accountableFor, askLine } from './accountable.mjs';

export const SITE = 'https://shaala-flax.vercel.app';

// Read from the same env Vite gives the app, so the static pages and the
// SPA can never disagree about which project they are talking to.
const SUPABASE_REST = process.env.VITE_SUPABASE_URL
  ? `${process.env.VITE_SUPABASE_URL}/rest/v1` : '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';

const MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

// The button ships hidden and is revealed here, so a reader with no
// JavaScript is never shown a control that cannot do anything. The choice
// is stored under the same key the SPA uses, so switching theme on a
// browse page carries into the reporting flow and back.
const THEME_SCRIPT = `<script>
(function(){var b=document.getElementById('theme-toggle');if(!b)return;b.hidden=false;
b.addEventListener('click',function(){var d=document.documentElement;
var next=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=next;
try{localStorage.setItem('shaala.theme',next);}catch(e){}});})();
</script>`;

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
<div class="mast-bar"><header class="masthead">
  <a class="wordmark" href="/">SchoolThikKaro</a>
  <div class="mast-right">
    <span class="tag">${esc(SOURCE_YEAR)} · Government’s own record</span>
    <button class="theme-toggle" type="button" id="theme-toggle" hidden
            aria-label="Switch between light and dark">
      <span class="t-dark">${MOON}Dark</span>
      <span class="t-light">${SUN}Light</span>
    </button>
  </div>
</header>
${THEME_SCRIPT}
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
  <p class="hero-rate"><strong class="${sev}">${oneInLabel(rate) ?? '—'}</strong> <span>schools here has an issue in the government’s record</span></p>
  <p class="sub">${fmtNum(flagged)} of ${fmtNum(total)} girls’ and co-ed schools</p>
  ${comparison ? `<p class="cmp ${comparison.startsWith('below') ? 'is-low' : ''}">${esc(comparison)}</p>` : ''}`;
};

/* `total` is deliberately absent: the table shows the count and how common
   it is, and "1 in 3" already states the ratio the denominator would. The
   full "13,328 of 1,20,652" still leads every region page. */
const statRow = (label, href, flagged, rate, maxRate, nationalRate, rank) => `
  <tr data-name="${esc(titleCase(label).toLowerCase())}" data-key="${esc(stateKey(label))}" data-rate="${rate ?? 0}" data-count="${flagged ?? 0}">
    <td class="rank">${String(rank).padStart(2, '0')}</td>
    <td class="name"><a href="${esc(href)}">${esc(titleCase(label))}</a></td>
    <td class="num">${fmtNum(flagged)}</td>
    <td class="num rate"><span class="rate-wrap"><span class="bar ${severityOf(rate, nationalRate)}" style="--w:${barWidth(rate, maxRate)}%" aria-hidden="true"></span><span class="rate-val ${severityOf(rate, nationalRate)}">${oneInLabel(rate) ?? '—'}</span></span></td>
  </tr>`;

/** Rows are pre-rendered and visible with JavaScript off; this only hides
 *  non-matching ones. Kept inline and tiny so browse pages stay free of any
 *  bundle — the whole point of them being static. */
// Filtering and paging are one script because they are one behaviour: the
// pager must page the FILTERED set, not the whole table, or searching for
// a district lands you on page 4 of results that no longer exist.
//
// Rows are all pre-rendered and all in the DOM. With JavaScript off the
// whole list simply shows, which is the honest fallback — and it is why a
// crawler still sees every district, block and school on the page.
const PAGE_SIZE = 10;
const FILTER_SCRIPT = `<script>
(function(){
var table=document.querySelector('table.stats'); if(!table) return;
var body=table.tBodies[0];
var rows=[].slice.call(body.querySelectorAll('tr[data-name]'));
var input=document.getElementById('filter');
var pager=document.getElementById('pager');
var sortby=document.getElementById('sortby');
var per=${PAGE_SIZE}, page=0, q='', key='rate';

// Whole rows are clickable. The name is still a real link — that is what a
// crawler follows and what a keyboard reaches — this only widens the target
// to the rest of the row, which on a phone is the difference between one
// tap and three.
body.addEventListener('click', function(e){
  if(e.target.closest('a')) return;
  var a=e.target.closest('tr')&&e.target.closest('tr').querySelector('td.name a');
  if(a) a.click();
});

function render(){
  var hit=[];
  for(var n=0;n<rows.length;n++){
    if(!q||rows[n].dataset.name.indexOf(q)>-1) hit.push(rows[n]);
    else rows[n].style.display='none';
  }
  var pages=Math.max(1,Math.ceil(hit.length/per));
  if(page>=pages) page=pages-1;
  if(page<0) page=0;
  for(var k=0;k<hit.length;k++){
    hit[k].style.display=(k>=page*per&&k<(page+1)*per)?'table-row':'none';
    // The rank follows the order on screen; a row is 03 because it is
    // third in what you are looking at, not third in some other sort.
    var c=hit[k].querySelector('td.rank');
    if(c) c.textContent=String(k+1).length<2?'0'+(k+1):String(k+1);
  }
  if(pager){
    // A list that fits on one page has nothing to page through.
    pager.hidden=pages<=1;
    var from=hit.length?page*per+1:0, to=Math.min((page+1)*per,hit.length);
    pager.querySelector('.pager-status').textContent=
      hit.length?(from+'-'+to+' of '+hit.length):'nothing matches';
    pager.querySelector('[data-page=prev]').disabled=page<=0;
    pager.querySelector('[data-page=next]').disabled=page>=pages-1;
  }
}
function resort(){
  rows.sort(function(a,b){ return (+b.dataset[key])-(+a.dataset[key]); });
  for(var i=0;i<rows.length;i++) body.appendChild(rows[i]);
}
if(input){input.hidden=false;input.addEventListener('input',function(){
  q=input.value.trim().toLowerCase();page=0;render();});}
if(sortby){sortby.hidden=false;sortby.addEventListener('click',function(e){
  var b=e.target.closest('button[data-sort]'); if(!b) return;
  key=b.dataset.sort; page=0;
  [].forEach.call(sortby.querySelectorAll('button'),function(x){x.classList.toggle('is-on',x===b);});
  resort(); render();});}
if(pager){pager.addEventListener('click',function(e){
  var b=e.target.closest('button[data-page]');if(!b)return;
  page+=b.dataset.page==='next'?1:-1;render();
  table.scrollIntoView({block:'start'});});}
render();

// The map and the ledger are two views of one thing. Hovering either
// marks the other, which is what makes them read as one — and is the
// reason the pin map was replaced by something this could be done to.
var svg=document.querySelector('svg.india');
if(svg){
  var byKey={};
  for(var r=0;r<rows.length;r++) if(rows[r].dataset.key) byKey[rows[r].dataset.key]=rows[r];
  var mark=function(key,on){
    var row=byKey[key]; if(row) row.classList.toggle('is-linked',on);
    var p=svg.querySelector('path[data-key="'+key+'"]');
    if(p) p.classList.toggle('is-linked',on);
  };
  svg.addEventListener('mouseover',function(e){
    var p=e.target.closest('path[data-key]'); if(p) mark(p.dataset.key,true); });
  svg.addEventListener('mouseout',function(e){
    var p=e.target.closest('path[data-key]'); if(p) mark(p.dataset.key,false); });
  body.addEventListener('mouseover',function(e){
    var t=e.target.closest('tr[data-key]'); if(t) mark(t.dataset.key,true); });
  body.addEventListener('mouseout',function(e){
    var t=e.target.closest('tr[data-key]'); if(t) mark(t.dataset.key,false); });
}
})();
</script>`;

/** The pager markup. Ships hidden and is revealed by the script above, so a
 *  reader without JavaScript is never shown controls that cannot do
 *  anything — they get the full list instead, which is the better fallback. */
/** Approved reports, fetched at view time.
 *
 *  These pages are static and the reports are not, so the band starts
 *  hidden and only appears once something has actually been approved. An
 *  empty "no reports yet" panel on the front page advertises that nobody
 *  has used this, which is worse than not mentioning it. */
const LIVE_SCRIPT = `<script>
(function(){
var url=${JSON.stringify(SUPABASE_REST)}, key=${JSON.stringify(SUPABASE_ANON)};
if(!url) return;
var H={apikey:key,Authorization:'Bearer '+key};
var say={girls_toilet:"the girls’ toilet",boys_toilet:"the boys’ toilet",
  drinking_water:'drinking water',handwashing:'handwashing',electricity:'electricity',
  classroom:'a classroom',boundary_wall:'the boundary wall',ramp:'a ramp',
  playground:'the playground',other:'something else'};
var found={absent:'nothing at all',broken:'it broken',locked:'it locked',
  no_water:'no water',inadequate:'not enough',working:'it working'};
var ago=function(t){var m=Math.round((Date.now()-new Date(t))/60000);
  if(m<60) return m+'m ago'; if(m<1440) return Math.round(m/60)+'h ago';
  return Math.round(m/1440)+'d ago';};
var set=function(id,v){var el=document.getElementById(id); if(el) el.textContent=v;};

// One request serves all three panels: the two live figures at the top
// and the band further down. The columns are chosen so nothing that could
// identify a reporter is ever requested.
fetch(url+'/reports?select=category,finding,tier,created_at,school_name_snapshot'
  +'&review_status=eq.approved&order=created_at.desc&limit=50',{headers:H})
 .then(function(r){return r.ok?r.json():[];})
 .then(function(rows){
   if(!rows.length) return;
   var top=rows[0];
   set('latest-figure', say[top.category]||'a facility');
   set('latest-note', (found[top.finding]||'a problem')+' \u00b7 '
     +(top.school_name_snapshot||'a school')+' \u00b7 '+ago(top.created_at));
   set('filed-figure', rows.length>=50 ? '50+' : String(rows.length));
   var mini=document.getElementById('filed-mini');
   if(mini){
     set('mini-verified', String(rows.filter(function(r){return r.tier==='verified';}).length));
     // Distinct schools, not states: the query does not ask for a state,
     // and labelling this "states" would have been a number that meant
     // something other than what it said.
     var names={}; rows.forEach(function(r){ if(r.school_name_snapshot) names[r.school_name_snapshot]=1; });
     set('mini-schools', String(Object.keys(names).length));
     mini.hidden=false;
   }
   var sec=document.getElementById('live'), list=document.getElementById('live-list');
   if(sec&&list){
     list.innerHTML=rows.slice(0,6).map(function(r){
       return '<li><span class="dot"></span>Someone reported '
         +(found[r.finding]||'a problem')+' for '+(say[r.category]||'a facility')
         +' <span class="when">\u00b7 '+ago(r.created_at)+'</span></li>';
     }).join('');
     sec.hidden=false;
   }
 }).catch(function(){});
})();
</script>`;

const PAGER = `<nav class="pager" id="pager" hidden aria-label="Pages">
  <button type="button" data-page="prev">\u2190 Previous</button>
  <span class="pager-status"></span>
  <button type="button" data-page="next">Next \u2192</button>
</nav>`;

const statTable = (rows, filterLabel, nameLabel = 'Name', ledgerLabel = 'Registry') => `
<section class="ledger">
  <header class="ledger-head">
    <h2>${esc(ledgerLabel)}</h2>
    <span class="ledger-tag">${esc(SOURCE_YEAR)}</span>
  </header>
  ${filterLabel ? `<div class="ledger-controls">
    <div class="sortby" id="sortby" hidden>
      <span class="sort-label">Sort</span>
      <button type="button" data-sort="rate" class="is-on">Most affected</button>
      <button type="button" data-sort="count">Most schools</button>
    </div>
    <input id="filter" type="search" hidden placeholder="${esc(filterLabel)}" aria-label="${esc(filterLabel)}" />
  </div>` : ''}
<table class="stats" id="data">
  <thead><tr><th class="rank"><span class="sr-only">Rank</span></th><th>${esc(nameLabel)}</th><th class="num"><span class="lg">Schools with issues</span><span class="sm">Issues</span></th><th class="num"><span class="lg">How common</span><span class="sm">Rate</span></th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${filterLabel ? PAGER : ''}
</section>
<p class="table-note">“Issues” here means the one thing ${esc(SOURCE_YEAR)} records about
  girls’ toilets: the school has none, or has one that does not function. It is the only
  issue in this release — a school counted as having no issue may still have others.</p>
${filterLabel ? FILTER_SCRIPT : ''}`;

/** What the schools in a region show beyond the toilet they are listed for.
 *
 *  Counted from each school's own UDISE+ record. The denominator is stated
 *  because it is not the region's whole school population: these are the
 *  schools already flagged for a girls' toilet, so the figures describe
 *  THEM, not every school in the block. Reading them as the latter would
 *  overstate the problem, and the caption exists to stop that. */
const issuePanel = (node, label) => {
  const counts = node.issueCounts ?? {};
  const rows = Object.entries(counts)
    .filter(([key]) => key !== 'no_girls_toilet')     // that is why they are listed
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `
      <li><span class="n">${fmtNum(n)}</span>
        <span class="l">${esc(ISSUE_LABELS[key] ?? key)}</span></li>`).join('');
  if (!rows) return '';
  return `<section class="issues">
    <h2>What else these schools report</h2>
    <p class="note">Of the <b>${fmtNum(node.flagged)}</b> schools in ${esc(label)} listed here,
      this is what their own ${esc(SOURCE_YEAR)} records show. These counts describe those
      schools, not every school in ${esc(label)}.</p>
    <ul class="issue-list">${rows}</ul>
  </section>`;
};

/** Who currently holds the seats these schools sit in.
 *
 *  A statement of fact, not an accusation: the record predates most terms.
 *  Rendered only where we hold representative data — nothing is implied by
 *  its absence elsewhere. */
const accountablePanel = (schools, repIndex) => {
  if (!repIndex) return '';
  const entries = accountableFor(schools, repIndex).filter((e) => e.member);
  if (!entries.length) return '';
  const rows = entries.map((e) => `
    <li>
      <span class="who">${esc(e.member)}${e.party ? ` <span class="party">${esc(e.party)}</span>` : ''}</span>
      <span class="seat">${esc(e.constituency)} · ${fmtNum(e.schools)} of these schools</span>
      ${e.source ? `<a class="src" href="${esc(e.source)}" rel="nofollow noopener">Record</a>` : ''}
    </li>`).join('');
  return `<section class="accountable">
    <h2>Who answers for these schools</h2>
    <p class="note">The sitting members for the assembly seats these schools fall in.
      Listed because they are who to ask — not as a claim that they caused it.</p>
    <ul class="who-list">${rows}</ul>
  </section>`;
};

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
    label: `${titleCase(s.name)} — ${oneInLabel(s.rate) ?? '—'} schools has an issue in the record`,
  }]));
  const map = `<figure class="atlas-map">
      <header class="map-head">
        <h2>India, by state</h2>
        <p>Darker is more common. Hover a state or a row to link the two.</p>
      </header>
      ${renderChoropleth({
        shapes: geo.shapes, viewBox: geo.viewBox, byKey, nationalRate: tree.national.rate,
        title: 'Share of government schools with no working girls\u2019 toilet, by state',
        labelTop: 4,
      })}
      ${renderLegend()}
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
      <p class="kicker"><span class="dot"></span><span class="label">The government’s own record · ${fmtNum(tree.national.flagged)} schools, block by block</span></p>
      <h1>Find a school.<br />See what\u2019s missing.<br />Make someone answer.</h1>
      <p class="standfirst">Send a photo of what you actually see.
        Anonymous, from the spot, in a minute. #SchoolThikKaro</p>
      <div class="actions">
        <a class="btn btn-primary" href="#data">Find a school →</a>
        <a class="btn btn-ghost" href="/app/#/add">Report what you find</a>
      </div>
    </div>

    <div class="stat-grid">
      <div class="stat" id="stat-latest">
        <span class="stat-label">Latest report</span>
        <div class="figure" id="latest-figure">—</div>
        <p class="note" id="latest-note">No reports yet. Yours would be the first.</p>
      </div>
      <div class="stat" id="stat-filed">
        <span class="stat-label">Reports filed</span>
        <div class="figure" id="filed-figure">0</div>
        <p class="note">from people standing at the school.</p>
        <dl class="stat-mini" id="filed-mini" hidden>
          <div><dt id="mini-schools">0</dt><dd>schools</dd></div>
          <div><dt id="mini-verified">0</dt><dd>verified on-site</dd></div>
        </dl>
      </div>
      <div class="stat">
        <span class="stat-label">Schools in the record</span>
        <div class="figure">${fmtNum(tree.national.flagged)}</div>
        <p class="note">found short of a working girls’ toilet by the
          <b>${esc(SOURCE_YEAR)}</b> report — <b>1 in ${oneInN(tree.national.rate)}</b> of every
          government school girls attend. <b>${fmtNum(tree.national.nonFunctional)}</b> of them
          have a toilet that does not work, counted as fine.</p>
      </div>
    </div>`,
    // Map and table are one unit: the map answers "where", the table
    // answers "how many", and neither is trustworthy without the other in
    // view. The map carries no figures precisely because the table is
    // right beside it.
    table: `<section class="atlas">${map}<div class="atlas-table">
      ${statTable(
      (() => { const m = maxRateOf(tree.states); const nat = tree.national.rate;
        return tree.states.map((s, i) =>
          statRow(s.name, `/state/${s.slug}`, s.flagged, s.rate, m, nat, i + 1)).join(''); })(),
      'Filter states…', 'State', 'State registry')}</div></section>`,
    extra: `<section class="findmine">
      <h2>Whatever is broken, report it</h2>
      <p>The figures here are girls’ toilets — that is all this release counts.
         What you can report is anything: the water, the wiring, the classroom,
         the wall, the ramp. Any school, whether it is in the record or not.</p>
      <p class="actions">
        <a class="btn btn-primary" href="/app/#/add">Report a school →</a>
      </p>
    </section>

    <section class="live" id="live" hidden>
      <div class="live-head">
        <h2>Live <em>reports</em>.</h2>
        <p>What people have sent from the spot. Every one is anonymous,
           checked by a moderator, and permanent.</p>
      </div>
      <ul class="live-list" id="live-list"></ul>
    </section>
    ${LIVE_SCRIPT}

    <section class="faq">
      <h2>Questions.</h2>
      ${[
        ['Is my report really anonymous?',
         'We never record who you are — no account, no name, no email. We do record where '
         + 'the photo was taken, because that is what lets a report be checked. Your IP is '
         + 'hashed with a secret and kept only to stop one person flooding the queue.'],
        ['What if my school is not listed?',
         'Most are not. This site can only enumerate the ' + fmtNum(tree.national.flagged)
         + ' schools the government already flagged — about 1 in ' + oneInN(tree.national.rate)
         + '. Report it anyway: those go to a separate record, marked as reported by a '
         + 'citizen, and are never counted inside the official figures.'],
        ['Where do these numbers come from?',
         'Every figure on this site is from ' + SOURCE_YEAR + ', the government’s own '
         + 'release, as each school reported it. We publish them as the school’s record, '
         + 'not as our finding. Nothing here is our estimate.'],
        ['What happens to my photo?',
         'Faces are blurred on your phone before anything is sent, and a photo that had '
         + 'faces in it and was not blurred is refused by the server. A moderator reviews '
         + 'every submission before it appears.'],
      ].map(([q, a]) => `
      <details class="faq-item">
        <summary>${esc(q)}</summary>
        <div class="faq-body"><p>${esc(a)}</p></div>
      </details>`).join('')}
    </section>

    <section class="closer">
      <h2>Every report is one<br />school someone looked at.</h2>
      <p>A minute on your phone. Anonymous. Published once a moderator has checked it.</p>
      <p><a class="btn btn-accent" href="/app/#/add">Report a school →</a></p>
    </section>`,
  });
}

export function renderStatePage(state, nationalRate) {
  const m = maxRateOf(state.districts);
  return renderPage({
    title: `${titleCase(state.name)} — ${fmtNum(state.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
    description: `${fmtNum(state.flagged)} of ${fmtNum(state.total)} schools in ${titleCase(state.name)} — ${oneInLabel(state.rate) ?? '—'} — are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' }, { label: state.name }]),
    headline: hero(state.name, state, compareToBaseline(state.rate, nationalRate, 'national average'), nationalRate),
    table: statTable(state.districts.map((d, i) =>
      statRow(d.name, `/state/${state.slug}/${d.slug}`, d.flagged, d.rate, m, nationalRate, i + 1)).join(''),
      'Filter districts…', 'District', 'District registry'),
    extra: issuePanel(state, titleCase(state.name)),
  });
}

export function renderDistrictPage(state, district, nationalRate, repIndex = null) {
  const m = maxRateOf(district.blocks);
  return renderPage({
    title: `${titleCase(district.name)}, ${titleCase(state.name)} — ${fmtNum(district.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
    description: `${fmtNum(district.flagged)} of ${fmtNum(district.total)} schools in ${titleCase(district.name)} district — ${oneInLabel(district.rate) ?? '—'} — are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
    canonical: `${SITE}/state/${state.slug}/${district.slug}`,
    breadcrumb: crumb([{ label: 'India', href: '/' },
      { label: state.name, href: `/state/${state.slug}` }, { label: district.name }]),
    headline: hero(district.name, district,
      compareToBaseline(district.rate, state.rate, `${titleCase(state.name)} average`), nationalRate),
    table: statTable(district.blocks.map((b, i) =>
      statRow(b.name, `/state/${state.slug}/${district.slug}/${b.slug}`, b.flagged, b.rate, m, nationalRate, i + 1)).join(''),
      'Filter blocks…', 'Block', 'Block registry'),
    extra: `${issuePanel(district, titleCase(district.name))}${
      accountablePanel(district.blocks.flatMap((b) => b.schools), repIndex)}`,
  });
}

export function renderBlockPage(state, district, block, nationalRate, repIndex = null) {
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
      <td class="what">
        <span class="tag ${s.indicator === 'no_girls_toilet' ? 'tag-none' : 'tag-broken'}">${esc(INDICATOR_TEXT[s.indicator] ?? 'Unknown')}</span>
        ${(s.issues ?? []).filter((k) => k !== 'no_girls_toilet').map((k) =>
          `<span class="tag tag-more">${esc(ISSUE_LABELS[k] ?? k)}</span>`).join('')}
        ${typeof s.teachers === 'number' ? `<span class="tag tag-count">${fmtNum(s.teachers)} teacher${s.teachers === 1 ? '' : 's'}${typeof s.students === 'number' ? ` · ${fmtNum(s.students)} children` : ''}</span>` : ''}
      </td>
    </tr>`).join('');

  return renderPage({
    title: `${titleCase(block.name)}, ${titleCase(district.name)} — ${fmtNum(block.flagged)} schools with no working girls’ toilet · SchoolThikKaro`,
    description: `${fmtNum(block.flagged)} of ${fmtNum(block.total)} schools in ${titleCase(block.name)}, ${titleCase(district.name)} — ${oneInLabel(block.rate) ?? '—'} — are recorded in ${SOURCE_YEAR} as lacking a working girls’ toilet.`,
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
      <thead><tr><th>School</th><th>UDISE</th><th>What its record shows</th></tr></thead>
      <tbody>${rows}</tbody></table>${PAGER}${FILTER_SCRIPT}`,
    extra: `${issuePanel(block, titleCase(block.name))}${accountablePanel(block.schools, repIndex)}`,
  });
}
