import maplibregl from 'maplibre-gl';
import { loadIndex, loadState } from '../lib/schools.js';
import { addPinLayers, setPinData } from './pins.js';

const DARK_RASTER = {
  version: 8,
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

export async function stateList() {
  const idx = await loadIndex();
  return idx.states;
}
