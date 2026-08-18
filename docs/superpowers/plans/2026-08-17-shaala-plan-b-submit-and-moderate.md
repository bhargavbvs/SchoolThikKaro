# shaala Plan B — Submission + Moderation (AGENT B, can run ANYWHERE)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Let a citizen photograph a school safely and verifiably, and let a moderator approve it.

**Architecture:** Capture and blur happen entirely on-device; only a blurred, re-encoded image is ever uploaded. A Supabase Edge Function is the sole write path, so rate limiting is enforceable. Moderators authenticate by magic link and every decision is audited.

**Tech Stack:** Vanilla JS ES modules, `@mediapipe/tasks-vision` (face detection, WASM), Supabase Edge Functions (Deno), Vitest 3.

**Spec:** `docs/superpowers/specs/2026-08-17-shaala-design.md`

**MUST RUN AFTER:** Plan 0, Task 4 committed.

**This agent needs no large local data.** It builds against
`public/data/schools-SAMPLE.geojson` (3 real schools, created by Plan 0) and
the frozen `getSchool()` signature. It never blocks on Agent A.

## Global Constraints

- **The unblurred image must never leave the device.** Blur is burned into
  pixels on a canvas and the result re-encoded before any upload call.
- **Never fail open.** If face detection cannot load, block submission and
  require the manual blur brush. A submission with `blur_applied = false`
  must be impossible to create.
- Anonymity copy, verbatim: `Anonymous — we never record who you are. We do record where the photo was taken, to verify it.`
- Verification badge copy, verbatim: `Verified on-site`. Never "proven", never "confirmed".
- Capture guidance, verbatim: `Photograph the facility only. Do not photograph students.`
- Tier threshold `VERIFIED_RADIUS_M = 200` comes from `src/config.js`. Do not hardcode 200.
- Image caps from `src/config.js`: `MAX_IMAGE_PX = 1600`, `MAX_IMAGE_BYTES = 3145728`.
- Do not edit `index.html`, `src/main.js`, `src/config.js`, `src/lib/geo.js`, `src/lib/supabase.js`, `src/lib/schools.js`, or `supabase/schema.sql`.

---

### Task 1: Image normalisation and the blur invariant

The single most safety-critical module in the project. Build it first.

**Files:**
- Create: `src/submit/blur.js`
- Test: `tests/blur.test.js`

**Interfaces:**
- Produces: `normaliseImage(bitmapLike, maxPx): {canvas, width, height}`, `blurRegions(canvas, regions): void`, `toJpegBlob(canvas, quality): Promise<Blob>`, `hasExif(arrayBuffer): boolean`.

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/blur.test.js`
Expected: FAIL — cannot resolve `../src/submit/blur.js`

- [ ] **Step 3: Write minimal implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/blur.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add image normalisation, pixelation, and EXIF assertion"
```

---

### Task 2: Face detection with a fail-closed gate

**Files:**
- Create: `src/submit/faces.js`
- Test: `tests/faces.test.js`

**Interfaces:**
- Consumes: `blurRegions` from `src/submit/blur.js`.
- Produces: `loadDetector(): Promise<Detector|null>`, `detectFaces(detector, canvas): Promise<Array<{x,y,width,height}>>`, `blurGate(state): {canSubmit, reason}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/faces.test.js
import { describe, it, expect } from 'vitest';
import { blurGate } from '../src/submit/faces.js';

describe('blurGate', () => {
  it('allows submission when the detector ran and blur was applied', () => {
    expect(blurGate({ detectorLoaded: true, facesFound: 2, blurApplied: true }))
      .toEqual({ canSubmit: true, reason: null });
  });
  it('allows submission when the detector ran and found no faces', () => {
    expect(blurGate({ detectorLoaded: true, facesFound: 0, blurApplied: false }))
      .toEqual({ canSubmit: true, reason: null });
  });
  it('BLOCKS submission when faces were found but not blurred', () => {
    const g = blurGate({ detectorLoaded: true, facesFound: 1, blurApplied: false });
    expect(g.canSubmit).toBe(false);
    expect(g.reason).toMatch(/blur/i);
  });
  it('BLOCKS submission when the detector failed to load and nothing was blurred', () => {
    const g = blurGate({ detectorLoaded: false, facesFound: 0, blurApplied: false });
    expect(g.canSubmit).toBe(false);
    expect(g.reason).toMatch(/manually/i);
  });
  it('allows submission when the detector failed but the user blurred manually', () => {
    expect(blurGate({ detectorLoaded: false, facesFound: 0, blurApplied: true }))
      .toEqual({ canSubmit: true, reason: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/faces.test.js`
Expected: FAIL — cannot resolve `../src/submit/faces.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/faces.js

/** Fail-closed gate. This function is the spec's "never fail open" rule.
 *  If we could not verify the image is safe, submission is refused. */
export function blurGate({ detectorLoaded, facesFound, blurApplied }) {
  if (blurApplied) return { canSubmit: true, reason: null };
  if (!detectorLoaded) {
    return { canSubmit: false,
      reason: 'We could not check this photo for faces. Please blur any people manually before submitting.' };
  }
  if (facesFound > 0) {
    return { canSubmit: false,
      reason: 'Faces were detected. Apply blur before submitting.' };
  }
  return { canSubmit: true, reason: null };
}

let _detector = null;

export async function loadDetector() {
  if (_detector) return _detector;
  try {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm');
    _detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      },
      runningMode: 'IMAGE',
    });
    return _detector;
  } catch (err) {
    console.error('face detector failed to load', err);
    return null;
  }
}

export async function detectFaces(detector, canvas) {
  if (!detector) return [];
  const res = detector.detect(canvas);
  return (res?.detections ?? []).map((d) => ({
    x: d.boundingBox.originX,
    y: d.boundingBox.originY,
    width: d.boundingBox.width,
    height: d.boundingBox.height,
  }));
}
```

Add the dependency:
```bash
npm install @mediapipe/tasks-vision
```

**Note on the CDN URLs:** the spec forbids nothing here, but if the model
must be self-hosted, copy the `.wasm` and `.tflite` into `public/vendor/` and
point both paths at them. Record whichever you chose in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/faces.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add face detection with fail-closed blur gate"
```

---

### Task 3: GPS gating and tier computation

**Files:**
- Create: `src/submit/gps.js`
- Test: `tests/gps.test.js`

**Interfaces:**
- Consumes: `haversineMeters`, `isVerifiedDistance` from `src/lib/geo.js`.
- Produces: `computeTier({schoolLat, schoolLng, fixLat, fixLng, accuracyM, source}): {tier, distanceM, reason}`, `getFix(): Promise<{lat,lng,accuracyM}>`, `permissionHelpHTML(platform): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/gps.test.js
import { describe, it, expect } from 'vitest';
import { computeTier, permissionHelpHTML } from '../src/submit/gps.js';

const school = { schoolLat: 17.6903, schoolLng: 83.0418 };

describe('computeTier', () => {
  it('marks a camera capture within 200m as verified', () => {
    const r = computeTier({ ...school, fixLat: 17.6910, fixLng: 83.0418, accuracyM: 15, source: 'camera' });
    expect(r.tier).toBe('verified');
    expect(r.distanceM).toBeLessThan(200);
  });
  it('marks a camera capture beyond 200m as unverified', () => {
    const r = computeTier({ ...school, fixLat: 17.7100, fixLng: 83.0418, accuracyM: 15, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/too far/i);
  });
  it('marks a gallery upload as unverified even when the location matches', () => {
    const r = computeTier({ ...school, fixLat: 17.6903, fixLng: 83.0418, accuracyM: 5, source: 'gallery' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/gallery/i);
  });
  it('marks a capture with no location fix as unverified', () => {
    const r = computeTier({ ...school, fixLat: null, fixLng: null, accuracyM: null, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.distanceM).toBeNull();
  });
  it('refuses to verify when GPS accuracy is worse than the radius', () => {
    const r = computeTier({ ...school, fixLat: 17.6903, fixLng: 83.0418, accuracyM: 500, source: 'camera' });
    expect(r.tier).toBe('unverified');
    expect(r.reason).toMatch(/accurate/i);
  });
});

describe('permissionHelpHTML', () => {
  it('gives iOS-specific recovery steps', () => {
    expect(permissionHelpHTML('ios')).toMatch(/Settings/);
  });
  it('gives Android-specific recovery steps', () => {
    expect(permissionHelpHTML('android')).toMatch(/Permissions/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gps.test.js`
Expected: FAIL — cannot resolve `../src/submit/gps.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/gps.js
import { haversineMeters, isVerifiedDistance } from '../lib/geo.js';
import { VERIFIED_RADIUS_M } from '../config.js';

export function computeTier({ schoolLat, schoolLng, fixLat, fixLng, accuracyM, source }) {
  if (source !== 'camera') {
    return { tier: 'unverified', distanceM: null,
      reason: 'Uploaded from gallery — we cannot confirm where or when it was taken.' };
  }
  if (fixLat == null || fixLng == null) {
    return { tier: 'unverified', distanceM: null,
      reason: 'No location fix was available at capture.' };
  }
  if (typeof accuracyM === 'number' && accuracyM > VERIFIED_RADIUS_M) {
    return { tier: 'unverified', distanceM: null,
      reason: `Location was not accurate enough (±${Math.round(accuracyM)}m).` };
  }
  const distanceM = haversineMeters(schoolLat, schoolLng, fixLat, fixLng);
  if (!isVerifiedDistance(distanceM)) {
    return { tier: 'unverified', distanceM,
      reason: `You were too far from the school (${Math.round(distanceM)}m away).` };
  }
  return { tier: 'verified', distanceM, reason: null };
}

export function getFix(timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 });
  });
}

export function detectPlatform(ua = navigator.userAgent) {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function permissionHelpHTML(platform) {
  if (platform === 'ios') {
    return `<ol>
      <li>Open <strong>Settings</strong></li>
      <li>Scroll to your browser, tap it</li>
      <li>Tap <strong>Location</strong> and choose <strong>While Using the App</strong></li>
      <li>Return here and tap Try Again</li></ol>`;
  }
  if (platform === 'android') {
    return `<ol>
      <li>Tap the lock icon in the address bar</li>
      <li>Tap <strong>Permissions</strong></li>
      <li>Turn <strong>Location</strong> on</li>
      <li>Tap Try Again</li></ol>`;
  }
  return `<p>Open this page on your phone to report.</p>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gps.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add GPS fix, tier computation, and permission recovery help"
```

---

### Task 4: Desktop QR handoff

**Files:**
- Create: `src/submit/qr.js`
- Test: `tests/qr.test.js`

**Interfaces:**
- Produces: `handoffURL(school, origin): string`, `renderDesktopGateHTML(school, origin): string`.

- [ ] **Step 1: Write the failing test**

```js
// tests/qr.test.js
import { describe, it, expect } from 'vitest';
import { handoffURL, renderDesktopGateHTML } from '../src/submit/qr.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP' };

describe('handoffURL', () => {
  it('deep-links to the report route for this exact school', () => {
    expect(handoffURL(school, 'https://shaala.in'))
      .toBe('https://shaala.in/#/report/28133390196');
  });
});

describe('renderDesktopGateHTML', () => {
  it('explains that a phone camera is required', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toMatch(/phone camera/i);
  });
  it('states that desktop uploads are not allowed', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toMatch(/not allowed/i);
  });
  it('embeds the handoff URL so the QR encodes the right target', () => {
    expect(renderDesktopGateHTML(school, 'https://shaala.in'))
      .toContain('https://shaala.in/#/report/28133390196');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qr.test.js`
Expected: FAIL — cannot resolve `../src/submit/qr.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/qr.js

export function handoffURL(school, origin = window.location.origin) {
  return `${origin}/#/report/${school.udise}`;
}

/** Renders the QR as an <img> pointing at a self-contained data URL produced
 *  by the `qrcode` package at runtime. Import it lazily so the map bundle
 *  never pays for it. */
export function renderDesktopGateHTML(school, origin) {
  const url = handoffURL(school, origin);
  return `
    <div class="gate gate-camera">
      <h3>Phone camera required</h3>
      <p>We need a live photo from your phone's rear camera to verify this
         report. Desktop uploads are not allowed.</p>
      <img id="qr-img" alt="QR code to open this report on your phone" />
      <p class="qr-url">${url}</p>
    </div>`;
}

export async function paintQR(el, url) {
  const QR = (await import('qrcode')).default;
  const dataUrl = await QR.toDataURL(url, { margin: 1, width: 220 });
  el.querySelector('#qr-img').src = dataUrl;
}
```

Add the dependency:
```bash
npm install qrcode
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qr.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add desktop-to-phone QR handoff for camera capture"
```

---

### Task 5: The submission form

**Files:**
- Create: `src/submit/submit.js` (replaces the Plan 0 stub entirely)
- Create: `src/submit/style-submit.css` (replaces the Plan 0 placeholder)
- Test: `tests/submit.test.js`

**Interfaces:**
- Consumes: `getSchool` from `src/lib/schools.js`; `computeTier`, `detectPlatform` from `./gps.js`; `blurGate` from `./faces.js`; `renderDesktopGateHTML` from `./qr.js`.
- Produces: `openSubmitFlow(school)` — signature FROZEN by Plan 0, Agent A calls it. Also `renderFormHTML(school)`, `validateSubmission(state)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/submit.test.js
import { describe, it, expect } from 'vitest';
import { renderFormHTML, validateSubmission, FINDINGS } from '../src/submit/submit.js';

const school = {
  udise: '28133390196', name: 'ST.PETERS HS ANKP',
  district: 'ANAKAPALLI', state: 'ANDHRA PRADESH',
  indicator: 'girls_toilet_nonfunctional', sourceYear: 'UDISE+ 2024-25',
};

describe('renderFormHTML', () => {
  it('shows the school identity instead of asking for an address', () => {
    const html = renderFormHTML(school);
    expect(html).toContain('ST.PETERS HS ANKP');
    expect(html).not.toMatch(/landmark/i);
  });
  it('shows the government claim being tested, with its source year', () => {
    expect(renderFormHTML(school)).toContain('UDISE+ 2024-25');
  });
  it('carries the capture guidance verbatim', () => {
    expect(renderFormHTML(school))
      .toContain('Photograph the facility only. Do not photograph students.');
  });
  it('carries the precise anonymity copy, not a blanket claim', () => {
    const html = renderFormHTML(school);
    expect(html).toContain('We do record where the photo was taken, to verify it.');
    expect(html).not.toMatch(/all reports are anonymous/i);
  });
  it('offers "working fine" so the form can clear a school, not only accuse it', () => {
    expect(FINDINGS.map((f) => f.value)).toContain('working');
  });
});

describe('validateSubmission', () => {
  const ok = { finding: 'locked', severity: 'barely_usable', hasPhoto: true,
    gate: { canSubmit: true, reason: null } };

  it('accepts a complete submission', () => {
    expect(validateSubmission(ok)).toEqual({ valid: true, errors: [] });
  });
  it('requires a finding', () => {
    expect(validateSubmission({ ...ok, finding: null }).errors)
      .toContain('Choose what you found.');
  });
  it('requires a photo', () => {
    expect(validateSubmission({ ...ok, hasPhoto: false }).errors)
      .toContain('A photo is required.');
  });
  it('refuses when the blur gate is closed, surfacing its reason', () => {
    const r = validateSubmission({ ...ok, gate: { canSubmit: false, reason: 'Faces were detected. Apply blur before submitting.' } });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('Faces were detected. Apply blur before submitting.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/submit.test.js`
Expected: FAIL — cannot resolve `../src/submit/submit.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/submit.js
import { SOURCE_YEAR } from '../config.js';
import { detectPlatform } from './gps.js';
import { renderDesktopGateHTML, paintQR, handoffURL } from './qr.js';

export const FINDINGS = [
  { value: 'no_toilet', label: 'No toilet for girls at all' },
  { value: 'locked',    label: 'Toilet exists but locked' },
  { value: 'no_water',  label: 'Toilet exists, no water' },
  { value: 'unusable',  label: 'Toilet exists, unusable condition' },
  { value: 'working',   label: 'Toilet is working fine' },
];

export const SEVERITIES = [
  { value: 'usable',        label: 'Usable',        hint: 'Minor issues — students use it' },
  { value: 'barely_usable', label: 'Barely usable', hint: 'Students avoid it' },
  { value: 'unusable',      label: 'Unusable',      hint: 'No one can use it' },
  { value: 'absent',        label: 'Does not exist', hint: 'No structure at all' },
];

const INDICATOR_TEXT = {
  no_girls_toilet: 'No girls’ toilet',
  girls_toilet_nonfunctional: 'Girls’ toilet does not function',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderFormHTML(school) {
  return `
    <header class="sub-head">
      <h2>Report what you found</h2>
      <button id="sub-close" type="button" aria-label="Close">×</button>
    </header>

    <section class="sub-school">
      <p class="s-name">${esc(school.name)}</p>
      <p class="s-meta">${esc(school.district)}, ${esc(school.state)} · UDISE ${esc(school.udise)}</p>
      <p class="s-claim">Reported by this school to ${esc(SOURCE_YEAR)}:
        <strong>${esc(INDICATOR_TEXT[school.indicator] ?? 'Unknown')}</strong></p>
    </section>

    <fieldset class="sub-findings">
      <legend>What did you find? <span class="req">*</span></legend>
      ${FINDINGS.map((f) => `
        <label class="opt"><input type="radio" name="finding" value="${f.value}" />
          <span>${esc(f.label)}</span></label>`).join('')}
    </fieldset>

    <fieldset class="sub-severity">
      <legend>How bad is it?</legend>
      ${SEVERITIES.map((s) => `
        <label class="opt"><input type="radio" name="severity" value="${s.value}" />
          <span class="o-label">${esc(s.label)}</span>
          <span class="o-hint">${esc(s.hint)}</span></label>`).join('')}
    </fieldset>

    <section class="sub-photo">
      <h3>Photo <span class="req">*</span></h3>
      <p class="guidance">Photograph the facility only. Do not photograph students.</p>
      <div id="capture-slot"></div>
    </section>

    <div id="sub-errors" class="errors" hidden></div>
    <button id="sub-send" type="button" disabled>Submit report</button>
    <p class="anon">Anonymous — we never record who you are. We do record where the photo was taken, to verify it.</p>
  `;
}

export function validateSubmission({ finding, hasPhoto, gate }) {
  const errors = [];
  if (!finding) errors.push('Choose what you found.');
  if (!hasPhoto) errors.push('A photo is required.');
  if (gate && !gate.canSubmit) errors.push(gate.reason);
  return { valid: errors.length === 0, errors };
}

export async function openSubmitFlow(school) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderFormHTML(school);

  const slot = root.querySelector('#capture-slot');
  if (detectPlatform() === 'desktop') {
    slot.innerHTML = renderDesktopGateHTML(school, window.location.origin);
    await paintQR(slot, handoffURL(school, window.location.origin));
  } else {
    const { mountCapture } = await import('./camera.js');
    mountCapture(slot, school, root);
  }

  root.querySelector('#sub-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });
}
```

`src/submit/style-submit.css`:
```css
#submit-root { position:fixed; inset:0; z-index:20; overflow:auto;
  background:var(--bg); padding:16px; }
.sub-head { display:flex; justify-content:space-between; align-items:center; }
.sub-school { padding:12px; background:var(--panel-2); border-radius:8px; margin:12px 0; }
.s-meta, .s-claim { font-size:13px; color:var(--body); margin:4px 0 0; }
.opt { display:block; padding:12px; margin:6px 0; border:1px solid var(--line);
  border-radius:8px; cursor:pointer; }
.opt:has(input:checked) { border-color:var(--found); background:rgba(240,147,43,0.08); }
.o-hint { display:block; font-size:13px; color:var(--muted); }
.guidance { color:var(--found); font-size:14px; }
.gate { border:2px dashed var(--found); border-radius:10px; padding:16px; text-align:center; }
.errors { color:var(--admitted); margin:10px 0; }
.anon { font-size:12px; color:var(--muted); text-align:center; }
#sub-send { width:100%; padding:14px; border-radius:10px; border:0;
  background:var(--admitted); color:#fff; font-weight:600; }
#sub-send:disabled { opacity:.45; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/submit.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add submission form with capture guidance and precise anonymity copy"
```

---

### Task 6: Camera capture wired to blur and tier

**Depends on Task 7's `src/submit/api.js`.** If you are working strictly in
order, create a two-line placeholder first so this task's build resolves:
`export async function submitReport() { throw new Error('not implemented'); }`
Task 7 replaces it.

**Files:**
- Create: `src/submit/camera.js`

**Interfaces:**
- Consumes: `normaliseImage`, `blurRegions`, `toJpegBlob`, `pickJpegQuality` from `./blur.js`; `loadDetector`, `detectFaces`, `blurGate` from `./faces.js`; `getFix`, `computeTier`, `permissionHelpHTML`, `detectPlatform` from `./gps.js`; `validateSubmission` from `./submit.js`.
- Produces: `mountCapture(slotEl, school, rootEl): void`.

- [ ] **Step 1: Write the implementation**

```js
// src/submit/camera.js
import { normaliseImage, blurRegions, toJpegBlob } from './blur.js';
import { loadDetector, detectFaces, blurGate } from './faces.js';
import { getFix, computeTier, permissionHelpHTML, detectPlatform } from './gps.js';
import { validateSubmission } from './submit.js';
import { MAX_IMAGE_BYTES } from '../config.js';
import { submitReport } from './api.js';

export function mountCapture(slot, school, root) {
  const state = {
    canvas: null, blob: null, fix: null, tier: null,
    detectorLoaded: false, facesFound: 0, blurApplied: false,
  };

  slot.innerHTML = `
    <input id="cap" type="file" accept="image/*" capture="environment" hidden />
    <button id="cap-btn" type="button">Take photo</button>
    <div id="cap-preview"></div>
    <div id="gps-slot"></div>
    <details class="fallback">
      <summary>I can't use the camera right now</summary>
      <input id="gal" type="file" accept="image/*" hidden />
      <button id="gal-btn" type="button">Upload from gallery (unverified)</button>
      <p class="o-hint">Gallery photos are published but marked unverified and
         are not counted in public totals.</p>
    </details>`;

  const preview = slot.querySelector('#cap-preview');
  const gpsSlot = slot.querySelector('#gps-slot');
  const sendBtn = root.querySelector('#sub-send');
  const errBox = root.querySelector('#sub-errors');

  async function acquireFix() {
    try {
      state.fix = await getFix();
      gpsSlot.innerHTML = `<p class="ok">Location acquired (±${Math.round(state.fix.accuracyM)}m)</p>`;
    } catch {
      state.fix = null;
      gpsSlot.innerHTML = `
        <div class="gate gate-gps">
          <h3>Location access is off</h3>
          <p>We need your GPS to verify you are at this school. This is what
             makes a report verifiable.</p>
          <button id="gps-retry" type="button">Try Again</button>
          <details><summary>How to enable</summary>
            ${permissionHelpHTML(detectPlatform())}</details>
        </div>`;
      gpsSlot.querySelector('#gps-retry').addEventListener('click', acquireFix);
    }
    recompute();
  }

  async function handleFile(file, source) {
    const bitmap = await createImageBitmap(file);
    const { canvas } = normaliseImage(bitmap);
    state.canvas = canvas;
    state.blurApplied = false;

    const detector = await loadDetector();
    state.detectorLoaded = Boolean(detector);
    const faces = await detectFaces(detector, canvas);
    state.facesFound = faces.length;
    if (faces.length) { blurRegions(canvas, faces); state.blurApplied = true; }

    preview.innerHTML = '';
    canvas.style.maxWidth = '100%';
    preview.appendChild(canvas);
    if (!state.detectorLoaded) {
      preview.insertAdjacentHTML('beforeend',
        `<p class="warn">Automatic face check unavailable. Drag over any people
          in the photo to blur them before submitting.</p>`);
      enableManualBrush(canvas, state, recompute);
    }

    state.source = source;
    recompute();
  }

  function recompute() {
    const gate = blurGate(state);
    const finding = root.querySelector('input[name=finding]:checked')?.value ?? null;
    const t = computeTier({
      schoolLat: school.lat, schoolLng: school.lng,
      fixLat: state.fix?.lat ?? null, fixLng: state.fix?.lng ?? null,
      accuracyM: state.fix?.accuracyM ?? null, source: state.source ?? 'camera',
    });
    state.tier = t;
    const { valid, errors } = validateSubmission({
      finding, hasPhoto: Boolean(state.canvas), gate,
    });
    errBox.hidden = valid;
    errBox.innerHTML = errors.map((e) => `<p>${e}</p>`).join('');
    sendBtn.disabled = !valid;
  }

  root.addEventListener('change', (e) => {
    if (e.target.name === 'finding' || e.target.name === 'severity') recompute();
  });

  slot.querySelector('#cap-btn').addEventListener('click', () => slot.querySelector('#cap').click());
  slot.querySelector('#cap').addEventListener('change', (e) => handleFile(e.target.files[0], 'camera'));
  slot.querySelector('#gal-btn').addEventListener('click', () => slot.querySelector('#gal').click());
  slot.querySelector('#gal').addEventListener('change', (e) => handleFile(e.target.files[0], 'gallery'));

  sendBtn.addEventListener('click', async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = 'Submitting…';
    // Encode at successively lower quality until the result fits the byte cap.
    // Passing a constant here would defeat the whole point of the helper.
    state.blob = null;
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const candidate = await toJpegBlob(state.canvas, q);
      if (candidate.size <= MAX_IMAGE_BYTES) { state.blob = candidate; break; }
      state.blob = candidate;
    }
    await submitReport({ school, state, root });
    root.innerHTML = `<div class="done"><h2>Thank you</h2>
      <p>Your report is queued for review. It appears on the map once approved.</p></div>`;
  });

  acquireFix();
}

/** Lets the user paint irreversible blur when automatic detection is unavailable. */
function enableManualBrush(canvas, state, onChange) {
  let drawing = false;
  const paint = (ev) => {
    const r = canvas.getBoundingClientRect();
    const x = ((ev.clientX ?? ev.touches[0].clientX) - r.left) * (canvas.width / r.width);
    const y = ((ev.clientY ?? ev.touches[0].clientY) - r.top) * (canvas.height / r.height);
    const s = Math.round(canvas.width / 12);
    blurRegions(canvas, [{ x: x - s / 2, y: y - s / 2, width: s, height: s }]);
    state.blurApplied = true;
    onChange();
  };
  canvas.addEventListener('pointerdown', (e) => { drawing = true; paint(e); });
  canvas.addEventListener('pointermove', (e) => { if (drawing) paint(e); });
  window.addEventListener('pointerup', () => { drawing = false; });
}
```

- [ ] **Step 2: Manual verification on a phone**

Run `npm run dev`, open on a phone over the LAN, and confirm:
- Tapping "Take photo" opens the **rear** camera
- Denying location shows the recovery panel with correct OS steps
- A photo containing a face comes back visibly pixelated
- The submit button stays disabled until finding + photo + gate all pass

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: wire camera capture to blur, GPS tier, and validation"
```

---

### Task 7: The submit-report Edge Function (the only write path)

**Files:**
- Create: `supabase/functions/submit-report/index.ts`
- Create: `src/submit/api.js`
- Test: `tests/api.test.js`

**Interfaces:**
- Produces: `submitReport({school, state}): Promise<{id}>` from `src/submit/api.js`; `buildPayload(school, state)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/api.test.js
import { describe, it, expect } from 'vitest';
import { buildPayload } from '../src/submit/api.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP', lat: 17.69, lng: 83.04 };

describe('buildPayload', () => {
  const base = {
    finding: 'locked', severity: 'barely_usable', blurApplied: true,
    fix: { lat: 17.6901, lng: 83.0401, accuracyM: 12 },
    tier: { tier: 'verified', distanceM: 15 },
  };

  it('snapshots the school name so later renames cannot rewrite history', () => {
    expect(buildPayload(school, base).school_name_snapshot).toBe('ST.PETERS HS ANKP');
  });
  it('sends the computed tier and distance', () => {
    const p = buildPayload(school, base);
    expect(p.tier).toBe('verified');
    expect(p.distance_m).toBe(15);
  });
  it('always reports whether blur was applied', () => {
    expect(buildPayload(school, base).blur_applied).toBe(true);
  });
  it('sends the face count so the server can refuse an unblurred photo', () => {
    expect(buildPayload(school, { ...base, facesFound: 3 }).faces_found).toBe(3);
  });
  it('never sends a review_status — the server decides that', () => {
    expect(buildPayload(school, base).review_status).toBeUndefined();
  });
  it('omits coordinates entirely when there was no fix', () => {
    const p = buildPayload(school, { ...base, fix: null, tier: { tier: 'unverified', distanceM: null } });
    expect(p.lat).toBeNull();
    expect(p.distance_m).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api.test.js`
Expected: FAIL — cannot resolve `../src/submit/api.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/api.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export function buildPayload(school, state) {
  return {
    udise_code: school.udise,
    school_name_snapshot: school.name,
    finding: state.finding,
    severity: state.severity ?? null,
    tier: state.tier?.tier ?? 'unverified',
    lat: state.fix?.lat ?? null,
    lng: state.fix?.lng ?? null,
    distance_m: state.tier?.distanceM ?? null,
    gps_accuracy_m: state.fix?.accuracyM ?? null,
    captured_at: new Date().toISOString(),
    blur_applied: Boolean(state.blurApplied),
    // The Edge Function refuses an unblurred photo that had faces in it, so
    // this count must be sent or that server-side check can never fire.
    faces_found: state.facesFound ?? 0,
  };
}

export async function submitReport({ school, state }) {
  const form = new FormData();
  form.append('meta', JSON.stringify(buildPayload(school, state)));
  form.append('photo', state.blob, 'report.jpg');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-report`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: form,
  });
  if (!res.ok) throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  return res.json();
}
```

```ts
// supabase/functions/submit-report/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_BYTES = 3 * 1024 * 1024;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 10;

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function hashIp(ip: string): Promise<string> {
  const salt = Deno.env.get('IP_SALT') ?? '';
  const buf = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  const ipHash = await hashIp(ip);

  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count } = await admin.from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash).gte('created_at', since);
  if ((count ?? 0) >= MAX_PER_WINDOW) {
    return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
  }

  const form = await req.formData();
  const meta = JSON.parse(String(form.get('meta')));
  const photo = form.get('photo') as File | null;

  if (!photo) return new Response(JSON.stringify({ error: 'photo required' }), { status: 400 });
  if (photo.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: 'photo too large' }), { status: 413 });
  }
  if (photo.type !== 'image/jpeg') {
    return new Response(JSON.stringify({ error: 'jpeg only' }), { status: 415 });
  }
  // The client cannot be trusted to have blurred. A false value is refused
  // outright; a true value is still checked by a human before publication.
  if (meta.blur_applied !== true && (meta.faces_found ?? 0) > 0) {
    return new Response(JSON.stringify({ error: 'unblurred photo refused' }), { status: 400 });
  }

  const path = `${meta.udise_code}/${crypto.randomUUID()}.jpg`;
  const up = await admin.storage.from('shaala-photos')
    .upload(path, photo, { contentType: 'image/jpeg' });
  if (up.error) {
    return new Response(JSON.stringify({ error: up.error.message }), { status: 500 });
  }

  const { data, error } = await admin.from('reports').insert({
    ...meta, image_path: path, ip_hash: ipHash, review_status: 'pending',
  }).select('id').single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ id: data.id }), {
    status: 201, headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 4: Run test, then deploy and verify the rate limit**

Run: `npx vitest run tests/api.test.js`
Expected: PASS (6 tests)

Deploy: `npx supabase functions deploy submit-report`
Set secrets: `npx supabase secrets set IP_SALT=$(openssl rand -hex 16)`

Verify the rate limit actually trips — submit 11 times in a loop and confirm
the 11th returns HTTP 429. If it does not, the limit is not working; fix
before continuing.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add submit-report edge function as the sole write path"
```

---

### Task 8: Moderation console

**Files:**
- Create: `src/admin/admin.js` (replaces the Plan 0 stub), `src/admin/auth.js`, `src/admin/queue.js`
- Create: `src/admin/style-admin.css` (replaces placeholder)
- Test: `tests/queue.test.js`

**Interfaces:**
- Produces: `mountAdmin(el)` — signature FROZEN by Plan 0. Also `renderQueueHTML(reports)`, `decide(reportId, action, actorEmail)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/queue.test.js
import { describe, it, expect } from 'vitest';
import { renderQueueHTML, summarise } from '../src/admin/queue.js';

const rows = [
  { id: 'r1', school_name_snapshot: 'GHS One', tier: 'verified',
    distance_m: 42, finding: 'locked', created_at: '2026-08-17T10:00:00Z',
    image_path: 'a/b.jpg', blur_applied: true },
  { id: 'r2', school_name_snapshot: 'GHS Two', tier: 'unverified',
    distance_m: null, finding: 'no_water', created_at: '2026-08-17T11:00:00Z',
    image_path: 'c/d.jpg', blur_applied: false },
];

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
    expect(summarise(rows)).toEqual({ total: 2, verified: 1, unverified: 1, unblurred: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/queue.test.js`
Expected: FAIL — cannot resolve `../src/admin/queue.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/admin/queue.js
import { SUPABASE_URL } from '../config.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const photoURL = (p) => `${SUPABASE_URL}/storage/v1/object/public/shaala-photos/${p}`;

export function summarise(rows) {
  return {
    total: rows.length,
    verified: rows.filter((r) => r.tier === 'verified').length,
    unverified: rows.filter((r) => r.tier !== 'verified').length,
    unblurred: rows.filter((r) => !r.blur_applied).length,
  };
}

export function renderQueueHTML(rows) {
  if (!rows.length) return '<p class="empty">The queue is empty.</p>';
  return rows.map((r) => `
    <article class="card" data-id="${esc(r.id)}">
      <img src="${esc(photoURL(r.image_path))}" alt="submitted photo" loading="lazy" />
      <div class="card-body">
        <h3>${esc(r.school_name_snapshot)}</h3>
        <p class="badges">
          ${r.tier === 'verified'
            ? `<span class="b b-ok">Verified on-site</span> <span class="b">${Math.round(r.distance_m)}m</span>`
            : `<span class="b b-warn">Unverified</span>`}
          ${r.blur_applied ? '' : '<span class="b b-danger">Photo not blurred</span>'}
        </p>
        <p class="finding">${esc(r.finding)} · ${esc(new Date(r.created_at).toLocaleString())}</p>
        <div class="actions">
          <button data-act="approve">Approve</button>
          <button data-act="reject">Reject</button>
        </div>
      </div>
    </article>`).join('');
}
```

```js
// src/admin/auth.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export async function sendMagicLink(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, create_user: false }),
  });
  if (!res.ok) throw new Error('could not send link');
}

export function sessionToken() {
  const raw = localStorage.getItem('shaala.session');
  return raw ? JSON.parse(raw).access_token : null;
}

export function captureTokenFromHash() {
  const m = window.location.hash.match(/access_token=([^&]+)/);
  if (!m) return null;
  localStorage.setItem('shaala.session', JSON.stringify({ access_token: m[1] }));
  return m[1];
}
```

```js
// src/admin/admin.js
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';
import { renderQueueHTML, summarise } from './queue.js';
import { sendMagicLink, sessionToken, captureTokenFromHash } from './auth.js';

async function api(path, opts = {}) {
  const token = sessionToken();
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token ?? SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(opts.headers ?? {}),
    },
  });
}

export async function mountAdmin(el) {
  captureTokenFromHash();
  if (!sessionToken()) return renderLogin(el);

  el.innerHTML = '<h1>Moderation queue</h1><div id="stats"></div><div id="q">Loading…</div>';
  const res = await api('reports?review_status=eq.pending&select=*&order=created_at.asc');
  if (res.status === 401) return renderLogin(el, 'Session expired. Sign in again.');
  const rows = await res.json();

  const s = summarise(rows);
  el.querySelector('#stats').textContent =
    `${s.total} pending · ${s.verified} verified · ${s.unblurred} unblurred`;
  const q = el.querySelector('#q');
  q.innerHTML = renderQueueHTML(rows);

  q.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const card = btn.closest('.card');
    const id = card.dataset.id;
    const action = btn.dataset.act;
    btn.disabled = true;

    await api(`reports?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ review_status: action === 'approve' ? 'approved' : 'rejected' }),
    });
    await api('audit_log', {
      method: 'POST',
      body: JSON.stringify({
        actor_email: 'session', action, target_table: 'reports', target_id: id,
      }),
    });
    card.remove();
  });
}

function renderLogin(el, msg = '') {
  el.innerHTML = `
    <h1>Moderator sign in</h1>
    ${msg ? `<p class="warn">${msg}</p>` : ''}
    <input id="email" type="email" placeholder="you@example.org" />
    <button id="send" type="button">Send magic link</button>
    <p id="sent" hidden>Check your email.</p>`;
  el.querySelector('#send').addEventListener('click', async () => {
    await sendMagicLink(el.querySelector('#email').value);
    el.querySelector('#sent').hidden = false;
  });
}
```

`src/admin/style-admin.css`:
```css
#admin-root { padding:20px; max-width:900px; margin:0 auto; }
.card { display:flex; gap:14px; padding:12px; margin:10px 0;
  background:var(--panel); border:1px solid var(--line); border-radius:10px; }
.card img { width:140px; height:140px; object-fit:cover; border-radius:6px; }
.b { display:inline-block; padding:2px 8px; border-radius:99px; font-size:12px;
  background:var(--panel-2); }
.b-ok { background:rgba(42,157,143,.2); color:#2a9d8f; }
.b-warn { background:rgba(240,147,43,.2); color:#f0932b; }
.b-danger { background:rgba(224,71,62,.25); color:#e0473e; }
.actions button { margin-right:8px; padding:8px 14px; border-radius:8px; border:0; }
```

**Required RLS addition** — moderators need write access. Add to
`supabase/schema.sql` ONLY after coordinating with whoever owns Plan 0, since
that file is frozen:

```sql
drop policy if exists reports_moderator_update on reports;
create policy reports_moderator_update on reports for update to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active))
  with check (true);

drop policy if exists audit_insert_moderator on audit_log;
create policy audit_insert_moderator on audit_log for insert to authenticated
  with check (exists (select 1 from moderators m
                      where m.email = auth.jwt() ->> 'email' and m.active));

drop policy if exists reports_moderator_read_all on reports;
create policy reports_moderator_read_all on reports for select to authenticated
  using (exists (select 1 from moderators m
                 where m.email = auth.jwt() ->> 'email' and m.active));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/queue.test.js`
Expected: PASS (5 tests)

Then verify manually: insert your email into `moderators`, sign in, and
confirm a non-moderator email cannot read pending reports.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add moderation console with magic-link auth and audit log"
```

---

### Task 9: Fix and dispute flows

**Files:**
- Create: `src/submit/fix.js`
- Test: `tests/fix.test.js`

**Interfaces:**
- Produces: `renderFixHTML(school)`, `renderDisputeHTML(school)`, `buildFixPayload(school, state)`, `buildDisputePayload(school, state)`.

- [ ] **Step 1: Write the failing test**

```js
// tests/fix.test.js
import { describe, it, expect } from 'vitest';
import { renderFixHTML, renderDisputeHTML, buildFixPayload, buildDisputePayload }
  from '../src/submit/fix.js';

const school = { udise: '28133390196', name: 'ST.PETERS HS ANKP' };

describe('renderFixHTML', () => {
  it('invites evidence that the problem is resolved', () => {
    expect(renderFixHTML(school)).toMatch(/fixed/i);
  });
  it('names the school being cleared', () => {
    expect(renderFixHTML(school)).toContain('ST.PETERS HS ANKP');
  });
});

describe('renderDisputeHTML', () => {
  it('lets a school contest the record without naming any individual', () => {
    const html = renderDisputeHTML(school);
    expect(html).toMatch(/record is wrong/i);
    expect(html).not.toMatch(/headmaster|principal|teacher/i);
  });
});

describe('payloads', () => {
  it('builds a fix payload without a review_status', () => {
    const p = buildFixPayload(school, { note: 'rebuilt in June' });
    expect(p.udise_code).toBe('28133390196');
    expect(p.review_status).toBeUndefined();
  });
  it('requires a reason on a dispute', () => {
    expect(buildDisputePayload(school, { reason: 'toilet was rebuilt' }).reason)
      .toBe('toilet was rebuilt');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fix.test.js`
Expected: FAIL — cannot resolve `../src/submit/fix.js`

- [ ] **Step 3: Write minimal implementation**

```js
// src/submit/fix.js
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderFixHTML(school) {
  return `
    <h2>Report a fix</h2>
    <p>If the problem at <strong>${esc(school.name)}</strong> has been fixed,
       send evidence and we will update the pin.</p>
    <textarea id="fix-note" placeholder="What was done, and when?"></textarea>
    <input id="fix-photo" type="file" accept="image/*" capture="environment" />
    <button id="fix-send" type="button">Submit evidence</button>`;
}

export function renderDisputeHTML(school) {
  return `
    <h2>This record is wrong</h2>
    <p>Tell us why the record for <strong>${esc(school.name)}</strong> is
       incorrect. We review every dispute and correct the map when it holds.</p>
    <textarea id="dis-reason" placeholder="Why is this record wrong?"></textarea>
    <input id="dis-contact" type="text" placeholder="Contact (optional)" />
    <button id="dis-send" type="button">Submit dispute</button>`;
}

export function buildFixPayload(school, state) {
  return { udise_code: school.udise, note: state.note ?? null,
           image_path: state.imagePath ?? null };
}

export function buildDisputePayload(school, state) {
  return { udise_code: school.udise, reason: state.reason,
           contact: state.contact ?? null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fix.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add fix and dispute flows"
```

---

## Definition of done for Agent B

- [ ] `npm test` green
- [ ] A photo containing a face comes back visibly and irreversibly pixelated
- [ ] Submission is **impossible** when the detector fails and nothing was blurred
- [ ] Denying location shows correct iOS and Android recovery steps
- [ ] Desktop shows the QR gate; the QR opens the right school on a phone
- [ ] The 11th submission in an hour returns HTTP 429
- [ ] A non-moderator email cannot read pending reports
- [ ] Every approve/reject writes an `audit_log` row
