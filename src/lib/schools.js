import { SOURCE_YEAR } from '../config.js';
import { haversineMeters } from './geo.js';

let _index = null;
const _states = new Map();
let _all = null;

function pad(code) { return String(code).trim().padStart(11, '0'); }

function toSchool(f) {
  return {
    udise: f.properties.udise,
    name: f.properties.name,
    state: f.properties.state,
    district: f.properties.district,
    block: f.properties.block ?? null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    indicator: f.properties.indicator,
    sourceYear: SOURCE_YEAR,
  };
}

export async function loadIndex() {
  if (_index) return _index;
  const res = await fetch('/data/index.json');
  _index = await res.json();
  return _index;
}

/** A state may be split across multiple budget-sized files
 *  (see scripts/build-geo.mjs) — this merges them into one FeatureCollection
 *  so callers never need to know how many files back a state. */
export async function loadState(stateCode) {
  if (_states.has(stateCode)) return _states.get(stateCode);
  const idx = await loadIndex();
  const st = idx.states.find((s) => s.code === stateCode);
  if (!st) return { type: 'FeatureCollection', features: [] };
  const parts = await Promise.all(
    st.files.map((file) => fetch(`/data/${file}`).then((r) => r.json())));
  const gj = { type: 'FeatureCollection', features: parts.flatMap((p) => p.features) };
  _states.set(stateCode, gj);
  return gj;
}

async function loadAll() {
  if (_all) return _all;
  const idx = await loadIndex();
  const parts = await Promise.all(idx.states.map((s) => loadState(s.code)));
  _all = parts.flatMap((gj) => gj.features.map(toSchool));
  return _all;
}

export async function getSchool(udiseCode) {
  const all = await loadAll();
  const want = pad(udiseCode);
  return all.find((s) => s.udise === want) ?? null;
}

export async function searchSchools(query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [];
  const all = await loadAll();
  if (/^\d{10,11}$/.test(q)) {
    const hit = all.find((s) => s.udise === pad(q));
    return hit ? [hit] : [];
  }
  return all.filter((s) =>
    s.name.toLowerCase().includes(q) ||
    s.district.toLowerCase().includes(q)).slice(0, 50);
}

export async function nearestSchools(lat, lng, n = 10) {
  const all = await loadAll();
  return all
    .map((s) => ({ ...s, distanceM: haversineMeters(lat, lng, s.lat, s.lng) }))
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, n);
}
