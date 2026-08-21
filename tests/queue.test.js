import { readFileSync } from 'node:fs';
// tests/queue.test.js
import { describe, it, expect } from 'vitest';
import { normaliseRow, renderQueueHTML, summarise } from '../src/admin/queue.js';

// Rows reach the renderer normalised — admin.js does it on fetch, because
// the two queues carry different identity fields.
const rows = [
  { id: 'r1', school_name_snapshot: 'GHS One', tier: 'verified',
    distance_m: 42, finding: 'locked', created_at: '2026-08-17T10:00:00Z',
    image_path: 'a/b.jpg', blur_applied: true },
  { id: 'r2', school_name_snapshot: 'GHS Two', tier: 'unverified',
    distance_m: null, finding: 'no_water', created_at: '2026-08-17T11:00:00Z',
    image_path: 'c/d.jpg', blur_applied: false },
].map((r) => normaliseRow(r, 'reports'));

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
    expect(summarise(rows)).toEqual({
      total: 2, verified: 1, unverified: 1, unblurred: 1, unlisted: 0,
    });
  });
});

describe('the queue shows both kinds of submission', () => {
  const report = normaliseRow({
    id: 'r1', school_name_snapshot: 'GOVT LP MYLLIEM', udise_code: '17040300201',
    category: 'girls_toilet', finding: 'absent', tier: 'verified', distance_m: 40,
    blur_applied: true, image_path: 'x.jpg', created_at: '2026-08-19T10:00:00Z',
  }, 'reports');

  const submission = normaliseRow({
    id: 's1', submitted_name: 'Govt UPS Nongrim', submitted_area: 'Nongrim Hills',
    submitted_district: 'East Khasi Hills', category: 'drinking_water', finding: 'absent',
    tier: 'unverified', blur_applied: true, image_path: 'y.jpg',
    note: 'The handpump has been dry since June.', created_at: '2026-08-19T11:00:00Z',
  }, 'school_submissions');

  it('titles a listed school from the government record', () => {
    expect(report.title).toBe('GOVT LP MYLLIEM');
    expect(report.where).toContain('17040300201');
  });

  it('titles an unlisted school from what the citizen typed', () => {
    expect(submission.title).toBe('Govt UPS Nongrim');
    expect(submission.where).toBe('Nongrim Hills, East Khasi Hills');
  });

  it('remembers which table each row came from', () => {
    // Approving an unlisted submission against `reports` would silently
    // do nothing at all.
    expect(report._table).toBe('reports');
    expect(submission._table).toBe('school_submissions');
  });

  it('carries the table into the card, where the click handler reads it', () => {
    const html = renderQueueHTML([submission]);
    expect(html).toContain('data-table="school_submissions"');
  });

  it('marks an unlisted school so a moderator is never misled about its status', () => {
    const html = renderQueueHTML([submission]);
    expect(html).toMatch(/Not in the government record/);
    expect(renderQueueHTML([report])).not.toMatch(/Not in the government record/);
  });

  it('shows the category, now that a report can be about more than a toilet', () => {
    expect(renderQueueHTML([submission])).toContain('drinking_water');
  });

  it('shows the free-text note, which is often the only real detail', () => {
    expect(renderQueueHTML([submission])).toContain('handpump has been dry');
  });

  it('counts unlisted submissions separately in the summary', () => {
    const s = summarise([report, submission]);
    expect(s.total).toBe(2);
    expect(s.unlisted).toBe(1);
  });

  it('never invents a name for a nameless submission', () => {
    const bare = normaliseRow({ id: 'x', submitted_name: '' }, 'school_submissions');
    expect(bare.title).toBe('Unnamed school');
  });
});

describe('photos are not public', () => {
  it('renders no src, because a public URL would 400 on a private bucket', () => {
    // The bucket used to be public: a report's photo was fetchable with no
    // key at all, from upload, before any moderator had seen it. And the
    // anon key in the page source listed every path, so the unguessable
    // filename protected nothing.
    const html = renderQueueHTML([normaliseRow(
      { id: 'r1', image_path: 'unlisted/abc.jpg', finding: 'absent', created_at: '2026-08-20T10:00:00Z' },
      'school_submissions')]);
    expect(html).toContain('data-path="unlisted/abc.jpg"');
    expect(html).not.toMatch(/<img[^>]*src="[^"]+"/);
    expect(html).not.toContain('/object/public/');
  });

  it('mints a short-lived signed URL with the moderator’s own session', () => {
    const src = readFileSync('src/admin/queue.js', 'utf8');
    expect(src).toMatch(/\/storage\/v1\/object\/sign\/shaala-photos\//);
    expect(src).toMatch(/expiresIn: 3600/);
    // Signed with the caller's token, so a revoked moderator loses access.
    expect(src).toMatch(/Authorization: `Bearer \$\{token\}`/);
  });
});

describe('a moderator can see what they already decided', () => {
  const src = readFileSync('src/admin/admin.js', 'utf8');

  it('offers pending, approved and rejected', () => {
    // Approving something removed it from the only view there was, so a
    // published report could not be checked or taken down again.
    for (const s of ['pending', 'approved', 'rejected']) {
      expect(src).toContain(`data-status="${s}"`);
    }
  });

  it('queries the chosen status rather than hardcoding pending', () => {
    expect(src).toMatch(/review_status=eq\.\$\{status\}/);
  });

  it('shows the newest first once something has been decided', () => {
    // A pending list is a queue, oldest first. A decided list is a log.
    expect(src).toMatch(/status === 'pending' \? 'created_at\.asc' : 'created_at\.desc'/);
  });

  it('lets an approved report be taken down again', () => {
    const q = readFileSync('src/admin/queue.js', 'utf8');
    expect(q).toContain('Take it down');
    expect(q).toContain('Publish after all');
  });

  it('says which list is empty, not just "empty"', () => {
    expect(renderQueueHTML([], 'approved')).toMatch(/Nothing approved yet/);
    expect(renderQueueHTML([], 'pending')).toMatch(/queue is empty/);
  });
});
