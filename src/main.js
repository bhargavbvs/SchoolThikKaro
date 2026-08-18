import { onRoute, startRouter } from './lib/router.js';
import { mountAdmin } from './admin/admin.js';
import { initMap, showState } from './map/map.js';
import { openSheet } from './map/sheet.js';

onRoute(/^\/admin/, () => {
  const el = document.getElementById('admin-root');
  el.hidden = false;
  document.getElementById('map').style.display = 'none';
  mountAdmin(el);
});

onRoute(/^\/(?:$|state\/)/, async () => {
  const map = await initMap('map');
  const code = (window.location.hash.match(/state\/([A-Z-]+)/) || [])[1];
  if (code) await showState(map, code);
  map.on('click', 'pins', (e) => openSheet(e.features[0]));
  map.on('mouseenter', 'pins', () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', 'pins', () => (map.getCanvas().style.cursor = ''));
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
