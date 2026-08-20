import { onRoute, startRouter } from './lib/router.js';
import { mountAdmin } from './admin/admin.js';
import { initMap, showState, showAllStates } from './map/map.js';
import { openSheet } from './map/sheet.js';
import { mountTopbar } from './map/topbar.js';
import { getSchool } from './lib/schools.js';
import { openSubmitFlow } from './submit/submit.js';

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

// The desktop gate prints a QR pointing here so a reporter can hand the
// job off to the phone that has the camera and the GPS (src/submit/qr.js).
// Without this route that QR led to a page that did nothing, which meant
// the desktop half of the reporting flow had never worked. It also gives
// every school row a direct way into the form, with no map in between.
onRoute(/^\/report\//, async () => {
  const code = (window.location.hash.match(/report\/(\d+)/) || [])[1];
  if (!code) return;
  const school = await getSchool(code);
  if (!school) {
    const el = document.getElementById('sheet');
    el.innerHTML = '<p>That school is not in this release. '
      + '<a href="/">Browse the record</a> to find it.</p>';
    el.hidden = false;
    return;
  }
  openSubmitFlow(school);
});

// A school the UDISE+ release never listed. Its own route because it is
// its own destination: the submission goes to school_submissions, not into
// the published figures.
onRoute(/^\/add/, async () => {
  document.getElementById('map').style.display = 'none';
  const [{ openPicker }, { openAddSchoolFlow }] = await Promise.all([
    import('./submit/picker.js'), import('./submit/addSchool.js'),
  ]);
  // The picker runs first. Picking a school we already hold sends the
  // reader to that school's own form, with the government's record beside
  // it; anything else prefills the unlisted form so nothing is retyped.
  await openPicker(async (candidate) => {
    if (candidate?.udise) {
      const { getSchool } = await import('./lib/schools.js');
      const school = await getSchool(candidate.udise);
      if (school) {
        const { openSubmitFlow } = await import('./submit/submit.js');
        return openSubmitFlow(school);
      }
    }
    return openAddSchoolFlow(candidate);
  });
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
