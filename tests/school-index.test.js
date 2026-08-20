import { describe, it, expect } from 'vitest';
import { indexWords, shardFor, shardsForName, matches, STOPWORDS, SHARD_LEN }
  from '../scripts/lib/school-index.mjs';
import { readFileSync } from 'node:fs';
import { renderIndexPage } from '../scripts/lib/render.mjs';

const tree = JSON.parse(readFileSync('data/aggregates.json', 'utf8'));
const geo = JSON.parse(readFileSync('data/india-states.json', 'utf8'));

describe('indexWords', () => {
  it('indexes the distinctive part, not the boilerplate', () => {
    // Sharding on the first letter puts every GOVT/PS/MPPS school in two
    // buckets. The name a person actually remembers is the village.
    // MPPS is boilerplate too — it prefixes thousands of Andhra schools.
    expect(indexWords('MPPS VEDURUPATTU RAJUPALEM'))
      .toEqual(['VEDURUPATTU', 'RAJUPALEM']);
    expect(indexWords('GOVT PRIMARY SCHOOL NONGRIM')).toEqual(['NONGRIM']);
  });

  it('keeps a school findable when its name is entirely generic', () => {
    // 49 schools are called nothing but some arrangement of these.
    // Unreachable is worse than crowded.
    expect(indexWords('GOVT PRIMARY SCHOOL')).toEqual(['GOVT', 'PRIMARY', 'SCHOOL']);
  });

  it('ignores fragments too short to search on', () => {
    expect(indexWords('ZP HS KA')).toEqual([]);
  });

  it('does not repeat a word that appears twice', () => {
    expect(indexWords('MYLLIEM MYLLIEM')).toEqual(['MYLLIEM']);
  });
});

describe('shardFor', () => {
  it('waits for enough letters to be worth a request', () => {
    expect(shardFor('ve')).toBeNull();
    expect(shardFor('ved')).toBe('VED');
  });
  it('ignores case and punctuation the reader types', () => {
    expect(shardFor("st. m")).toBe('STM');
  });
  it('returns null for nothing', () => {
    expect(shardFor('')).toBeNull();
    expect(shardFor(null)).toBeNull();
  });
});

describe('shardsForName', () => {
  it('files a school under every word it can be found by', () => {
    expect(shardsForName('MPPS VEDURUPATTU RAJUPALEM')).toEqual(['VED', 'RAJ']);
  });
  it('files it once per shard, not once per word', () => {
    // RAJUPALEM and RAJENDRA both key on RAJ.
    expect(shardsForName('RAJUPALEM RAJENDRA')).toEqual(['RAJ']);
  });
});

describe('matches', () => {
  it('finds a word in the middle of a name', () => {
    expect(matches('MPPS VEDURUPATTU RAJUPALEM', 'vedu')).toBe(true);
  });
  it('ignores punctuation on either side', () => {
    expect(matches("ST. MARY'S CONVENT", 'st marys')).toBe(true);
  });
  it('does not match something absent', () => {
    expect(matches('GOVT LP MYLLIEM', 'kerala')).toBe(false);
  });
});

describe('the shard vocabulary', () => {
  it('excludes only words that are genuinely generic', () => {
    for (const w of ['SCHOOL', 'GOVT', 'PRIMARY']) expect(STOPWORDS.has(w)).toBe(true);
    // A village name must never be treated as boilerplate.
    for (const w of ['MYLLIEM', 'NONGRIM', 'VEDURUPATTU']) expect(STOPWORDS.has(w)).toBe(false);
  });
  it('keys on three letters, which is where the size curve flattens', () => {
    // Two letters leaves a 677KB shard; four quadruples the file count
    // without shrinking the largest.
    expect(SHARD_LEN).toBe(3);
  });
});

describe('the finder on the page', () => {
  const html = renderIndexPage(tree, geo);

  it('ships the input hidden, so no-JS keeps the browse instead of a dead box', () => {
    expect(html).toMatch(/id="school-q"[^>]*hidden/);
    expect(html).toContain("q.hidden=false");
  });

  it('waits for three letters before fetching anything', () => {
    // One shard per three-letter key; fewer letters would mean guessing
    // which of 3,647 files to pull.
    expect(html).toContain('if(key.length<3)');
  });

  it('fetches one shard, never the whole index', () => {
    expect(html).toMatch(/'\/data\/si\/'\+key\+'\.json'/);
  });

  it('ignores a stale response when the reader has typed on', () => {
    // Shards return out of order; without this the results can flip back
    // to an earlier query's matches.
    expect(html).toContain('if(mine!==seq) return;');
  });

  it('sends a match straight to that school’s report form', () => {
    expect(html).toMatch(/\/app\/#\/report\/'\+esc\(r\[1\]\)/);
  });

  it('says plainly that only recorded schools are searchable', () => {
    // Seventeen in eighteen are not. A bare "no results" would read as
    // "your school does not exist".
    expect(html).toMatch(/Only schools already in the government record/);
    expect(html).toMatch(/report yours/);
  });

  it('escapes a school name into the results', () => {
    expect(html).toContain("esc(r[0])");
  });
});
