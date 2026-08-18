import maplibregl from 'maplibre-gl';
import { loadIndex, loadState } from '../lib/schools.js';
import { addPinLayers, setPinData } from './pins.js';

const DARK_RASTER = {
  version: 8,
  // Required for the cluster-count symbol layer's text-field (pins.js).
  // Without it, MapLibre throws on addLayer and every layer queued after
  // cluster-count — including the individual "pins" layer — never gets
  // added, which is why pins silently failed to render.
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    carto: {
      type: 'raster',
      tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    },
  },
  layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
};

export async function initMap(containerId = 'map') {
  const map = new maplibregl.Map({
    container: containerId,
    style: DARK_RASTER,
    center: [78.9629, 22.5937],
    zoom: 3.8,
  });
  await new Promise((r) => map.on('load', r));
  addPinLayers(map);
  return map;
}

export async function showState(map, stateCode) {
  const gj = await loadState(stateCode);
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
    setPinData(map, merged);
    onProgress?.(merged.features.length, idx.total);
  }));
  return merged.features.length;
}

export async function stateList() {
  const idx = await loadIndex();
  return idx.states;
}
