const fmt = (n) => n.toLocaleString('en-IN');

export function renderMethodologyHTML(stats) {
  const have = stats.total - stats.noToilet;
  const pct = ((have / stats.total) * 100).toFixed(1);
  const problem = stats.noToilet + stats.nonFunctional;
  return `
    <h1>How this map works</h1>

    <h2>The number we are testing</h2>
    <p>UDISE+ 2024-25 reports that <strong>${pct}%</strong> of India’s
       ${fmt(stats.total)} girls’ and co-educational schools have a
       girls’ toilet.</p>
    <p>That figure is
       (${fmt(stats.total)} − ${fmt(stats.noToilet)}) ÷ ${fmt(stats.total)}.
       It counts a toilet that does not work as a toilet.</p>
    <p>The same data also records <strong>${fmt(stats.nonFunctional)}</strong>
       schools whose girls’ toilet does not function. Counted honestly,
       <strong>${fmt(problem)}</strong> schools have a problem.</p>

    <h2>Where the data comes from</h2>
    <ul>
      <li><strong>Which schools are flagged:</strong> the UDISE+ Know Your
          School public API, 2024-25. This is the government’s own record
          of what each school reported about itself.</li>
      <li><strong>Where schools are on the map:</strong> an open 2021 dataset
          of school coordinates.</li>
    </ul>

    <h2>What we know is imperfect</h2>
    <ul>
      <li>School records are <em>self-reported</em>. We publish them as the
          school’s own claim, never as our finding.</li>
      <li>Coordinates are from 2021 while flags are from 2024-25.
          <strong>${(stats.matchRate * 100).toFixed(1)}%</strong> of flagged
          schools could be matched to a location; the rest are not on the map.</li>
      <li>Some schools have already fixed the problem since reporting it.
          If that is your school, use the fix flow and we will update the pin.</li>
    </ul>

    <h2>What we do not do</h2>
    <p>We do not name individual staff. We do not publish photographs of
       children. We do not bypass any access control on government systems.</p>
  `;
}
