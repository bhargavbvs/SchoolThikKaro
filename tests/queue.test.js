// tests/queue.test.js
import { describe, it, expect } from 'vitest';
import { renderQueueHTML, summarise } from '../src/admin/queue.js';

const rows = [
  { id: 'r1', school_name_snapshot: 'GHS One', tier: 'verified',
    distance_m: 42, finding: 'locked', created_at: '2026-08-17T10:00:00Z',
    image_path: 'a/b.jpg', blur_applied: true },
  { id: 'r2', school_name_snapshot: 'GHS Two', tier: 'unverified',
    distance_m: null, finding: 'no_water', created_at: '2026-08-17T11:00:00Z',
    image_path: 'c/d.jpg', blur_applied: false },
];

describe('renderQueueHTML', () => {
  it('renders one card per pending report', () => {
    const html = renderQueueHTML(rows);
    expect(html).toContain('GHS One');
    expect(html).toContain('GHS Two');
  });
  it('shows the verified badge and the distance that earned it', () => {
    expect(renderQueueHTML(rows)).toMatch(/Verified on-site/);
    expect(renderQueueHTML(rows)).toContain('42');
  });
  it('flags a report whose photo was never blurred', () => {
    expect(renderQueueHTML(rows)).toMatch(/not blurred/i);
  });
  it('shows an explicit empty state', () => {
    expect(renderQueueHTML([])).toMatch(/queue is empty/i);
  });
});

describe('summarise', () => {
  it('counts pending by tier', () => {
    expect(summarise(rows)).toEqual({ total: 2, verified: 1, unverified: 1, unblurred: 1 });
  });
});
