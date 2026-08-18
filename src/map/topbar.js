import { mountSearch } from './search.js';
import { getSchool } from '../lib/schools.js';
import { openSheetForSchool } from './sheet.js';
import { APP_NAME } from '../config.js';

/** search.js/mountSearch was built and tested (Task 7) but nothing in the
 *  app ever called it — #topbar had no content at all, which is also why
 *  the default map view had no way to reach any pin. This is the wiring. */
export function mountTopbar(el, map) {
  el.innerHTML = `
    <span class="brand">${APP_NAME}</span>
    <button id="search-toggle" type="button">Search schools</button>
    <div id="search-panel" hidden></div>
  `;
  const panel = el.querySelector('#search-panel');

  el.querySelector('#search-toggle').addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (panel.hidden || panel.dataset.mounted) return;
    panel.dataset.mounted = '1';
    mountSearch(panel, async (udiseCode) => {
      const school = await getSchool(udiseCode);
      if (!school) return;
      panel.hidden = true;
      map.flyTo({ center: [school.lng, school.lat], zoom: 14 });
      openSheetForSchool(school);
    });
  });
}
