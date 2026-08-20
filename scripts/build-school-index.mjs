// Writes the sharded school search index into dist/.
//
// Runs as part of the build, after prerender. Each shard is a JSON array
// of [name, udise, "state/district/block"], fetched only when a reader has
// typed the three letters that key it.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { shardsForName } from './lib/school-index.mjs';

const tree = JSON.parse(readFileSync('data/aggregates.json', 'utf8'));
const OUT = 'dist/data/si';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const shards = new Map();
let schools = 0;
for (const s of tree.states) {
  for (const d of s.districts) {
    for (const b of d.blocks) {
      const path = `${s.slug}/${d.slug}/${b.slug}`;
      for (const sc of b.schools) {
        schools++;
        const row = [sc.name, sc.udise, path];
        for (const key of shardsForName(sc.name)) {
          if (!shards.has(key)) shards.set(key, []);
          shards.get(key).push(row);
        }
      }
    }
  }
}

let bytes = 0;
let biggest = 0;
for (const [key, rows] of shards) {
  const json = JSON.stringify(rows);
  // Shard keys are three ASCII letters by construction, so they are safe
  // as filenames without escaping.
  writeFileSync(`${OUT}/${key}.json`, json);
  bytes += json.length;
  if (rows.length > biggest) biggest = rows.length;
}

const reachable = new Set();
for (const rows of shards.values()) for (const r of rows) reachable.add(r[1]);
console.log(`school index: ${shards.size.toLocaleString()} shards, ` +
  `${(bytes / 1e6).toFixed(1)}MB total, biggest ${biggest.toLocaleString()} entries`);
console.log(`  ${reachable.size.toLocaleString()} of ${schools.toLocaleString()} schools reachable by name`);
if (reachable.size < schools * 0.999) {
  console.warn(`  WARNING: ${schools - reachable.size} schools cannot be found by typing their name`);
}
