import { describe, it, expect, beforeEach, vi } from 'vitest';
import { closeFlow } from '../src/submit/close.js';

/** Minimal stand-ins for the two elements closeFlow touches. */
function setup({ mapDisplay } = {}) {
  const root = { hidden: false, innerHTML: '<p>form</p>' };
  const map = mapDisplay === undefined ? null : { style: { display: mapDisplay } };
  const nav = { href: '' };
  globalThis.document = { getElementById: (id) => (id === 'map' ? map : null) };
  globalThis.window = { location: nav };
  return { root, map, nav };
}

describe('closeFlow', () => {
  it('dismisses the flow', () => {
    const { root } = setup({ mapDisplay: '' });
    closeFlow(root);
    expect(root.hidden).toBe(true);
    expect(root.innerHTML).toBe('');
  });

  it('leaves the reader on the map when there is a map to return to', () => {
    const { root, nav } = setup({ mapDisplay: '' });
    closeFlow(root);
    expect(nav.href).toBe('');
  });

  it('goes back to the site when the route had hidden the map', () => {
    // This is the bug: /add hides #map, so emptying the container left a
    // blank white page with no way out and a URL that reloaded to the
    // same nothing.
    const { root, nav } = setup({ mapDisplay: 'none' });
    closeFlow(root);
    expect(nav.href).toBe('/');
  });

  it('restores the map it un-hides on the way out', () => {
    const { root, map } = setup({ mapDisplay: 'none' });
    closeFlow(root);
    expect(map.style.display).toBe('');
  });

  it('goes home when there is no map element at all', () => {
    const { root, nav } = setup({});
    closeFlow(root);
    expect(nav.href).toBe('/');
  });
});
