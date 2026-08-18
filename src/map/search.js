import { searchSchools, nearestSchools } from '../lib/schools.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderResultsHTML(results) {
  if (!results.length) return '<p class="empty">No schools found.</p>';
  return `<ul class="results">${results.map((s) => `
    <li data-udise="${esc(s.udise)}">
      <span class="r-name">${esc(s.name)}</span>
      <span class="r-meta">${esc(s.district)}, ${esc(s.state)} · ${esc(s.udise)}</span>
    </li>`).join('')}</ul>`;
}

export function mountSearch(el, onPick) {
  el.innerHTML = `
    <input id="q" type="search" placeholder="School name, district, or UDISE code" />
    <button id="near" type="button">Schools near me</button>
    <div id="results"></div>`;
  const results = el.querySelector('#results');

  const show = (list) => {
    results.innerHTML = renderResultsHTML(list);
    results.querySelectorAll('li').forEach((li) =>
      li.addEventListener('click', () => onPick(li.dataset.udise)));
  };

  let t;
  el.querySelector('#q').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(async () => show(await searchSchools(e.target.value)), 250);
  });

  el.querySelector('#near').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => show(await nearestSchools(pos.coords.latitude, pos.coords.longitude, 10)),
      () => { results.innerHTML = '<p class="empty">Location unavailable.</p>'; },
      { enableHighAccuracy: true, timeout: 10000 });
  });
}
