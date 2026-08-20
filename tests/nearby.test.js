import { describe, it, expect } from 'vitest';
import { distanceM, overpassQuery, fromOverpass, fromUdise, mergeCandidates }
  from '../src/submit/nearby.js';
import { renderCandidate, NOTHING_NEARBY, renderPickerHTML } from '../src/submit/picker.js';

describe('overpassQuery', () => {
  it('asks for ways as well as nodes', () => {
    // A school mapped as a building footprint is a way. Asking only for
    // nodes silently loses most of the urban ones.
    const q = overpassQuery(19.7167, 77.15);
    expect(q).toMatch(/node\(around:/);
    expect(q).toMatch(/way\(around:/);
  });
  it('returns centres, so a way has usable coordinates', () => {
    expect(overpassQuery(1, 2)).toMatch(/out center/);
  });
});

describe('fromOverpass', () => {
  // The real response shape: nodes carry lat/lon, ways carry a center.
  const json = { elements: [
    { type: 'node', id: 1, lat: 19.72, lon: 77.15, tags: { name: 'ZP School Santuk Pimpri' } },
    { type: 'way', id: 2, center: { lat: 19.7175, lon: 77.1505 }, tags: { name: 'Podar International School' } },
    { type: 'node', id: 3, lat: 19.7, lon: 77.1, tags: { amenity: 'school' } },
  ] };
  const out = fromOverpass(json, 19.7167, 77.15);

  it('reads a way through its centre, not only nodes', () => {
    expect(out.map((s) => s.name)).toContain('Podar International School');
  });
  it('drops an unnamed school, which no one could recognise or moderate', () => {
    expect(out).toHaveLength(2);
  });
  it('marks the source, because OSM is not the government record', () => {
    for (const s of out) expect(s.source).toBe('osm');
  });
  it('measures the distance from the reader', () => {
    expect(out[0].distanceM).toBeGreaterThanOrEqual(0);
    expect(out[0].distanceM).toBeLessThan(1000);
  });
});

describe('mergeCandidates', () => {
  const here = { lat: 19.7167, lng: 77.15 };
  const udise = fromUdise([{ udise: '27123', name: 'ZP School Santuk Pimpri',
    block: 'Hingoli', district: 'Hingoli', lat: 19.7168, lng: 77.1501 }], here.lat, here.lng);

  it('drops the OSM copy of a school we already hold', () => {
    const osm = fromOverpass({ elements: [
      { type: 'node', id: 9, lat: 19.7169, lon: 77.1502, tags: { name: 'ZP School Santuk Pimpri' } },
    ] }, here.lat, here.lng);
    const merged = mergeCandidates(udise, osm);
    expect(merged).toHaveLength(1);
    // The UDISE record wins: it carries the code and a page on this site.
    expect(merged[0].source).toBe('udise');
  });

  it('keeps a same-named school that is genuinely somewhere else', () => {
    const far = fromOverpass({ elements: [
      { type: 'node', id: 9, lat: 19.80, lon: 77.30, tags: { name: 'ZP School Santuk Pimpri' } },
    ] }, here.lat, here.lng);
    expect(mergeCandidates(udise, far)).toHaveLength(2);
  });

  it('keeps a different school at the same spot', () => {
    const other = fromOverpass({ elements: [
      { type: 'node', id: 9, lat: 19.7168, lon: 77.1501, tags: { name: 'Podar International School' } },
    ] }, here.lat, here.lng);
    expect(mergeCandidates(udise, other)).toHaveLength(2);
  });

  it('orders by how close the reader is standing', () => {
    const osm = fromOverpass({ elements: [
      { type: 'node', id: 9, lat: 19.7167, lon: 77.1500, tags: { name: 'Right here' } },
    ] }, here.lat, here.lng);
    expect(mergeCandidates(udise, osm)[0].name).toBe('Right here');
  });

  it('works with no government record nearby, which is the common case', () => {
    // Only about one school in eighteen is in our set at all.
    const osm = fromOverpass({ elements: [
      { type: 'node', id: 9, lat: 19.717, lon: 77.151, tags: { name: 'Some School' } },
    ] }, here.lat, here.lng);
    expect(mergeCandidates([], osm)).toHaveLength(1);
  });
});

describe('distanceM', () => {
  it('measures a known separation', () => {
    // Hingoli to Hyderabad is roughly 295km.
    expect(Math.round(distanceM(19.7167, 77.15, 17.385, 78.4867) / 1000)).toBeGreaterThan(280);
    expect(Math.round(distanceM(19.7167, 77.15, 17.385, 78.4867) / 1000)).toBeLessThan(310);
  });
  it('is zero for the same point', () => {
    expect(distanceM(19.7, 77.1, 19.7, 77.1)).toBe(0);
  });
});

describe('the picker copes with recognising nothing', () => {
  it('says so without reading as a failure', () => {
    // For most of India this is simply the truth: only about one school in
    // eighteen is in any list we can search. A reader must not conclude
    // their school does not count.
    expect(NOTHING_NEARBY).toMatch(/common/i);
    expect(NOTHING_NEARBY).toMatch(/still counts/i);
    expect(NOTHING_NEARBY).not.toMatch(/error|failed|sorry/i);
  });

  it('marks which candidates have a government record behind them', () => {
    const known = renderCandidate({ id: 'udise:1', name: 'ZP School', area: '', distanceM: 40, source: 'udise' });
    const found = renderCandidate({ id: 'osm:node/1', name: 'Some School', area: '', distanceM: 40, source: 'osm' });
    expect(known).toContain('In the government record');
    expect(found).toContain('Not in the government record');
  });

  it('warns when the reader is too far for the report to verify', () => {
    const far = renderCandidate({ id: 'osm:node/1', name: 'X', area: '', distanceM: 900, source: 'osm' });
    const near = renderCandidate({ id: 'osm:node/2', name: 'Y', area: '', distanceM: 100, source: 'osm' });
    expect(far).toMatch(/too far/i);
    expect(near).not.toMatch(/too far/i);
  });

  it('escapes a school name rather than injecting it', () => {
    const out = renderCandidate({ id: 'x', name: '<script>alert(1)</script>', area: '', distanceM: 1, source: 'osm' });
    expect(out).not.toContain('<script>');
  });
});

describe('the picker shares the form’s shell', () => {
  it('sits in the same centred card as the step form, not full-bleed', () => {
    // It was rendering into the bare #submit-root, so it ran the whole
    // width of the window while the form beside it sat in a 680px column.
    const html = renderPickerHTML();
    expect(html).toContain('class="sub-shell"');
    expect(html).toContain('class="sub-card"');
  });

  it('carries the same title and assurances, so the two screens read as one flow', () => {
    const html = renderPickerHTML();
    expect(html).toContain('Report a school');
    expect(html).toMatch(/Anonymous/);
    expect(html).toMatch(/No login/);
  });

  it('says why it wants a location before asking for one', () => {
    expect(renderPickerHTML()).toMatch(/use your location to list what is nearby/i);
  });
});
