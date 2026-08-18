import { describe, it, expect } from 'vitest';
import { renderResultsHTML } from '../src/map/search.js';

describe('renderResultsHTML', () => {
  it('renders one row per result with its UDISE code', () => {
    const html = renderResultsHTML([
      { udise: '28133390196', name: 'ST.PETERS HS ANKP', district: 'ANAKAPALLI', state: 'ANDHRA PRADESH' },
    ]);
    expect(html).toContain('28133390196');
    expect(html).toContain('ST.PETERS HS ANKP');
  });
  it('shows an explicit empty state rather than blank markup', () => {
    expect(renderResultsHTML([])).toMatch(/no schools found/i);
  });
  it('escapes result names', () => {
    const html = renderResultsHTML([{ udise: '1', name: '<b>x</b>', district: 'd', state: 's' }]);
    expect(html).not.toContain('<b>');
  });
});
