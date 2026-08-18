import maplibregl from 'maplibre-gl';
import { loadIndex, loadState } from '../lib/schools.js';
import { addPinLayers, setPinData } from './pins.js';
import { currentTheme } from '../lib/theme.js';

// Both styles need the same glyphs URL for the cluster-count symbol layer's
// text-field (pins.js) — without it, MapLibre throws on addLayer and every
// layer queued after cluster-count, including the actual "pins" layer,
// never gets added.
const GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

const rasterStyle = (tileSet) => ({
  version: 8,
  glyphs: GLYPHS,
  sources: {
    carto: {
      type: 'raster',
      tiles: [`https://a.basemaps.cartocdn.com/${tileSet}/{z}/{x}/{y}.png`],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
});

const DARK_RASTER = rasterStyle('dark_all');
const LIGHT_RASTER = rasterStyle('light_all');
const styleFor = (theme) => (theme === 'light' ? LIGHT_RASTER : DARK_RASTER);

// Pin data lives in a MapLibre GeoJSON source, which setStyle() wipes along
// with every custom layer. Kept here so a theme swap can restore both.
let lastGeojson = { type: 'FeatureCollection', features: [] };

export async function initMap(containerId = 'map') {
  const map = new maplibregl.Map({
    container: containerId,
    style: styleFor(currentTheme()),
    center: [78.9629, 22.5937],
    zoom: 3.8,
  });
  await new Promise((r) => map.on('load', r));
  addPinLayers(map);
  return map;
}

/** Called by the topbar's theme toggle. setStyle() replaces the whole style
 *  — including our custom source and layers — so this waits for the new
 *  style to finish loading, then re-adds the pin layers and restores
 *  whatever was last shown, rather than re-fetching it. */
export function applyMapTheme(map, theme) {
  map.setStyle(styleFor(theme));
  map.once('style.load', () => {
    addPinLayers(map);
    setPinData(map, lastGeojson);
  });
}

export async function showState(map, stateCode) {
  const gj = await loadState(stateCode);
  lastGeojson = gj;
  setPinData(map, gj);
  return gj.features.length;
}

/** Default (no state in the URL) national view. Fetches every state in
 *  parallel and merges pins onto the map as each one arrives, so the map
 *  fills in progressively instead of blocking on the full ~19MB dataset
 *  before showing a single pin. */
export async function showAllStates(map, onProgress) {
  const idx = await loadIndex();
  const merged = { type: 'FeatureCollection', features: [] };
  await Promise.all(idx.states.map(async (s) => {
    const gj = await loadState(s.code);
    merged.features.push(...gj.features);
    lastGeojson = merged;
    setPinData(map, merged);
    onProgress?.(merged.features.length, idx.total);
  }));
  return merged.features.length;
}

export async function stateList() {
  const idx = await loadIndex();
  return idx.states;
}
