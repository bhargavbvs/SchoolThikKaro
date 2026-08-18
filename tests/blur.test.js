// tests/blur.test.js
import { describe, it, expect } from 'vitest';
import { hasExif, pickJpegQuality, scaleToFit } from '../src/submit/blur.js';

describe('scaleToFit', () => {
  it('shrinks the long edge to the cap and keeps aspect ratio', () => {
    expect(scaleToFit(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  });
  it('shrinks a portrait image by its height', () => {
    expect(scaleToFit(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it('never upscales a small image', () => {
    expect(scaleToFit(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });
});

describe('hasExif', () => {
  it('detects an APP1/Exif marker in a JPEG header', () => {
    // FFD8 SOI, FFE1 APP1, length, "Exif\0\0"
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0x00, 0x16,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    ]);
    expect(hasExif(bytes.buffer)).toBe(true);
  });
  it('returns false for a JPEG with no APP1 segment', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00]);
    expect(hasExif(bytes.buffer)).toBe(false);
  });
});

describe('pickJpegQuality', () => {
  it('steps quality down until the encoded size fits the byte cap', () => {
    const sizes = { 0.9: 5_000_000, 0.8: 4_000_000, 0.7: 2_000_000 };
    expect(pickJpegQuality((q) => sizes[q], 3_145_728)).toBe(0.7);
  });
  it('returns the lowest quality when nothing fits, rather than throwing', () => {
    expect(pickJpegQuality(() => 9_000_000, 3_145_728)).toBe(0.5);
  });
});
