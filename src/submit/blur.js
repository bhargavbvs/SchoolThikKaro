// src/submit/blur.js
import { MAX_IMAGE_PX, MAX_IMAGE_BYTES } from '../config.js';

export function scaleToFit(w, h, maxPx) {
  const long = Math.max(w, h);
  if (long <= maxPx) return { width: w, height: h };
  const k = maxPx / long;
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

/** True if the JPEG carries an APP1/Exif segment. Used to assert we stripped it. */
export function hasExif(arrayBuffer) {
  const b = new Uint8Array(arrayBuffer);
  if (b[0] !== 0xff || b[1] !== 0xd8) return false;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return false;
    const marker = b[i + 1];
    const len = (b[i + 2] << 8) | b[i + 3];
    if (marker === 0xe1) {
      const tag = String.fromCharCode(...b.slice(i + 4, i + 8));
      if (tag === 'Exif') return true;
    }
    if (marker === 0xda) return false; // start of scan
    i += 2 + len;
  }
  return false;
}

const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5];

export function pickJpegQuality(sizeAt, maxBytes = MAX_IMAGE_BYTES) {
  for (const q of QUALITIES) if (sizeAt(q) <= maxBytes) return q;
  return QUALITIES[QUALITIES.length - 1];
}

/** Draws the source onto a fresh canvas at capped size. Re-encoding through a
 *  canvas is what strips EXIF: canvas pixel data carries no metadata. */
export function normaliseImage(source, maxPx = MAX_IMAGE_PX) {
  const sw = source.width, sh = source.height;
  const { width, height } = scaleToFit(sw, sh, maxPx);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  canvas.getContext('2d').drawImage(source, 0, 0, width, height);
  return { canvas, width, height };
}

/** Burns an irreversible pixelation over each region. Regions are
 *  {x, y, width, height} in canvas pixels. */
export function blurRegions(canvas, regions) {
  const ctx = canvas.getContext('2d');
  for (const r of regions) {
    const pad = Math.round(Math.max(r.width, r.height) * 0.25);
    const x = Math.max(0, Math.round(r.x - pad));
    const y = Math.max(0, Math.round(r.y - pad));
    const w = Math.min(canvas.width - x, Math.round(r.width + pad * 2));
    const h = Math.min(canvas.height - y, Math.round(r.height + pad * 2));
    if (w <= 0 || h <= 0) continue;
    const step = Math.max(4, Math.round(Math.max(w, h) / 8));
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.round(w / step));
    tmp.height = Math.max(1, Math.round(h / step));
    tmp.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, x, y, w, h);
  }
}

export async function toJpegBlob(canvas, quality = 0.8) {
  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}
