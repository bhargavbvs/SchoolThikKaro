import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { kysGet, parseTotals, alreadyDone, YEAR_ID } from './lib/kys.mjs';
import { dedupeDistricts } from './lib/normalise.mjs';

const NDJSON = '.data-src/india_girls_toilet.ndjson';
const OUT = '.data-src/region-totals.ndjson';
const DELAY = 400;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync('.data-src', { recursive: true });

const districts = dedupeDistricts(
  readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));

const done = alreadyDone(
  existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter(Boolean) : []);
console.log(`districts: ${districts.length}, region ids already done: ${done.size}`);

const write = (row) => appendFileSync(OUT, JSON.stringify(row) + '\n');

let n = 0;
for (const d of districts) {
  const ctx = { state: d._stateName, district: d._districtName };

  if (!done.has(d._districtId)) {
    const t = parseTotals(await kysGet(
      `schools-girls-toilet-facility-count-by-region-id?yearId=${YEAR_ID}&regionId=${d._districtId}`));
    if (t) write({ level: 'district', regionId: d._districtId, ...ctx, ...t });
    await sleep(DELAY);
  }

  // Block ids are not in the existing crawl output, so fetch the block list
  // for this district before its per-block totals.
  const blocks = (await kysGet(`blocks?districtId=${d._districtId}&yearId=${YEAR_ID}`))?.data ?? [];
  await sleep(DELAY);

  for (const b of blocks) {
    if (done.has(b.blockId)) continue;
    const t = parseTotals(await kysGet(
      `schools-girls-toilet-facility-count-by-region-id?yearId=${YEAR_ID}&regionId=${b.blockId}`));
    if (t) write({ level: 'block', regionId: b.blockId, ...ctx, block: b.blockName, ...t });
    await sleep(DELAY);
  }

  if (++n % 25 === 0) console.log(`[${n}/${districts.length}] ${ctx.state} ${ctx.district}`);
}
console.log('DONE');
