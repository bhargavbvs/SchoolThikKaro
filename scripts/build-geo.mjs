import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assertBudget, stateCode } from './lib/budget.mjs';

const BUDGET = 500 * 1024;
const matched = JSON.parse(readFileSync('.data-src/joined.json', 'utf8'));

function toFeature(s) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(s.lng.toFixed(5)), Number(s.lat.toFixed(5))] },
    properties: {
      udise: s.udise, name: s.name, state: s.state,
      district: s.district, block: s.block, indicator: s.indicator,
    },
  };
}

function geojsonBytes(features) {
  return Buffer.byteLength(JSON.stringify({ type: 'FeatureCollection', features }));
}

/** Greedily packs a state's schools into one or more files, each under the
 *  size budget, without splitting a single district across files. Some
 *  states (Madhya Pradesh, Uttar Pradesh, Rajasthan, ...) are too large for
 *  one 500KB file — this is the documented fallback from the plan. */
function packIntoChunks(schoolsByDistrict, budget) {
  const chunks = [];
  let current = [];
  let currentBytes = 2; // "[]"
  for (const [, districtSchools] of schoolsByDistrict) {
    const districtFeatures = districtSchools.map(toFeature);
    const districtBytes = geojsonBytes(districtFeatures) - geojsonBytes([]);
    if (current.length && currentBytes + districtBytes > budget) {
      chunks.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(...districtFeatures);
    currentBytes += districtBytes;
    // A single district alone over budget: split it further, straight by count.
    if (currentBytes > budget && current.length === districtFeatures.length) {
      const perSchool = districtBytes / districtFeatures.length;
      const perFile = Math.max(1, Math.floor(budget / perSchool));
      chunks.push(...sliceArray(current, perFile));
      current = [];
      currentBytes = 2;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function sliceArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const byState = new Map();
for (const s of matched) {
  const code = stateCode(s.state);
  if (!byState.has(code)) byState.set(code, { name: s.state, schools: [] });
  byState.get(code).schools.push(s);
}

mkdirSync('public/data', { recursive: true });
const index = { states: [] };

for (const [code, { name, schools }] of byState) {
  const byDistrict = new Map();
  for (const s of schools) {
    if (!byDistrict.has(s.district)) byDistrict.set(s.district, []);
    byDistrict.get(s.district).push(s);
  }

  const chunks = packIntoChunks(byDistrict, BUDGET);
  const files = [];
  chunks.forEach((features, i) => {
    const file = chunks.length === 1 ? `schools-${code}.geojson` : `schools-${code}-${i + 1}.geojson`;
    writeFileSync(`public/data/${file}`, JSON.stringify({ type: 'FeatureCollection', features }));
    assertBudget(`public/data/${file}`, BUDGET);
    files.push(file);
  });

  index.states.push({ code, name, count: schools.length, files });
}

index.states.sort((a, b) => a.name.localeCompare(b.name));
index.total = matched.length;
// The methodology page renders this as a disclosed limitation. It must be
// written here or that page silently claims 100% coverage.
const unmatched = JSON.parse(readFileSync('.data-src/unmatched.json', 'utf8'));
index.matchRate = matched.length / (matched.length + unmatched.length);
index.unmatched = unmatched.length;
writeFileSync('public/data/index.json', JSON.stringify(index, null, 2));

const totalFiles = index.states.reduce((n, s) => n + s.files.length, 0);
console.log(`wrote ${index.states.length} states across ${totalFiles} files, ${index.total.toLocaleString()} schools`);
