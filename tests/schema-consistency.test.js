import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPayload } from '../src/submit/api.js';

/** The submit-report Edge Function does `insert({ ...meta, image_path,
 *  ip_hash, review_status })` directly against the `reports` table with no
 *  column allowlist. If buildPayload() ever sends a key with no matching
 *  column, Postgres rejects the whole insert at request time — exactly what
 *  happened when faces_found was added to the payload without a matching
 *  ALTER TABLE. This test would have caught that before it shipped. */
function columnsOf(table) {
  const sql = readFileSync('supabase/schema.sql', 'utf8');
  const match = sql.match(
    new RegExp(`create table if not exists ${table} \\(([\\s\\S]*?)\\n\\);`));
  const body = match[1];
  return body.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''));
}

describe('reports table matches what the client actually sends', () => {
  it('has a column for every key buildPayload produces', () => {
    const columns = new Set(columnsOf('reports'));
    const payload = buildPayload(
      { udise: '1', name: 'x' },
      { category: 'girls_toilet', finding: 'locked', severity: 'usable', blurApplied: true, facesFound: 2,
        fix: { lat: 1, lng: 2, accuracyM: 3 }, tier: { tier: 'verified', distanceM: 4 } },
    );
    for (const key of Object.keys(payload)) {
      expect(columns.has(key), `reports table has no "${key}" column`).toBe(true);
    }
  });
});

describe('school_submissions matches what an unlisted-school report sends', () => {
  const payload = buildPayload(
    { kind: 'unlisted', name: 'Govt UPS Nongrim', area: 'Nongrim Hills',
      district: 'East Khasi Hills', state: '', udise: '' },
    { category: 'drinking_water', finding: 'absent', severity: 'absent', blurApplied: true, facesFound: 1,
      fix: { lat: 25.57, lng: 91.88, accuracyM: 6 } },
  );

  it('has a column for every key the payload produces, minus the routing flag', () => {
    // The Edge Function strips `kind` before inserting — it routes the row
    // to a table, it is not a column on either one.
    const columns = new Set(columnsOf('school_submissions'));
    for (const key of Object.keys(payload)) {
      if (key === 'kind') continue;
      expect(columns.has(key),
        `school_submissions has no "${key}" column`).toBe(true);
    }
  });

  it('sends no udise_code, because an unlisted school has none', () => {
    expect(payload.udise_code).toBeNull();
  });

  it('can never claim to be verified', () => {
    // There is no recorded location to check the reporter's fix against,
    // and the table's CHECK constraint refuses anything else.
    expect(payload.tier).toBe('unverified');
  });

  it('never carries the keys that belong to a report on a listed school', () => {
    // school_name_snapshot and distance_m are meaningless here; sending
    // either would be rejected by Postgres at request time.
    expect(payload).not.toHaveProperty('school_name_snapshot');
    expect(payload).not.toHaveProperty('distance_m');
  });

  it('keeps what the reporter typed, so a moderator can find the place', () => {
    expect(payload.submitted_name).toBe('Govt UPS Nongrim');
    expect(payload.submitted_area).toBe('Nongrim Hills');
  });
});
