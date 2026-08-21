import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { binBreaks, binOf, renderChoropleth, renderLegend, stateKey, pathCentroid, placeLabels, BIN_MULTIPLES }
  from '../scripts/lib/choropleth.mjs';

const NATIONAL = 5.63; // the real national rate

describe('binBreaks', () => {
  it('cuts at multiples of the national rate, not at quantiles', () => {
    expect(binBreaks(10)).toEqual([5, 10, 20, 40]);
  });
  it('produces one fewer break than there are shades', () => {
    expect(binBreaks(NATIONAL)).toHaveLength(BIN_MULTIPLES.length);
  });
  it('returns null for a missing or nonsensical national rate', () => {
    expect(binBreaks(0)).toBeNull();
    expect(binBreaks(null)).toBeNull();
    expect(binBreaks(NaN)).toBeNull();
  });
});

describe('binOf', () => {
  const breaks = binBreaks(NATIONAL);

  it('puts the worst real state in the darkest shade', () => {
    expect(binOf(29.72, breaks)).toBe(4); // Meghalaya
  });
  it('puts the best real state in the lightest shade', () => {
    expect(binOf(0.07, breaks)).toBe(0); // West Bengal
  });
  it('puts a state at the national rate in the middle shade', () => {
    expect(binOf(5.63, breaks)).toBe(1);
    expect(binOf(5.7, breaks)).toBe(2);
  });
  it('is absolute: the same rate gets the same shade regardless of its neighbours', () => {
    // The guarantee quantile binning cannot make. Kerala's rate means the
    // same thing on a map of all India as it would on a map of the south.
    expect(binOf(3.0, breaks)).toBe(binOf(3.0, binBreaks(NATIONAL)));
  });
  it('never paints an unknown rate as if it were zero', () => {
    expect(binOf(null, breaks)).toBeNull();
    expect(binOf(undefined, breaks)).toBeNull();
    expect(binOf(NaN, breaks)).toBeNull();
  });
  it('returns null when there are no breaks to bin against', () => {
    expect(binOf(5, null)).toBeNull();
    expect(binOf(5, [])).toBeNull();
  });
});

describe('renderChoropleth', () => {
  const shapes = [
    { key: 'MEGHALAYA', label: 'Meghalaya', d: 'M0 0L1 0L1 1Z' },
    { key: 'KERALA', label: 'Kerala', d: 'M2 2L3 2L3 3Z' },
    { key: 'LAKSHADWEEP', label: 'Lakshadweep', d: 'M4 4L5 4L5 5Z' },
  ];
  const byKey = new Map([
    ['MEGHALAYA', { slug: 'meghalaya', rate: 29.72, label: 'Meghalaya — 29.7% of schools flagged' }],
    ['KERALA', { slug: 'kerala', rate: 0.4, label: 'Kerala — 0.4% of schools flagged' }],
  ]);
  const svg = renderChoropleth({
    shapes, byKey, nationalRate: NATIONAL,
    viewBox: '0 0 10 10', title: 'Share of schools flagged, by state',
  });

  it('links each state we have data for to its own page', () => {
    expect(svg).toContain('href="/state/meghalaya"');
    expect(svg).toContain('href="/state/kerala"');
  });
  it('shades by rate, so the worst state is darkest', () => {
    expect(svg).toMatch(/class="st b4" d="M0 0/);
    expect(svg).toMatch(/class="st b0" d="M2 2/);
  });
  it('marks a state with no data as no-data rather than shading it lightest', () => {
    // Painting an unmeasured state the same as a well-performing one would
    // be the map telling a lie the data does not support.
    expect(svg).toMatch(/class="st nodata" d="M4 4/);
    expect(svg).toContain('not in this release');
  });
  it('does not link a state that has no page to link to', () => {
    expect(svg).not.toContain('href="/state/lakshadweep"');
  });
  it('carries no figures on the map itself — the ledger is where numbers are read', () => {
    const body = svg.replace(/<title>[\s\S]*?<\/title>/g, '').replace(/aria-label="[^"]*"/g, '');
    expect(body).not.toMatch(/29\.7|0\.4%/);
  });
  it('names every state for screen readers and hover', () => {
    expect(svg).toContain('<title>Meghalaya — 29.7% of schools flagged</title>');
  });
  it('escapes a state label rather than injecting it raw', () => {
    const out = renderChoropleth({
      shapes: [{ key: 'X', label: 'X', d: 'M0 0L1 0L1 1Z' }],
      byKey: new Map([['X', { slug: 'x', rate: 1, label: '<script>alert(1)</script>' }]]),
      nationalRate: NATIONAL, viewBox: '0 0 1 1', title: 't',
    });
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });
});

describe('stateKey', () => {
  it('joins the two spellings of the same state that the two sources use', () => {
    expect(stateKey('JAMMU & KASHMIR')).toBe(stateKey('JAMMU AND KASHMIR'));
  });
  it('ignores case, spacing and punctuation', () => {
    expect(stateKey('Tamil Nadu')).toBe(stateKey('TAMILNADU'));
    expect(stateKey('DADRA & NAGAR HAVELI')).toBe('DADRAANDNAGARHAVELI');
  });
  it('handles a missing name without throwing', () => {
    expect(stateKey(null)).toBe('');
  });
});

describe('renderLegend', () => {
  it('shows one swatch per shade the map can use', () => {
    const legend = renderLegend();
    for (let i = 0; i <= 4; i++) expect(legend).toContain(`sw b${i}`);
  });
  it('labels direction without claiming a scale it does not have', () => {
    const legend = renderLegend();
    expect(legend).toContain('Fewer');
    expect(legend).toContain('More');
    // No numbers in the VISIBLE text: the swatches carry digits only in
    // their class names. A numeric legend would imply a linear scale the
    // five bins do not have.
    const visible = legend.replace(/<[^>]*>/g, '');
    expect(visible).not.toMatch(/\d/);
  });
});

describe('pathCentroid', () => {
  it('weights by area rather than taking a bounding-box centre', () => {
    // A bounding box centre for an L-shape sits outside the shape. For
    // Meghalaya it would put the label out over Bangladesh.
    const square = 'M0 0L10 0L10 10L0 10Z';
    const c = pathCentroid(square);
    expect(c[0]).toBeCloseTo(5, 1);
    expect(c[1]).toBeCloseTo(5, 1);
  });
  it('uses the largest ring, ignoring outlying islands', () => {
    const big = 'M0 0L10 0L10 10L0 10Z';
    const speck = 'M900 900L901 900L901 901L900 901Z';
    const c = pathCentroid(big + speck);
    expect(c[0]).toBeLessThan(50);
  });
  it('returns null for path data with no usable ring', () => {
    expect(pathCentroid('')).toBeNull();
    expect(pathCentroid('M0 0L1 1Z')).toBeNull();
  });
});

describe('no-data states are categorically different, not paler', () => {
  // Wide enough to hold their labels — a shape narrower than its own
  // name gets no label, which is its own test below.
  const shapes = [
    { key: 'A', label: 'Aaa', d: 'M0 0L60 0L60 40L0 40Z' },
    { key: 'B', label: 'Bbb', d: 'M200 200L260 200L260 240L200 240Z' },
  ];
  const svg = renderChoropleth({
    shapes, viewBox: '0 0 100 100', nationalRate: 5.63, title: 't', labelTop: 1,
    byKey: new Map([['A', { slug: 'a', rate: 29.7, label: 'Aaa — 1 in 3' }]]),
  });

  it('fills an unmeasured state with a hatch, not a tone', () => {
    // As a tone it measured 1.09:1 against the lightest bin, so "we have
    // no figures" and "almost none" looked identical.
    expect(svg).toContain('<pattern id="nodata"');
    expect(svg).toMatch(/class="st nodata"/);
  });

  it('labels only the worst, not every state', () => {
    expect((svg.match(/class="india-label"/g) ?? []).length).toBe(1);
    expect(svg).toContain('>Aaa<');
    expect(svg).not.toMatch(/india-label[^>]*>Bbb</);
  });

  it('gives every state a key the table can match', () => {
    expect(svg).toMatch(/<path class="st [^"]*" d="[^"]*" data-key="A"/);
  });
});

describe('label placement', () => {
  const wide = (x, y, w = 200) => `M${x} ${y}L${x + w} ${y}L${x + w} ${y + 60}L${x} ${y + 60}Z`;

  it('drops a label that would not fit inside the state it names', () => {
    // Tripura is 39 units across and its name needs about 56. Spilling
    // over reads as naming the neighbour it lands on.
    const out = placeLabels([{ label: 'Tripura', d: 'M0 0L39 0L39 57L0 57Z' }]);
    expect(out).toHaveLength(0);
  });

  it('drops a label that would collide with one already placed', () => {
    // The four worst states are all small and all in the north-east; they
    // piled their names into an unreadable heap.
    const out = placeLabels([
      { label: 'First', d: wide(0, 0) },
      { label: 'Second', d: wide(10, 10) },
    ]);
    expect(out.map((c) => c.label)).toEqual(['First']);
  });

  it('keeps both when they are genuinely apart', () => {
    const out = placeLabels([
      { label: 'First', d: wide(0, 0) },
      { label: 'Second', d: wide(0, 400) },
    ]);
    expect(out).toHaveLength(2);
  });

  it('places in the order given, so the worst state wins a contested spot', () => {
    const out = placeLabels([
      { label: 'Worst', d: wide(0, 0) },
      { label: 'Lesser', d: wide(5, 5) },
    ]);
    expect(out[0].label).toBe('Worst');
  });
});

describe('the ledger beside the map', () => {
  it('uses the short column heading in the narrow column, not just on phones', () => {
    // The panel is 340px wide at any window size, so "Schools with issues"
    // stacked three words deep on a desktop. The phone breakpoint was
    // testing the wrong thing.
    const css = readFileSync('public/browse.css', 'utf8');
    expect(css).toMatch(/\.atlas-table table\.stats th \.lg \{ display:none; \}/);
    expect(css).toMatch(/\.atlas-table table\.stats th \.sm \{ display:inline; \}/);
  });
});
