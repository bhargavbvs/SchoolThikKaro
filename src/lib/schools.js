// STUB until Agent A implements the real pipeline-backed version.
// The signatures below are frozen — Agent B codes against them.
import { SOURCE_YEAR } from '../config.js';

let _cache = null;

async function loadSample() {
  if (_cache) return _cache;
  const res = await fetch('/data/schools-SAMPLE.geojson');
  const gj = await res.json();
  _cache = gj.features.map((f) => ({
    udise: f.properties.udise,
    name: f.properties.name,
    state: f.properties.state,
    district: f.properties.district,
    block: f.properties.block ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    indicator: f.properties.indicator,
    sourceYear: SOURCE_YEAR,
  }));
  return _cache;
}

export async function loadIndex() {
  const res = await fetch('/data/index.json');
  return res.json();
}

export async function loadState(_stateCode) {
  const res = await fetch('/data/schools-SAMPLE.geojson');
  return res.json();
}

export async function getSchool(udiseCode) {
  const all = await loadSample();
  return all.find((s) => s.udise === String(udiseCode).padStart(11, '0')) ?? null;
}
