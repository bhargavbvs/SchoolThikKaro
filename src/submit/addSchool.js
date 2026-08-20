// src/submit/addSchool.js
//
// Reporting a school the UDISE+ release does not list.
//
// The release covers the schools the government recorded. A citizen
// standing outside one it missed has, until now, had nowhere to put that.
// This is that place — and it is deliberately a different destination from
// a report on a listed school: it goes to school_submissions, never to the
// figures this site publishes, which are the government's own record and
// are worth nothing the moment they are mixed with anything else.

import { CATEGORIES, FINDINGS, SEVERITIES, validateIdentity } from './submit.js';
import { SOURCE_YEAR } from '../config.js';
import { renderStepper, canAdvance, blockingReason, nextStep, prevStep, isLast } from './wizard.js';

export { validateIdentity };
import { detectPlatform } from './gps.js';
import { iconEl } from '../lib/icons.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function renderAddSchoolHTML() {
  return `<div class="sub-shell">
    <button id="sub-close" type="button" aria-label="Close">${iconEl('x')}</button>
    <h1 class="sub-title">Report a school</h1>
    <p class="sub-sub">Your identity is never recorded. We record where the
      photo was taken, so the report can be checked.</p>
    <ul class="sub-assure">
      <li>· Anonymous</li><li>· No login</li><li>· Published once reviewed</li>
    </ul>
    <div id="sub-stepper"></div>

    <section class="sub-card" data-step="0">
      <h3>Which school?</h3>
      <p class="lede">As it is written on the board outside.</p>
      <p class="sub-school-note">If this school is not in the government’s
        ${esc(SOURCE_YEAR)} release, we publish it separately, marked as reported by
        a citizen — never inside the official figures.</p>
      <fieldset class="sub-identity">
        <legend class="sr-only">School</legend>
        <label class="fld"><span>School name <span class="req">*</span></span>
          <input id="add-name" type="text" autocomplete="off"
                 placeholder="As written on the board outside" /></label>
        <label class="fld"><span>Village or area <span class="req">*</span></span>
          <input id="add-area" type="text" autocomplete="off"
                 placeholder="The village, ward or locality" /></label>
        <label class="fld"><span>District</span>
          <input id="add-district" type="text" autocomplete="off" /></label>
        <label class="fld"><span>UDISE code, if the board shows one</span>
          <input id="add-udise" type="text" inputmode="numeric" autocomplete="off" /></label>
      </fieldset>
    </section>

    <section class="sub-card" data-step="1" hidden>
      <h3>What is wrong?</h3>
      <p class="lede">One thing per report. Send another if there is more.</p>
      <fieldset class="sub-category">
        <legend>What is the problem with? <span class="req">*</span> <span class="legend-hint">choose all that apply</span></legend>
        ${CATEGORIES.map((c) => `
          <label class="opt opt-cat">
            <input type="checkbox" name="category" value="${c.value}" />
            ${iconEl(c.icon, 'opt-icon')}
            <span class="o-label">${esc(c.label)}</span>
          </label>`).join('')}
      </fieldset>
      <fieldset class="sub-findings">
        <legend>What did you find? <span class="req">*</span></legend>
        ${FINDINGS.map((f) => `
          <label class="opt opt-finding">
            <input type="radio" name="finding" value="${f.value}" />
            ${iconEl(f.icon, 'opt-icon')}
            <span class="o-label">${esc(f.label)}</span>
          </label>`).join('')}
      </fieldset>
      <fieldset class="sub-severity">
        <legend>How bad is it?</legend>
        ${SEVERITIES.map((sv) => `
          <label class="opt opt-severity">
            <input type="radio" name="severity" value="${sv.value}" />
            <span class="sev-dot" style="--dot:${sv.dot}"></span>
            <span class="o-text">
              <span class="o-label">${esc(sv.label)}</span>
              <span class="o-hint">${esc(sv.hint)}</span>
            </span>
          </label>`).join('')}
      </fieldset>
      <label class="fld sub-note"><span>Anything else we should know?</span>
        <textarea id="sub-note" rows="3"
          placeholder="Optional — what you saw, in your own words"></textarea></label>
    </section>

    <section class="sub-card" data-step="2" hidden>
      <h3>Photo &amp; submit</h3>
      <p class="lede">${iconEl('warning')} Photograph the facility only. Do not photograph students.</p>
      <div id="capture-slot"></div>
      <p class="anon">${iconEl('shield')} Anonymous — we never record who you are. We do record where the photo was taken, to verify it.</p>
    </section>

    <div id="sub-errors" class="errors" hidden></div>
    <div class="sub-nav">
      <button id="sub-back" type="button" hidden>← Back</button>
      <button id="sub-next" type="button" class="primary">Next →</button>
      <button id="sub-send" type="button" class="primary" hidden>
        <span class="btn-label">Submit anonymously →</span>
      </button>
    </div>
  </div>`;
}

/** The identity a reporter typed, as the shape mountCapture and buildPayload
 *  both expect. lat/lng are deliberately null: there is no recorded location
 *  for a school with no record, which is what forces tier to 'unverified'. */
export function readSchoolIdentity(root) {
  const val = (id) => root.querySelector(id)?.value.trim() ?? '';
  return {
    kind: 'unlisted',
    name: val('#add-name'),
    area: val('#add-area'),
    district: val('#add-district'),
    state: '',
    udise: val('#add-udise'),
    lat: null,
    lng: null,
  };
}

/** Prefills the identity fields from a school the picker found, so a
 *  reader who recognised their school does not retype it. A UDISE match
 *  carries its code through; an OSM one does not have one to carry. */
export function applyCandidate(root, candidate) {
  if (!candidate) return;
  const set = (id, v) => { const el = root.querySelector(id); if (el && v) el.value = v; };
  set('#add-name', candidate.name);
  set('#add-area', candidate.area);
  set('#add-udise', candidate.udise ?? '');
}

export async function openAddSchoolFlow(candidate = null) {
  const root = document.getElementById('submit-root');
  root.hidden = false;
  root.innerHTML = renderAddSchoolHTML();

  applyCandidate(root, candidate);
  const school = readSchoolIdentity(root);
  const sync = () => Object.assign(school, readSchoolIdentity(root));
  root.addEventListener('input', sync);

  // The capture pipeline owns photo, GPS and blur; the wizard only needs to
  // know whether it is satisfied, which it reports through this object.
  const capture = { hasPhoto: false, gateOpen: false, gateReason: null, submit: null };
  let step = 0;

  const cards = [...root.querySelectorAll('.sub-card')];
  const back = root.querySelector('#sub-back');
  const next = root.querySelector('#sub-next');
  const send = root.querySelector('#sub-send');
  const errors = root.querySelector('#sub-errors');

  function stateNow() {
    sync();
    return {
      schoolReady: validateIdentity(school).valid,
      category: root.querySelector('input[name=category]:checked')?.value ?? null,
      categories: [...root.querySelectorAll('input[name=category]:checked')].map((i) => i.value),
      finding: root.querySelector('input[name=finding]:checked')?.value ?? null,
      hasPhoto: capture.hasPhoto,
      gateOpen: capture.gateOpen,
      gateReason: capture.gateReason,
    };
  }

  function render() {
    root.querySelector('#sub-stepper').innerHTML = renderStepper(step);
    cards.forEach((c, i) => { c.hidden = i !== step; });
    back.hidden = step === 0;
    next.hidden = isLast(step);
    send.hidden = !isLast(step);

    const st = stateNow();
    const ok = canAdvance(step, st);
    next.disabled = !ok;
    send.disabled = !ok;
    // The reason only appears once the reader has tried to move on, so an
    // untouched step is not shouting about fields they have not reached.
    const why = blockingReason(step, st);
    errors.hidden = !(errors.dataset.shown === '1' && why);
    errors.innerHTML = why ? `<p>${why}</p>` : '';
  }

  next.addEventListener('click', async () => {
    const st = stateNow();
    if (!canAdvance(step, st)) { errors.dataset.shown = '1'; return render(); }
    errors.dataset.shown = '';
    step = nextStep(step);
    if (step === 2 && !capture.mounted) {
      capture.mounted = true;
      const slot = root.querySelector('#capture-slot');
      if (detectPlatform() === 'desktop') {
        slot.innerHTML = `<div class="gate gate-camera">
          <span class="gate-badge">${iconEl('camera')}</span>
          <h3>Use your phone for this</h3>
          <p>A report needs a photo taken on the spot and the location it was
             taken at. Open this page on the phone you are carrying.</p>
        </div>`;
      } else {
        const { mountCapture } = await import('./camera.js');
        mountCapture(slot, school, root, { onChange: (s) => {
          capture.hasPhoto = s.hasPhoto; capture.gateOpen = s.gateOpen;
          capture.gateReason = s.gateReason; render();
        } });
      }
    }
    render();
    root.scrollTo({ top: 0 });
  });

  back.addEventListener('click', () => {
    errors.dataset.shown = '';
    step = prevStep(step);
    render();
    root.scrollTo({ top: 0 });
  });

  root.addEventListener('change', render);
  root.addEventListener('input', render);
  root.querySelector('#sub-close').addEventListener('click', () => {
    root.hidden = true; root.innerHTML = '';
  });

  render();
}
