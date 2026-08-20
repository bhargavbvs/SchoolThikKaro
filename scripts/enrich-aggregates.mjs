// Folds the per-school crawl into the aggregate tree.
//
//   node scripts/enrich-aggregates.mjs
//
// Reads .data-src/school-detail.ndjson (the raw crawl, gitignored, with
// personal fields) and writes data/aggregates.json enriched with what each
// school's own record shows — and nothing that names a person.
//
// Every judgement about what counts as a problem lives in
// lib/school-detail.mjs, so this script only joins and counts.

import { readFileSync, writeFileSync, createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { deriveIssues, teacherCount, ISSUE_LABELS } from './lib/school-detail.mjs';
import { PERSONAL_FIELDS } from './lib/school-detail.mjs';

const tree = JSON.parse(readFileSync('data/aggregates.json', 'utf8'));

// 314MB of NDJSON: streamed, because parsing it whole needs more heap than
// a default Node run is given.
const detail = new Map();
const rl = createInterface({ input: createReadStream('.data-src/school-detail.ndjson'), crlfDelay: Infinity });
let read = 0;
for await (const line of rl) {
  if (!line) continue;
  let r;
  try { r = JSON.parse(line); } catch { continue; }
  const { issues } = deriveIssues(r.facility, r.teachers);
  detail.set(r.udise, {
    issues,
    teachers: teacherCount(r.teachers),
    students: r.teachers?.totalCount ?? null,
    // The constituency is what makes "who answers for this" possible.
    constituency: r.card?.assemblyCdDesc ?? null,
  });
  if (++read % 20000 === 0) console.log(`  read ${read.toLocaleString()}`);
}
console.log(`joined detail for ${detail.size.toLocaleString()} schools`);

const blank = () => Object.fromEntries(Object.keys(ISSUE_LABELS).map((k) => [k, 0]));
const addInto = (target, issues) => { for (const k of issues) target[k] = (target[k] ?? 0) + 1; };

let matched = 0, unmatched = 0;
const national = blank();
for (const state of tree.states) {
  const sCounts = blank();
  for (const district of state.districts) {
    const dCounts = blank();
    for (const block of district.blocks) {
      const bCounts = blank();
      for (const school of block.schools) {
        const d = detail.get(school.udise);
        if (!d) { unmatched++; continue; }
        matched++;
        if (d.issues.length) school.issues = d.issues;
        if (d.teachers !== null) school.teachers = d.teachers;
        if (d.students !== null) school.students = d.students;
        if (d.constituency) school.constituency = d.constituency;
        addInto(bCounts, d.issues);
        addInto(dCounts, d.issues);
        addInto(sCounts, d.issues);
        addInto(national, d.issues);
      }
      block.issueCounts = strip(bCounts);
    }
    district.issueCounts = strip(dCounts);
  }
  state.issueCounts = strip(sCounts);
}
tree.national.issueCounts = strip(national);

/** Drops zero counts: a block with no library problem should not carry a
 *  key saying so, and 6,161 pages of zeroes is a megabyte of nothing. */
function strip(counts) {
  return Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0));
}

const out = JSON.stringify(tree);
for (const field of PERSONAL_FIELDS) {
  if (out.includes(field)) { console.error(`REFUSING: ${field} reached the aggregate tree`); process.exit(1); }
}
writeFileSync('data/aggregates.json', out);

console.log(`matched ${matched.toLocaleString()} schools, ${unmatched.toLocaleString()} without detail`);
console.log('national issue counts:');
for (const [k, v] of Object.entries(tree.national.issueCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(6)}  ${ISSUE_LABELS[k]}`);
}
console.log(`aggregates.json now ${(Buffer.byteLength(out) / 1e6).toFixed(1)}MB`);
