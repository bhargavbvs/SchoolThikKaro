import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { flattenSchools } from './lib/normalise.mjs';
import { buildCoordIndex, joinSchools } from './lib/coords.mjs';

const NDJSON = '.data-src/india_girls_toilet.ndjson';
const CSV = '.data-src/udise_schools.csv';

const records = readFileSync(NDJSON, 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));
const schools = flattenSchools(records);
console.log(`flagged schools (deduped): ${schools.length.toLocaleString()}`);

const coords = await buildCoordIndex(CSV);
console.log(`coordinate index: ${coords.size.toLocaleString()}`);

const { matched, unmatched, matchRate } = joinSchools(schools, coords);
console.log(`matched:   ${matched.length.toLocaleString()}`);
console.log(`unmatched: ${unmatched.length.toLocaleString()}`);
console.log(`MATCH RATE: ${(matchRate * 100).toFixed(2)}%`);

const byState = {};
for (const u of unmatched) byState[u.state] = (byState[u.state] ?? 0) + 1;
console.log('worst unmatched states:',
  Object.entries(byState).sort((a, b) => b[1] - a[1]).slice(0, 8));

mkdirSync('.data-src', { recursive: true });
writeFileSync('.data-src/joined.json', JSON.stringify(matched));
writeFileSync('.data-src/unmatched.json', JSON.stringify(unmatched));
