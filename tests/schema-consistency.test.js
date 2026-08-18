import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPayload } from '../src/submit/api.js';

/** The submit-report Edge Function does `insert({ ...meta, image_path,
 *  ip_hash, review_status })` directly against the `reports` table with no
 *  column allowlist. If buildPayload() ever sends a key with no matching
 *  column, Postgres rejects the whole insert at request time — exactly what
 *  happened when faces_found was added to the payload without a matching
 *  ALTER TABLE. This test would have caught that before it shipped. */
function reportsColumns() {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  const match = sql.match(/create table if not exists reports \(([\s\S]*?)\n\);/);
  const body = match[1];
  return body.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''));
}

describe('reports table matches what the client actually sends', () => {
  it('has a column for every key buildPayload produces', () => {
    const columns = new Set(reportsColumns());
    const payload = buildPayload(
      { udise: '1', name: 'x' },
      { finding: 'locked', severity: 'usable', blurApplied: true, facesFound: 2,
        fix: { lat: 1, lng: 2, accuracyM: 3 }, tier: { tier: 'verified', distanceM: 4 } },
    );
    for (const key of Object.keys(payload)) {
      expect(columns.has(key), `reports table has no "${key}" column`).toBe(true);
    }
  });
});
