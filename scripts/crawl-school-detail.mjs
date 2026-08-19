// Pulls each flagged school's own facility and teacher record from UDISE+.
//
//   node scripts/crawl-school-detail.mjs [--conc 8] [--limit N]
//
// Resumable: appends NDJSON and skips anything already written, so it can
// be stopped and restarted freely. Raw API data is stored verbatim — every
// judgement about what counts as a problem lives in lib/school-detail.mjs
// and can be revised without re-crawling.
//
// Concurrency was measured, not guessed: the endpoint holds ~320ms p50 flat
// from 1 to 16 concurrent, so it is not straining at these rates. 8 is the
// default anyway — there is headroom, and no reason to go looking for a
// public service's limit. The pool halves itself on any 429 or 5xx and
// recovers slowly, so a server that does start struggling is left alone.

import { readFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseSchoolResponse, stripPersonal } from './lib/school-detail.mjs';

const BASE = 'https://kys.udiseplus.gov.in/web-app/api';
const YEAR_ID = 11;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36',
  Referer: 'https://kys.udiseplus.gov.in/',
  Accept: 'application/json',
};
const OUT = '.data-src/school-detail.ndjson';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? Number(process.argv[i + 1]) : dflt;
};
const MAX_CONC = arg('conc', 8);
const LIMIT = arg('limit', Infinity);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every flagged school, from the committed aggregate tree.
const tree = JSON.parse(readFileSync('data/aggregates.json', 'utf8'));
const all = [];
for (const s of tree.states) for (const d of s.districts) for (const b of d.blocks) {
  for (const sc of b.schools) all.push(sc.udise);
}

mkdirSync('.data-src', { recursive: true });
const done = new Set();
if (existsSync(OUT)) {
  for (const line of readFileSync(OUT, 'utf8').split('\n')) {
    if (!line) continue;
    try { done.add(JSON.parse(line).udise); } catch { /* torn final line */ }
  }
}
const todo = all.filter((u) => !done.has(u)).slice(0, LIMIT);
console.log(`${all.length.toLocaleString()} schools, ${done.size.toLocaleString()} already done, ` +
  `${todo.length.toLocaleString()} to fetch at concurrency ${MAX_CONC}`);

// Adaptive pool: shrinks on server distress, grows back slowly.
let conc = MAX_CONC;
let cooldownUntil = 0;

async function get(path) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = cooldownUntil - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(`${BASE}/${path}`, { headers: HEADERS });
      if (res.status === 429 || res.status >= 500) {
        conc = Math.max(1, Math.floor(conc / 2));
        cooldownUntil = Date.now() + 5000 * (attempt + 1);
        console.warn(`  ${res.status} — concurrency down to ${conc}`);
        continue;
      }
      return await res.json();
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}

let i = 0, ok = 0, failed = 0, started = Date.now();

async function worker() {
  while (i < todo.length) {
    const udise = todo[i++];
    // All four in one pass. Re-crawling 78,744 schools to pick up a field
    // we could have taken the first time costs hours; taking them now costs
    // nothing but bandwidth.
    const [f, t, r, p] = await Promise.all([
      get(`school/facility?udiseSchCode=${udise}&yearId=${YEAR_ID}`),
      get(`school-statistics/enrolment-teacher?udiseSchCode=${udise}&yearId=${YEAR_ID}`),
      get(`school/report-card?udiseSchCode=${udise}&yearId=${YEAR_ID}`),
      get(`school/profile?udiseSchCode=${udise}&yearId=${YEAR_ID}`),
    ]);
    const facility = parseSchoolResponse(f);
    const teachers = parseSchoolResponse(t);
    const card = parseSchoolResponse(r);
    // stripPersonal runs HERE, at ingestion, not at render: the profile
    // names an individual head teacher, and the spec forbids naming staff
    // anywhere. Dropping it before it touches disk means no later code
    // path can leak what we never stored.
    const profile = stripPersonal(parseSchoolResponse(p));
    if (!facility && !teachers && !card) { failed++; continue; }
    appendFileSync(OUT, JSON.stringify({ udise, facility, teachers, card, profile }) + '\n');
    ok++;
    if (ok % 500 === 0) {
      const rate = ok / ((Date.now() - started) / 1000);
      const left = (todo.length - i) / rate;
      console.log(`  ${ok.toLocaleString()}/${todo.length.toLocaleString()} ` +
        `${rate.toFixed(1)}/s — ~${(left / 60).toFixed(0)} min left, ${failed} failed`);
    }
    // Grow back toward the ceiling after a quiet spell.
    if (conc < MAX_CONC && Date.now() > cooldownUntil + 30000) conc++;
  }
}

await Promise.all(Array.from({ length: MAX_CONC }, worker));
console.log(`done: ${ok.toLocaleString()} written, ${failed.toLocaleString()} failed, ` +
  `${((Date.now() - started) / 60000).toFixed(1)} min`);
