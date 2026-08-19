// Builds the shared representatives dataset from the MyNeta crawl.
//
//   node scripts/build-representatives.mjs [--sync <dir>]
//
// Writes TWO artifacts, deliberately:
//
//   data/representatives-full.json   everything the affidavits carry —
//       every candidate, criminal cases, assets, liabilities, education,
//       age. This is the shared record, meant to be consumed by more than
//       one application.
//
//   data/representatives.json        the narrow projection this site
//       renders: who holds the seat, and where to check it. Nothing else.
//
// The split is the point. Storing the full affidavit is right — it is
// public interest data and other tools need it. Printing assets and
// criminal cases beside a school with no toilet is innuendo: the
// juxtaposition implies a causal link nothing supports, and the member
// elected in 2024 did not break a toilet that has been broken for a
// decade. Two files means the rendering code cannot reach for what it
// should not show, rather than being trusted not to.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// MyNeta slug -> what it actually is. Extend as states are crawled.
const ELECTIONS = {
  AndhraPradesh2024: { state: 'ANDHRA PRADESH', house: 'assembly', year: 2024 },
  LokSabha2024: { state: null, house: 'lok sabha', year: 2024 },
};

const syncIdx = process.argv.indexOf('--sync');
const SYNC_DIR = syncIdx > -1 ? process.argv[syncIdx + 1] : null;

// Detail-page results, keyed by candidate id. These OVERRIDE the summary
// table, which leaves assets and liabilities blank for a large minority —
// see scripts/fill-representative-gaps.mjs.
const detail = new Map();
for (const file of readdirSync('.data-src').filter((f) => /^reps-detail-.*\.ndjson$/.test(f))) {
  for (const line of readFileSync(join('.data-src', file), 'utf8').split('\n')) {
    if (!line) continue;
    const d = JSON.parse(line);
    detail.set(d.candidateId, d);
  }
}

const constituencies = [];
for (const file of readdirSync('.data-src')
  .filter((f) => /^reps-.*\.ndjson$/.test(f) && !/^reps-detail-/.test(f))) {
  const slug = file.replace(/^reps-|\.ndjson$/g, '');
  const meta = ELECTIONS[slug] ?? { state: null, house: 'assembly', year: null };
  for (const line of readFileSync(join('.data-src', file), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    for (const c of r.candidates) {
      const d = detail.get(c.candidateId);
      if (!d) continue;
      if (c.assets === null && d.assets !== null) c.assets = d.assets;
      if (c.liabilities === null && d.liabilities !== null) c.liabilities = d.liabilities;
      if (c.criminalCases === null && d.criminalCases !== null) c.criminalCases = d.criminalCases;
    }
    constituencies.push({
      election: slug, state: meta.state, house: meta.house, year: meta.year,
      constituencyId: r.constituencyId, name: r.constituency, district: r.district,
      winner: r.candidates.find((c) => c.winner) ?? null,
      candidates: r.candidates,
    });
  }
}
constituencies.sort((a, b) =>
  (a.election).localeCompare(b.election) || a.constituencyId - b.constituencyId);

const retrieved = new Date().toISOString().slice(0, 10);
const full = {
  note: 'Candidate affidavit summaries as published by MyNeta (ADR). Full record, for shared use.',
  source: 'https://www.myneta.info/', attribution: 'Association for Democratic Reforms (ADR) / MyNeta',
  retrieved,
  elections: Object.fromEntries(Object.entries(
    constituencies.reduce((acc, c) => { (acc[c.election] ??= []).push(c); return acc; }, {}))
    .map(([k, v]) => [k, { state: v[0].state, house: v[0].house, year: v[0].year, constituencies: v.length }])),
  constituencies,
};
writeFileSync('data/representatives-full.json', JSON.stringify(full));

// The projection. Only what a school page will ever print.
const rows = constituencies.filter((c) => c.winner).map((c) => ({
  state: c.state, house: c.house, name: c.name, district: c.district,
  member: c.winner.name, party: c.winner.party,
  since: c.year ? String(c.year) : null,
  source: `https://www.myneta.info/${c.election}/index.php?action=show_candidates&constituency_id=${c.constituencyId}`,
}));
writeFileSync('data/representatives.json', JSON.stringify({
  sourceNote: `Elected representatives as recorded by MyNeta/ADR, retrieved ${retrieved}.`, rows,
}));

// Checks for the KEY, not the substring: a member named "Nageswara"
// contains "age", and a guard that cries wolf gets deleted by the next
// person who hits it.
const keys = new Set(rows.flatMap((r) => Object.keys(r)));
for (const banned of ['criminalCases', 'assets', 'liabilities', 'education', 'age']) {
  if (keys.has(banned)) { console.error(`REFUSING: ${banned} leaked into the projection`); process.exit(1); }
}

const kb = (f) => (Buffer.byteLength(readFileSync(f)) / 1024).toFixed(0);
console.log(`data/representatives-full.json  ${constituencies.length} constituencies, ${kb('data/representatives-full.json')}KB`);
console.log(`data/representatives.json       ${rows.length} seats, ${kb('data/representatives.json')}KB (no cases, assets, education or age)`);

if (SYNC_DIR) {
  if (!existsSync(SYNC_DIR)) { console.error(`sync target missing: ${SYNC_DIR}`); process.exit(1); }
  const dest = join(SYNC_DIR, 'representatives-full.json');
  writeFileSync(dest, JSON.stringify(full));
  console.log(`synced full record -> ${dest}`);
}
