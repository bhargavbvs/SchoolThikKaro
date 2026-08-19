// Copies the constituency representatives we hold into this repo, keeping
// only the fields the site will show.
//
//   node scripts/build-representatives.mjs [source-dir]
//
// This is a projection, not a copy. The source files carry declared
// criminal cases and asset totals; those are legitimate data in the
// project they come from, but printing them beside a school with no
// toilet is innuendo — the juxtaposition implies a causal link nothing
// supports, and the MLA elected in 2024 did not break a toilet that has
// been broken for a decade. Leaving them out of the artifact entirely
// means no later template can reach for them.
//
// The ask is "this is who answers for these schools". Not an accusation.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = process.argv[2] ?? '/Users/bhargavbvs/ssupwithstates/content/states/andhra/representatives';
const OUT = 'data/representatives.json';
const STATE = 'ANDHRA PRADESH';

if (!existsSync(SRC)) {
  console.error(`source not found: ${SRC}`);
  process.exit(1);
}

const rows = [];
for (const file of readdirSync(SRC).filter((f) => f.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(join(SRC, file), 'utf8'));
  const c = r.constituency ?? {};
  const p = r.representative ?? {};
  if (!c.name || !p.name) continue;
  rows.push({
    state: STATE,
    number: c.number ?? null,
    name: c.name,
    district: c.district ?? null,
    reserved: c.reserved ?? null,
    member: p.name,
    party: p.current_party ?? p.elected_party ?? null,
    since: p.term_start ?? null,
    source: r.source?.myneta_url ?? null,
  });
}

rows.sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
writeFileSync(OUT, JSON.stringify({ sourceNote: 'Elected representatives as recorded by MyNeta/ECI.', rows }));
console.log(`wrote ${OUT}: ${rows.length} constituencies for ${STATE}`);

const blob = JSON.stringify(rows);
for (const banned of ['declared_cases', 'assets', 'liabilities', 'education', 'photo']) {
  if (blob.includes(banned)) { console.error(`REFUSING: ${banned} leaked into the projection`); process.exit(1); }
}
console.log('checked: no case, asset, education or photo data in the projection');
