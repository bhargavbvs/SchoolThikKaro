import { readFileSync, writeFileSync } from 'node:fs';
import { buildTree } from './lib/aggregate.mjs';

const schools = JSON.parse(readFileSync('.data-src/joined.json', 'utf8'));
const totals = readFileSync('.data-src/region-totals.ndjson', 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l));

const tree = buildTree(schools, totals);

const nBlocks = tree.states.reduce((n, s) =>
  n + s.districts.reduce((m, d) => m + d.blocks.length, 0), 0);
const noRate = tree.states.reduce((n, s) =>
  n + s.districts.reduce((m, d) => m + d.blocks.filter((b) => b.rate === null).length, 0), 0);

console.log(`states: ${tree.states.length}`);
console.log(`districts: ${tree.states.reduce((n, s) => n + s.districts.length, 0)}`);
console.log(`blocks: ${nBlocks}  (without a rate: ${noRate})`);
console.log(`flagged: ${tree.national.flagged.toLocaleString()}`);

// Written to the tracked data/ directory (not .data-src/, which is
// gitignored raw-input scratch space) so that npm run build works on a
// fresh clone / CI / Vercel without depending on this machine's local
// .data-src symlink. See scripts/prerender.mjs, which reads this same path.
writeFileSync('data/aggregates.json', JSON.stringify(tree));
