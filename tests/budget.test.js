import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { assertBudget, stateCode } from '../scripts/lib/budget.mjs';

describe('assertBudget', () => {
  it('passes a file under budget', () => {
    mkdirSync('.tmp-test', { recursive: true });
    writeFileSync('.tmp-test/small.json', 'x'.repeat(100));
    expect(() => assertBudget('.tmp-test/small.json', 1000)).not.toThrow();
  });
  it('throws with the actual size when over budget', () => {
    mkdirSync('.tmp-test', { recursive: true });
    writeFileSync('.tmp-test/big.json', 'x'.repeat(2000));
    expect(() => assertBudget('.tmp-test/big.json', 1000)).toThrow(/2000/);
  });
});

describe('stateCode', () => {
  it('slugs a state name to a stable file-safe code', () => {
    expect(stateCode('ANDHRA PRADESH')).toBe('ANDHRA-PRADESH');
    expect(stateCode('JAMMU & KASHMIR')).toBe('JAMMU-KASHMIR');
  });
});
