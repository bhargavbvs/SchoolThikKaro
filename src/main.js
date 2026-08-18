import { onRoute, startRouter } from './lib/router.js';
import { mountAdmin } from './admin/admin.js';
import { initMap, showState, showAllStates } from './map/map.js';
import { openSheet } from './map/sheet.js';
import { mountTopbar } from './map/topbar.js';

onRoute(/^\/admin/, () => {
  const el = document.getElementById('admin-root');
  el.hidden = false;
  document.getElementById('map').style.display = 'none';
  mountAdmin(el);
});

// The route handler re-fires on every hashchange (e.g. state <-> state
// navigation). initMap() creates a real maplibregl.Map instance — calling
// it more than once would stack duplicate maps on the same #map container.
let mapPromise = null;

onRoute(/^\/(?:$|state\/)/, async () => {
  const firstMount = !mapPromise;
  mapPromise ??= initMap('map');
  const map = await mapPromise;

  const code = (window.location.hash.match(/state\/([A-Z-]+)/) || [])[1];
  if (code) await showState(map, code);
  else await showAllStates(map);

  if (firstMount) {
    mountTopbar(document.getElementById('topbar'), map);
    map.on('click', 'pins', (e) => openSheet(e.features[0]));
    map.on('mouseenter', 'pins', () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', 'pins', () => (map.getCanvas().style.cursor = ''));
  }
});

onRoute(/^\/methodology/, async () => {
  const { renderMethodologyHTML } = await import('./map/methodology.js');
  const idx = await (await fetch('/data/index.json')).json();
  const el = document.getElementById('sheet');
  el.innerHTML = renderMethodologyHTML({
    total: 1460759, noToilet: 39558, nonFunctional: 48324,
    matchRate: idx.matchRate ?? 1,
  });
  el.hidden = false;
});

startRouter();
