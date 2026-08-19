import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PERSONAL_FIELDS } from '../scripts/lib/school-detail.mjs';

/** The raw crawl deliberately keeps head teacher names and school contact
 *  details: UDISE+ publishes them, and they are useful for verifying and
 *  following up a report. The rule is that they are never PUBLISHED.
 *
 *  A rule that lives only in a reviewer's memory is not a rule. This walks
 *  the artifacts that actually ship and fails if a personal field reaches
 *  one, so the guarantee is enforced by the build. */
function filesUnder(dir, exts, out = [], budget = { n: 4000 }) {
  if (!existsSync(dir) || budget.n <= 0) return out;
  for (const name of readdirSync(dir)) {
    if (budget.n-- <= 0) break;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) filesUnder(p, exts, out, budget);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

describe('published artifacts carry no personal data', () => {
  it('names the fields it protects, so the list cannot silently empty', () => {
    expect(PERSONAL_FIELDS).toContain('headMasterName');
    expect(PERSONAL_FIELDS).toContain('respName');
    expect(PERSONAL_FIELDS.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps them out of the committed data directory', () => {
    for (const file of filesUnder('data', ['.json'])) {
      const text = readFileSync(file, 'utf8');
      for (const field of PERSONAL_FIELDS) {
        expect(text.includes(field), `${file} contains ${field}`).toBe(false);
      }
    }
  });

  it('keeps them out of every page that ships', () => {
    // dist/ only exists after a build; when it does, it is the last thing
    // between this data and the public.
    const pages = filesUnder('dist', ['.html', '.json', '.xml']);
    for (const file of pages) {
      const text = readFileSync(file, 'utf8');
      for (const field of PERSONAL_FIELDS) {
        expect(text.includes(field), `${file} contains ${field}`).toBe(false);
      }
    }
  });

  it('never commits the raw crawl, which does hold them', () => {
    const ignored = readFileSync('.gitignore', 'utf8');
    expect(ignored).toMatch(/^\.data-src\/?$/m);
  });
});
