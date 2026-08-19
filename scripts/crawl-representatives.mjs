// Collects every candidate's affidavit summary from MyNeta (ADR), one
// request per constituency.
//
//   node scripts/crawl-representatives.mjs AndhraPradesh2024 [--conc 3] [--max 400]
//
// A constituency page carries all candidates with party, criminal cases,
// education, age, assets and liabilities, and marks the winner — so a whole
// seat costs one page and the runners-up come free.
//
// Resumable: appends NDJSON, skips constituency ids already written.
//
// Deliberately slower than the school crawl. UDISE+ is government
// infrastructure sized for a nation; MyNeta is run by a small non-profit
// (ADR) as a public service, and there is no version of this worth
// degrading it for. Three at a time, and it still finishes a state in
// minutes.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseConstituencyPage, winnerOf } from './lib/myneta.mjs';

const SLUG = process.argv[2];
if (!SLUG) {
  console.error('usage: node scripts/crawl-representatives.mjs <MyNetaSlug> [--conc N] [--max N]');
  console.error('example slugs: AndhraPradesh2024, Bihar2020, LokSabha2024');
  process.exit(1);
}
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const CONC = arg('conc', 3);
const MAX = arg('max', 400);

const BASE = `https://www.myneta.info/${SLUG}`;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Accept: 'text/html',
};
const OUT = `.data-src/reps-${SLUG}.ndjson`;
mkdirSync('.data-src', { recursive: true });

const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line) continue;
    try { done.add(JSON.parse(line).constituencyId); } catch { /* torn line */ }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(id) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${BASE}/index.php?action=show_candidates&constituency_id=${id}`, { headers: HEADERS });
      if (res.status >= 500 || res.status === 429) { await sleep(4000 * (attempt + 1)); continue; }
      return await res.text();
    } catch { await sleep(2000 * (attempt + 1)); }
  }
  return null;
}

let id = 1, found = 0, empty = 0, i = 0;
const ids = Array.from({ length: MAX }, (_, n) => n + 1).filter((n) => !done.has(n));
console.log(`${SLUG}: ${done.size} constituencies already done, trying ids up to ${MAX} at concurrency ${CONC}`);

async function worker() {
  while (i < ids.length) {
    const cid = ids[i++];
    const html = await fetchPage(cid);
    if (!html) { empty++; continue; }
    const page = parseConstituencyPage(html);
    if (!page.constituency || !page.candidates.length) { empty++; continue; }
    const w = winnerOf(page);
    appendFileSync(OUT, JSON.stringify({
      election: SLUG, constituencyId: cid,
      constituency: page.constituency, district: page.district,
      winner: w ? w.name : null, winnerParty: w ? w.party : null,
      candidates: page.candidates,
    }) + '\n');
    found++;
    if (found % 25 === 0) console.log(`  ${found} constituencies, ${empty} empty ids`);
    // A courtesy pause per worker, on top of the low concurrency.
    await sleep(300);
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
console.log(`done: ${found} constituencies written to ${OUT} (${empty} ids with no page)`);
