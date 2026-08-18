import { slugify, assertNoCollisions } from './slug.mjs';

/** Percentage, or null when there is no usable denominator. Returning null
 *  rather than 0 or Infinity keeps "we don't know" distinct from "zero". */
export function rate(flagged, denom) {
  if (!denom || !Number.isFinite(denom) || denom <= 0) return null;
  return (flagged / denom) * 100;
}

const blank = () => ({ flagged: 0, noToilet: 0, nonFunctional: 0 });

function tally(node, indicator) {
  node.flagged += 1;
  if (indicator === 'no_girls_toilet') node.noToilet += 1;
  else node.nonFunctional += 1;
}

const byRateDesc = (a, b) => (b.rate ?? -1) - (a.rate ?? -1);

export function buildTree(schools, totals) {
  const denom = new Map();
  for (const t of totals) {
    const key = t.level === 'district'
      ? `${t.state}|${t.district}`
      : `${t.state}|${t.district}|${t.block}`;
    denom.set(key, t.girlsCoed);
  }

  const states = new Map();
  for (const s of schools) {
    if (!states.has(s.state)) states.set(s.state, { name: s.state, ...blank(), districts: new Map() });
    const st = states.get(s.state);
    tally(st, s.indicator);

    if (!st.districts.has(s.district)) {
      st.districts.set(s.district, { name: s.district, ...blank(), blocks: new Map() });
    }
    const dt = st.districts.get(s.district);
    tally(dt, s.indicator);

    const bname = s.block ?? 'UNKNOWN';
    if (!dt.blocks.has(bname)) dt.blocks.set(bname, { name: bname, ...blank(), schools: [] });
    const bl = dt.blocks.get(bname);
    tally(bl, s.indicator);
    bl.schools.push({ udise: s.udise, name: s.name, indicator: s.indicator });
  }

  assertNoCollisions([...states.keys()], 'state');

  const outStates = [...states.values()].map((st) => {
    assertNoCollisions([...st.districts.keys()], `district in ${st.name}`);
    const districts = [...st.districts.values()].map((dt) => {
      assertNoCollisions([...dt.blocks.keys()], `block in ${dt.name}`);
      const blocks = [...dt.blocks.values()].map((bl) => ({
        slug: slugify(bl.name), name: bl.name,
        flagged: bl.flagged, noToilet: bl.noToilet, nonFunctional: bl.nonFunctional,
        total: denom.get(`${st.name}|${dt.name}|${bl.name}`) ?? null,
        rate: rate(bl.flagged, denom.get(`${st.name}|${dt.name}|${bl.name}`)),
        schools: bl.schools.sort((a, b) => a.name.localeCompare(b.name)),
      })).sort(byRateDesc);

      const dTotal = denom.get(`${st.name}|${dt.name}`) ?? null;
      return {
        slug: slugify(dt.name), name: dt.name,
        flagged: dt.flagged, noToilet: dt.noToilet, nonFunctional: dt.nonFunctional,
        total: dTotal, rate: rate(dt.flagged, dTotal), blocks,
      };
    }).sort(byRateDesc);

    const sTotal = districts.reduce((n, d) => n + (d.total ?? 0), 0) || null;
    return {
      slug: slugify(st.name), name: st.name,
      flagged: st.flagged, noToilet: st.noToilet, nonFunctional: st.nonFunctional,
      total: sTotal, rate: rate(st.flagged, sTotal), districts,
    };
  }).sort(byRateDesc);

  const national = {
    flagged: outStates.reduce((n, s) => n + s.flagged, 0),
    noToilet: outStates.reduce((n, s) => n + s.noToilet, 0),
    nonFunctional: outStates.reduce((n, s) => n + s.nonFunctional, 0),
    total: outStates.reduce((n, s) => n + (s.total ?? 0), 0) || null,
  };
  national.rate = rate(national.flagged, national.total);

  return { national, states: outStates };
}
