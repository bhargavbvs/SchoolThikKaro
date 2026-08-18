import { readFileSync, existsSync } from 'node:fs';

if (!existsSync('public/data/index.json')) {
  console.log('no built data yet — skipping validation');
  process.exit(0);
}
const index = JSON.parse(readFileSync('public/data/index.json', 'utf8'));
let errors = 0;
for (const st of index.states) {
  const gj = JSON.parse(readFileSync(`public/data/${st.file}`, 'utf8'));
  for (const f of gj.features) {
    const p = f.properties;
    if (String(p.udise).length !== 11) { console.error(`bad udise length: ${p.udise}`); errors++; }
    if (!['no_girls_toilet', 'girls_toilet_nonfunctional'].includes(p.indicator)) {
      console.error(`bad indicator: ${p.indicator}`); errors++;
    }
    const [lng, lat] = f.geometry.coordinates;
    if (!(lat >= 6 && lat <= 37.6 && lng >= 68 && lng <= 97.5)) {
      console.error(`coord outside India: ${p.udise} ${lat},${lng}`); errors++;
    }
  }
}
if (errors) { console.error(`VALIDATION FAILED: ${errors} errors`); process.exit(1); }
console.log(`validation passed: ${index.total.toLocaleString()} schools`);
