// src/submit/camera.js
import { normaliseImage, blurRegions, toJpegBlob } from './blur.js';
import { loadDetector, detectFaces, blurGate } from './faces.js';
import { getFix, computeTier, permissionHelpHTML, detectPlatform } from './gps.js';
import { validateSubmission, validateIdentity } from './submit.js';
import { MAX_IMAGE_BYTES } from '../config.js';
import { submitReport } from './api.js';
import { iconEl } from '../lib/icons.js';

/** `onChange` lets a caller own the submit button and the error line —
 *  the three-step form does, because those live outside this slot and
 *  belong to the step, not to the capture. Without it this manages them
 *  itself, which is what the single-page flow still relies on. */
export function mountCapture(slot, school, root, { onChange = null } = {}) {
  const state = {
    canvas: null, blob: null, fix: null, tier: null,
    detectorLoaded: false, facesFound: 0, blurApplied: false,
  };

  slot.innerHTML = `
    <input id="cap" type="file" accept="image/*" capture="environment" hidden />
    <button id="cap-btn" type="button">${iconEl('camera')}<span>Take photo</span></button>
    <div id="cap-preview"></div>
    <div id="gps-slot"></div>
    <details class="fallback">
      <summary>I can\u2019t use the camera right now ${iconEl('chevronDown', 'chevron')}</summary>
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
      gpsSlot.innerHTML = `<p class="ok">${iconEl('checkCircle')}
        Location acquired (\u00b1${Math.round(state.fix.accuracyM)}m)</p>`;
    } catch {
      state.fix = null;
      gpsSlot.innerHTML = `
        <div class="gate gate-gps">
          <span class="gate-badge">${iconEl('pin')}</span>
          <h3>Location access is off</h3>
          <p>We need your GPS to verify you are at this school. This is what
             makes a report verifiable.</p>
          <button id="gps-retry" type="button">${iconEl('pin')}<span>Try Again</span></button>
          <details class="fallback">
            <summary>How to enable ${iconEl('chevronDown', 'chevron')}</summary>
            ${permissionHelpHTML(detectPlatform())}
          </details>
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
        `<p class="warn">${iconEl('warning')} Automatic face check unavailable.
          Drag over any people in the photo to blur them before submitting.</p>`);
      enableManualBrush(canvas, state, recompute);
    }

    state.source = source;
    recompute();
  }

  function recompute() {
    const gate = blurGate(state);
    const finding = root.querySelector('input[name=finding]:checked')?.value ?? null;
    const category = root.querySelector('input[name=category]:checked')?.value ?? null;
    // Recorded onto state, not just read for validation: buildPayload reads
    // these, and without it every submission sent no finding at all against
    // a NOT NULL column — the insert failed every time.
    state.finding = finding;
    state.category = category;
    state.severity = root.querySelector('input[name=severity]:checked')?.value ?? null;
    state.note = root.querySelector('#sub-note')?.value.trim() || null;
    const t = computeTier({
      schoolLat: school.lat, schoolLng: school.lng,
      fixLat: state.fix?.lat ?? null, fixLng: state.fix?.lng ?? null,
      accuracyM: state.fix?.accuracyM ?? null, source: state.source ?? 'camera',
    });
    state.tier = t;
    const { valid, errors } = validateSubmission({
      category, finding, hasPhoto: Boolean(state.canvas), gate,
    });
    // An unlisted school also has to say which school it is. The Edge
    // Function refuses a nameless one anyway; this stops the reporter
    // taking a photo and only then being told.
    if (onChange) {
      // The step owns the button and the message; report the two things
      // only this pipeline knows.
      onChange({
        hasPhoto: Boolean(state.canvas),
        gateOpen: Boolean(gate.canSubmit) && Boolean(state.canvas),
        gateReason: gate.canSubmit ? null : gate.reason,
      });
      return;
    }
    const idErrors = school.kind === 'unlisted' ? validateIdentity(school).errors : [];
    const all = [...idErrors, ...errors];
    errBox.hidden = all.length === 0;
    errBox.innerHTML = all.map((e) => `<p>${e}</p>`).join('');
    sendBtn.disabled = all.length > 0;
  }

  root.addEventListener('input', (e) => {
    if (e.target.id === 'sub-note') recompute();
  });
  root.addEventListener('change', (e) => {
    if (['finding', 'severity', 'category'].includes(e.target.name)) recompute();
  });

  slot.querySelector('#cap-btn').addEventListener('click', () => slot.querySelector('#cap').click());
  slot.querySelector('#cap').addEventListener('change', (e) => handleFile(e.target.files[0], 'camera'));
  slot.querySelector('#gal-btn').addEventListener('click', () => slot.querySelector('#gal').click());
  slot.querySelector('#gal').addEventListener('change', (e) => handleFile(e.target.files[0], 'gallery'));

  sendBtn.addEventListener('click', async () => {
    sendBtn.disabled = true;
    sendBtn.classList.add('is-loading');
    sendBtn.innerHTML = '<span class="btn-label">Submitting\u2026</span>';
    // Encode at successively lower quality until the result fits the byte cap.
    state.blob = null;
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5]) {
      const candidate = await toJpegBlob(state.canvas, q);
      if (candidate.size <= MAX_IMAGE_BYTES) { state.blob = candidate; break; }
      state.blob = candidate;
    }
    await submitReport({ school, state, root });
    root.innerHTML = `<div class="done">
      <span class="done-badge">${iconEl('checkCircle')}</span>
      <h2>Thank you</h2>
      <p>Your report is queued for review. It appears on the map once approved.</p>
    </div>`;
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
