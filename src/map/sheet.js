import { SOURCE_YEAR } from '../config.js';
import { openSubmitFlow } from '../submit/submit.js';

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderSheetHTML(school) {
  return `
    <h2>${esc(school.name)}</h2>
    <p class="meta">${esc(school.district)}, ${esc(school.state)}</p>
    <p class="udise">UDISE ${esc(school.udise)}</p>
    <div class="claim">
      <p class="claim-label">As reported by this school to ${esc(SOURCE_YEAR)}:</p>
      <p class="claim-value">${esc(INDICATOR_TEXT[school.indicator] ?? 'Unknown')}</p>
    </div>
    <button id="sheet-report" type="button">Report what you found</button>
  `;
}

/** MapLibre feature.properties carries NO coordinates. The submit flow needs
 *  school.lat/lng to compute the distance tier, so merge the geometry in here.
 *  Passing bare `properties` is a bug: it yields NaN distances downstream. */
export function schoolFromFeature(feature) {
  return {
    ...feature.properties,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
    sourceYear: SOURCE_YEAR,
  };
}

export function openSheet(feature) {
  const school = schoolFromFeature(feature);
  const el = document.getElementById('sheet');
  el.innerHTML = renderSheetHTML(school);
  el.hidden = false;
  el.querySelector('#sheet-report')
    .addEventListener('click', () => openSubmitFlow(school));
}
