import { describe, it, expect } from 'vitest';
import { renderMethodologyHTML } from '../src/map/methodology.js';

const stats = { total: 1460759, noToilet: 39558, nonFunctional: 48324, matchRate: 0.9 };

describe('renderMethodologyHTML', () => {
  it('shows the official headline percentage it is challenging', () => {
    expect(renderMethodologyHTML(stats)).toContain('97.3');
  });
  it('states the combined problem count', () => {
    expect(renderMethodologyHTML(stats)).toContain('87,882');
  });
  it('discloses the coordinate match rate as a known limitation', () => {
    expect(renderMethodologyHTML(stats)).toMatch(/90(\.0)?%/);
  });
  it('names both data sources', () => {
    const html = renderMethodologyHTML(stats);
    expect(html).toMatch(/UDISE/);
    expect(html).toMatch(/2021/);
  });
});
