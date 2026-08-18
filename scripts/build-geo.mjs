import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { assertBudget, stateCode } from './lib/budget.mjs';

const BUDGET = 500 * 1024;
const matched = JSON.parse(readFileSync('.data-src/joined.json', 'utf8'));

const byState = new Map();
for (const s of matched) {
  const code = stateCode(s.state);
  if (!byState.has(code)) byState.set(code, []);
  byState.get(code).push(s);
}

mkdirSync('public/data', { recursive: true });
const index = { states: [] };

for (const [code, schools] of byState) {
  const gj = {
    type: 'FeatureCollection',
    features: schools.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(s.lng.toFixed(5)), Number(s.lat.toFixed(5))] },
      properties: {
        udise: s.udise, name: s.name, state: s.state,
        district: s.district, block: s.block, indicator: s.indicator,
      },
    })),
  };
  const file = `schools-${code}.geojson`;
  writeFileSync(`public/data/${file}`, JSON.stringify(gj));
  const size = assertBudget(`public/data/${file}`, BUDGET);
  index.states.push({ code, name: schools[0].state, count: schools.length, file, bytes: size });
}

index.states.sort((a, b) => a.name.localeCompare(b.name));
index.total = matched.length;
// The methodology page renders this as a disclosed limitation. It must be
// written here or that page silently claims 100% coverage.
const unmatched = JSON.parse(readFileSync('.data-src/unmatched.json', 'utf8'));
index.matchRate = matched.length / (matched.length + unmatched.length);
index.unmatched = unmatched.length;
writeFileSync('public/data/index.json', JSON.stringify(index, null, 2));
console.log(`wrote ${index.states.length} states, ${index.total.toLocaleString()} schools`);
