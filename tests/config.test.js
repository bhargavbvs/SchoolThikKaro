import { describe, it, expect } from 'vitest';
import * as cfg from '../src/config.js';

describe('config', () => {
  it('fixes the verification radius at 200m', () => {
    expect(cfg.VERIFIED_RADIUS_M).toBe(200);
  });
  it('fixes the source year string used in every attribution', () => {
    expect(cfg.SOURCE_YEAR).toBe('UDISE+ 2024-25');
  });
  it('caps uploaded image dimensions and bytes', () => {
    expect(cfg.MAX_IMAGE_PX).toBe(1600);
    expect(cfg.MAX_IMAGE_BYTES).toBe(3 * 1024 * 1024);
  });
});
