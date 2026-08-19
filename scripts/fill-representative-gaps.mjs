// Fills in the assets and liabilities MyNeta's constituency tables omit.
//
//   node scripts/fill-representative-gaps.mjs AndhraPradesh2024 [--conc 3]
//
// The summary table leaves these blank for a substantial minority of
// candidates — 53 of Andhra's 175 winners, including Ongole's, whose own
// affidavit page carries the figure the table omits. Publishing from the
// table alone would report "nothing declared" for people who declared
// plenty, which is a worse error than having no figure at all.
//
// Only candidates with a gap are fetched, so the cost scales with the
// holes rather than with the state. Resumable, same as the main crawl.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseCandidateDetail } from './lib/myneta.mjs';

const SLUG = process.argv[2];
if (!SLUG) { console.error('usage: node scripts/fill-representative-gaps.mjs <MyNetaSlug>'); process.exit(1); }
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? Number(process.argv[i + 1]) : d; };
const CONC = arg('conc', 3);

const SRC = `.data-src/reps-${SLUG}.ndjson`;
const OUT = `.data-src/reps-detail-${SLUG}.ndjson`;
mkdirSync('.data-src', { recursive: true });

const done = new Set();
if (existsSync(OUT)) for (const l of readFileSync(OUT, 'utf8').split('\n')) {
  if (l) try { done.add(JSON.parse(l).candidateId); } catch { /* torn line */ }
}

const gaps = [];
for (const line of readFileSync(SRC, 'utf8').split('\n')) {
  if (!line) continue;
  const r = JSON.parse(line);
  for (const c of r.candidates) {
    if (c.candidateId && !done.has(c.candidateId)
      && (c.assets === null || c.liabilities === null)) gaps.push(c.candidateId);
  }
}
console.log(`${SLUG}: ${gaps.length} candidates missing assets or liabilities, ${done.size} already filled`);

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Accept: 'text/html',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let i = 0, ok = 0, miss = 0;
async function worker() {
  while (i < gaps.length) {
    const id = gaps[i++];
    let html = null;
    for (let a = 0; a < 3 && !html; a++) {
      try {
        const res = await fetch(`https://www.myneta.info/${SLUG}/candidate.php?candidate_id=${id}`, { headers: HEADERS });
        if (res.status >= 500 || res.status === 429) { await sleep(4000 * (a + 1)); continue; }
        html = await res.text();
      } catch { await sleep(2000 * (a + 1)); }
    }
    if (!html) { miss++; continue; }
    const d = parseCandidateDetail(html);
    appendFileSync(OUT, JSON.stringify({ candidateId: id, ...d }) + '\n');
    ok++;
    if (ok % 50 === 0) console.log(`  ${ok}/${gaps.length}`);
    await sleep(300);
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
console.log(`done: ${ok} filled, ${miss} unreachable`);
