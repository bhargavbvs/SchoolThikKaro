import { describe, it, expect } from 'vitest';
import { fixPhotoPath } from '../src/submit/fixFlow.js';

describe('fixPhotoPath', () => {
  it('places fix photos under the fixes/ prefix so storage RLS can scope to it', () => {
    const p = fixPhotoPath('28133390196', 'abc-123');
    expect(p).toBe('fixes/28133390196/abc-123.jpg');
  });
});
